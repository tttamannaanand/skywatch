"""Exoplanet hunter: search real TESS light curves for transiting planets.

    python pipeline/hunt.py            # writes web/data/exoplanets.json (takes a few minutes)

For each target star:
1. download TESS 2-minute light curves (SPOC pipeline) from NASA's MAST archive
2. flatten out the star's own slow variability, clip flares and outliers
3. search every period from 0.5 to 13 days with box least squares (BLS)
4. measure the dip: depth, duration, signal-to-noise, planet size from the star's radius
5. vet it: are odd and even transits the same depth? is there a secondary eclipse?
   Either one points to two stars eclipsing each other, not a planet.
6. compare with what NASA's Exoplanet Archive says about this target

Targets are TESS Objects of Interest: confirmed planets (to check the hunter works),
planet candidates (still unconfirmed), and known false positives (to check the vetting).
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from astropy.timeseries import BoxLeastSquares

warnings.filterwarnings("ignore")
OUT = Path(__file__).resolve().parent.parent / "web" / "data"
TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
R_EARTH_PER_SUN = 109.076


def tap(query):
    r = requests.get(TAP, params={"query": query, "format": "json"}, timeout=90)
    r.raise_for_status()
    return r.json()


def pick_targets(n_known=12, n_cand=10, n_fp=4):
    cols = "toi,tid,tfopwg_disp,pl_orbper,pl_trandep,pl_trandurh,pl_rade,pl_eqt,st_rad,st_teff,st_tmag,ra,dec"
    base = f"select {cols} from toi where pl_orbper between 0.7 and 9 and pl_trandep > 3000 and st_tmag < 10.5 and st_rad is not null"
    known = tap(f"{base} and tfopwg_disp in ('KP','CP') order by st_tmag")[:n_known]
    cand = tap(f"{base} and tfopwg_disp = 'PC' order by st_tmag")[:n_cand]
    fps = tap(f"{base} and tfopwg_disp = 'FP' order by st_tmag")[:n_fp]
    return known + cand + fps


def confirmed_name(tic):
    """The planet's published name, if NASA's archive lists it as confirmed."""
    try:
        rows = tap(f"select pl_name,pl_orbper,pl_rade,disc_year from ps where tic_id = 'TIC {tic}' and default_flag = 1")
        return rows
    except Exception:
        return []


def load_lightcurve(tic, max_sectors=2):
    import lightkurve as lk

    res = lk.search_lightcurve(f"TIC {tic}", mission="TESS", author="SPOC", exptime=120)
    if len(res) == 0:
        return None, []
    res = res[-max_sectors:]  # the most recent sectors
    lcs = res.download_all(quality_bitmask="default", flux_column="pdcsap_flux")
    sectors = [int(lc.meta.get("SECTOR", 0)) for lc in lcs]
    lc = lcs.stitch().remove_nans()
    return lc, sectors


DURATIONS = np.array([0.03, 0.05, 0.08, 0.11, 0.15, 0.2, 0.25])


def flatten(lc, window):
    flat = lc.flatten(window_length=window, polyorder=2, break_tolerance=10).remove_outliers(sigma_upper=4, sigma_lower=20)
    t, f = flat.time.value, flat.flux.value
    ok = np.isfinite(t) & np.isfinite(f)
    return t[ok], f[ok]


def bls_search(t, f):
    span = t.max() - t.min()
    bls = BoxLeastSquares(t, f)
    max_p = min(13.0, span / 2.05)  # need at least two transits
    periods = np.exp(np.linspace(np.log(0.5), np.log(max_p), 20000))
    res = bls.power(periods, DURATIONS, objective="snr")
    # signal detection efficiency: how far the best peak stands above the rest
    sde = float((res.power.max() - np.median(res.power)) / np.std(res.power))
    return bls, periods, res, sde


def search(lc, catalog_period):
    # Two flattenings: a gentle one (1.25 days) and a tighter one (0.5 days) for stars that
    # vary quickly, such as young spotty stars. Keep whichever gives the clearer peak.
    tries = []
    for window in (901, 361):
        t, f = flatten(lc, window)
        bls, periods, res, sde = bls_search(t, f)
        tries.append((sde, window, t, f, bls, periods, res))
    sde, window, t, f, bls, periods, res = max(tries, key=lambda x: x[0])
    span = t.max() - t.min()
    i = int(np.argmax(res.power))
    P, t0, dur, depth = float(res.period[i]), float(res.transit_time[i]), float(res.duration[i]), float(res.depth[i])
    # If an equally deep dip sits half an orbit later, the real period is half what BLS picked.
    for _ in range(2):
        half = bls.compute_stats(P, dur, t0)
        d_o, d_e = half["depth_odd"][0], half["depth_even"][0]
        sec = bls.transit_mask(t, P, dur, t0 + P / 2)
        sec_d = np.median(f[~bls.transit_mask(t, P, dur, t0) & ~sec]) - np.median(f[sec]) if sec.sum() > 5 else 0
        if sec_d > 0.6 * depth and P / 2 >= 0.5:
            P /= 2
            depth = float(np.mean([d_o, d_e, sec_d]))
        else:
            break
    stats = bls.compute_stats(P, dur, t0)
    in_tr = bls.transit_mask(t, P, dur, t0)
    noise = np.std(f[~in_tr])
    n_in = int(in_tr.sum())
    snr = depth / noise * np.sqrt(max(n_in, 1))
    d_odd, d_even = (float(x) for x in stats["depth_odd"][:1] + stats["depth_even"][:1]) if False else (float(stats["depth_odd"][0]), float(stats["depth_even"][0]))
    e_odd, e_even = float(stats["depth_odd"][1]), float(stats["depth_even"][1])
    odd_even_sigma = abs(d_odd - d_even) / np.hypot(e_odd, e_even) if np.isfinite(e_odd + e_even) and (e_odd + e_even) > 0 else 0.0
    # secondary eclipse: a dip half an orbit later
    sec_mask = bls.transit_mask(t, P, dur, t0 + P / 2)
    sec_depth = float(np.median(f[~in_tr & ~sec_mask]) - np.median(f[sec_mask])) if sec_mask.sum() > 5 else 0.0
    sec_sigma = sec_depth / (noise / np.sqrt(max(int(sec_mask.sum()), 1)))

    # phase-folded light curve around the transit, binned, for the chart
    phase = ((t - t0 + 0.5 * P) % P) - 0.5 * P  # days from mid-transit
    window = min(P / 2, max(3 * dur, 0.25))
    sel = np.abs(phase) < window
    edges = np.linspace(-window, window, 121)
    idx = np.digitize(phase[sel], edges) - 1
    binned = []
    for k in range(len(edges) - 1):
        m = idx == k
        if m.sum() >= 3:
            binned.append([round(float((edges[k] + edges[k + 1]) / 2 * 24), 3), round(float(np.median(f[sel][m])), 6)])
    # a light sample of the raw (flattened) points in the window, for texture
    rng = np.random.default_rng(0)
    pts = np.flatnonzero(sel)
    pts = rng.choice(pts, size=min(700, len(pts)), replace=False)
    raw = [[round(float(phase[j] * 24), 3), round(float(f[j]), 5)] for j in pts]
    # periodogram, thinned for the page
    step = max(1, len(periods) // 700)
    pg = [[round(float(p), 4), round(float(s), 2)] for p, s in zip(res.period[::step], res.power[::step], strict=False)]
    # whole light curve, thinned, with transit times marked
    stepl = max(1, len(t) // 1500)
    full = [[round(float(a), 4), round(float(b), 5)] for a, b in zip(t[::stepl], f[::stepl], strict=False)]
    transits = [round(float(x), 4) for x in np.arange(t0 - P * np.floor((t0 - t.min()) / P), t.max(), P)]

    match = None
    if catalog_period:
        for mult, label in ((1, "same"), (2, "half"), (0.5, "double"), (3, "third")):
            if abs(P * mult - catalog_period) / catalog_period < 0.01:
                match = label
                break
    return {
        "period": P, "t0": t0, "duration_h": dur * 24, "depth": depth, "depth_ppm": depth * 1e6,
        "snr": float(snr), "n_transits": len(transits), "noise_ppm": float(noise * 1e6),
        "odd_depth_ppm": d_odd * 1e6, "even_depth_ppm": d_even * 1e6, "odd_even_sigma": float(odd_even_sigma),
        "secondary_ppm": sec_depth * 1e6, "secondary_sigma": float(sec_sigma),
        "match": match, "folded": binned, "raw": raw, "periodogram": pg, "lightcurve": full, "transits": transits,
        "span_days": float(span), "points": int(len(t)), "sde": sde, "flatten_days": round(window * 2 / 60 / 24, 2),
    }


def dip_shape(folded, duration_h):
    """How flat-bottomed the dip is: depth near the edges of the transit divided by depth in
    the middle. Planets make U-shaped dips (about 0.7-1); two stars grazing each other make
    V-shaped ones (well under 0.6)."""
    h = duration_h / 2
    inner = [y for x, y in folded if abs(x) < h * 0.35]
    outer = [y for x, y in folded if h * 0.55 < abs(x) < h * 0.9]
    if not inner or not outer:
        return None
    di, do = 1 - float(np.mean(inner)), 1 - float(np.mean(outer))
    return do / di if di > 0 else None


def size_class(re):
    if re < 1.25:
        return "Earth-size"
    if re < 2:
        return "super-Earth"
    if re < 4:
        return "mini-Neptune"
    if re < 6:
        return "Neptune-size"
    if re < 22:  # hot Jupiters can puff up to about twice Jupiter's size
        return "Jupiter-size"
    return "too big for a planet"


def verdict(r, disp):
    flags = []
    if r["snr"] < 7.1:
        flags.append("weak signal")
    if r["odd_even_sigma"] > 3:
        flags.append("odd and even dips differ")
    if r["secondary_sigma"] > 3.5 and r["secondary_ppm"] > 0.15 * r["depth_ppm"]:
        flags.append("deep secondary eclipse")
    if r["radius_re"] > 22:
        flags.append("too big for a planet")
    if r.get("shape") is not None and r["shape"] < 0.6:
        flags.append("V-shaped dip")
    return flags


def main(limit=None):
    targets = pick_targets()
    if limit:
        targets = targets[:limit]
    out = []
    for k, tg in enumerate(targets, 1):
        tic = tg["tid"]
        print(f"[{k}/{len(targets)}] TOI {tg['toi']} (TIC {tic}, {tg['tfopwg_disp']})", flush=True)
        try:
            lc, sectors = load_lightcurve(tic)
            if lc is None:
                print("   no 2-minute data")
                continue
            r = search(lc, tg["pl_orbper"])
        except Exception as e:  # one bad download shouldn't stop the hunt
            print(f"   failed: {e}")
            continue
        r["radius_re"] = float(np.sqrt(max(r["depth"], 0)) * tg["st_rad"] * R_EARTH_PER_SUN)
        r["size_class"] = size_class(r["radius_re"])
        r["shape"] = dip_shape(r["folded"], r["duration_h"])
        r["flags"] = verdict(r, tg["tfopwg_disp"])
        # a small, significant dip half an orbit later: the planet's own glow disappearing behind the star
        r["glow"] = bool(r["secondary_sigma"] > 3.5 and 0 < r["secondary_ppm"] <= 0.15 * r["depth_ppm"])
        planets = confirmed_name(tic) if tg["tfopwg_disp"] in ("KP", "CP") else []
        name = next((p["pl_name"] for p in planets if abs(p["pl_orbper"] - tg["pl_orbper"]) / tg["pl_orbper"] < 0.02), None)
        out.append({
            "toi": tg["toi"], "tic": tic, "name": name, "disposition": tg["tfopwg_disp"], "sectors": sectors,
            "star": {"radius_rsun": tg["st_rad"], "teff": tg["st_teff"], "tmag": tg["st_tmag"], "ra": tg["ra"], "dec": tg["dec"]},
            "catalog": {"period": tg["pl_orbper"], "depth_ppm": tg["pl_trandep"], "duration_h": tg["pl_trandurh"], "radius_re": tg["pl_rade"], "eq_temp_k": tg["pl_eqt"]},
            **r,
        })
        print(f"   found P={r['period']:.4f} d (catalog {tg['pl_orbper']:.4f}, match: {r['match']}), depth {r['depth_ppm']:.0f} ppm, "
              f"SNR {r['snr']:.1f}, R={r['radius_re']:.1f} R⊕, flags: {r['flags'] or 'none'}", flush=True)

    known = [o for o in out if o["disposition"] in ("KP", "CP")]
    fps = [o for o in out if o["disposition"] == "FP"]
    summary = {
        "known_total": len(known),
        "known_recovered": sum(o["match"] == "same" for o in known),
        "known_recovered_any": sum(o["match"] is not None for o in known),
        "candidates": sum(o["disposition"] == "PC" for o in out),
        "candidates_confirmed_signal": sum(o["disposition"] == "PC" and o["match"] == "same" and not o["flags"] for o in out),
        "fp_total": len(fps),
        "fp_flagged": sum(bool(o["flags"]) or o["match"] is None for o in fps),
        "known_flagged": sum(bool(o["flags"]) for o in known),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "exoplanets.json").write_text(json.dumps({"made": datetime.now(timezone.utc).isoformat(timespec="seconds"), "summary": summary, "targets": out}))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
    _ = urllib.parse
