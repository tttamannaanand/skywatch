"""Daily NASA data for the site: picture of the day, close asteroids, Mars weather, Earth from EPIC.

    python pipeline/fetch_daily.py      # writes web/data/{apod,asteroids,mars,epic}.json

JPL's asteroid APIs don't allow browser requests, so this runs once a day (GitHub Actions)
and the page reads the saved JSON. Set NASA_API_KEY for a higher rate limit; DEMO_KEY works.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "web" / "data"
KEY = os.environ.get("NASA_API_KEY", "DEMO_KEY")
S = requests.Session()
S.headers["User-Agent"] = "skywatch (github.com/tttamannaanand/skywatch)"

AU_KM = 149_597_870.7
LD_KM = 384_400  # mean Earth-Moon distance


def get(url, params=None, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
            print(f"  {url} -> {r.status_code}", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  {url} -> {e}", file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None


def save(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False))
    print(f"wrote {name}.json")


# ---------------------------------------------------------------- APOD


APOD_FEED = "https://science.nasa.gov/wp-json/wp/v2/image-article"


def parse_apod_post(p):
    """Same parsing as the page: NASA moved APOD to science.nasa.gov and the old API now
    returns the NASA logo, so read the real posts from the new site's feed."""
    import html as h
    import re

    raw = p["content"]["rendered"]
    text = re.sub(r"\s+", " ", h.unescape(re.sub(r"<[^>]+>", " ", raw)))
    text = re.sub(r"([(])\s+", r"\1", re.sub(r"\s+([,;.)])", r"\1", text))
    title = re.sub(r"^APOD:[^–-]*[–-]\s*", "", h.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"]))).strip()
    expl = re.search(r"Explanation:\s*(.*?)\s*(?:Tomorrow.s picture:|Date:)", text)
    credit = re.search(r"Credit(?: & Copyright)?:\s*(.*?)\s*(?:Authors|Explanation|$)", text)
    iframe = next((u for u in re.findall(r'<iframe[^>]+src="([^"]+)"', raw) if re.search("youtube|vimeo", u)), None)
    asset = lambda ext: (re.search(rf"https://assets\.science\.nasa\.gov/content/dam/[^\"'\s?]+\.(?:{ext})", raw, re.I) or [None])[0]  # noqa: E731
    mp4, img = asset("mp4|webm"), asset("jpe?g|png|gif|webp")
    video = iframe or mp4
    return {"date": p["date"][:10], "title": title, "explanation": expl.group(1) if expl else "", "copyright": credit.group(1).strip() if credit else "",
            "url": video or img, "hdurl": img, "media_type": "video" if video else "image", "thumbnail_url": img, "link": p["link"]}


def apod(count=10):
    posts = get(APOD_FEED, {"categories": 22766, "per_page": count, "_fields": "date,link,title,content"}) or []
    items = [i for i in (parse_apod_post(p) for p in posts) if i["url"]]
    if not items:
        print("  no APOD posts", file=sys.stderr)
        return
    save("apod", {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source": "science.nasa.gov/apod", "items": items})


# ---------------------------------------------------------------- asteroids


def diameter_m(h, albedo):
    """Size from absolute magnitude H for a given albedo (Chesley et al.)."""
    return 1329.0 / math.sqrt(albedo) * 10 ** (-h / 5) * 1000


def impact(d_m, v_kms, density=2600):
    """Energy if it hit: kinetic energy in megatons of TNT, and a rough crater size.

    Crater from the simple scaling in Collins, Melosh & Marcus (2005) for a 45-degree
    impact into rock; only meaningful for objects big enough to reach the ground."""
    mass = density * math.pi / 6 * d_m**3
    joules = 0.5 * mass * (v_kms * 1000) ** 2
    mt = joules / 4.184e15
    g, rho_t = 9.81, 2500
    crater_m = 1.161 * (density / rho_t) ** (1 / 3) * d_m**0.78 * (v_kms * 1000) ** 0.44 * g**-0.22 * math.sin(math.radians(45)) ** (1 / 3) * 1.25
    return mt, crater_m


def asteroids(days_ahead=60, days_back=7, max_au=0.05, limit=45):
    params = {"date-min": (date.today() - timedelta(days=days_back)).isoformat(), "date-max": (date.today() + timedelta(days=days_ahead)).isoformat(),
              "dist-max": str(max_au), "sort": "dist", "diameter": "true", "fullname": "true"}
    cad = get("https://ssd-api.jpl.nasa.gov/cad.api", params)
    if not cad:
        return
    f = cad["fields"]
    rows = [dict(zip(f, r, strict=False)) for r in cad["data"]][:limit]
    out = []
    for r in rows:
        des = r["des"]
        sb = get("https://ssd-api.jpl.nasa.gov/sbdb.api", {"sstr": des, "phys-par": "true"})
        time.sleep(0.4)
        el = {}
        pha = False
        if sb and "orbit" in sb:
            el = {e["name"]: float(e["value"]) for e in sb["orbit"]["elements"] if e.get("value") not in (None, "")}
            el["epoch"] = float(sb["orbit"]["epoch"])
            pha = sb.get("object", {}).get("pha", False)
        h = float(r["h"]) if r.get("h") else None
        dist_au = float(r["dist"])
        v = float(r["v_rel"])
        known_d = float(r["diameter"]) * 1000 if r.get("diameter") else None
        d_lo = diameter_m(h, 0.25) if h is not None else None
        d_hi = diameter_m(h, 0.05) if h is not None else None
        d_mid = known_d or (diameter_m(h, 0.14) if h is not None else None)
        mt, crater = impact(d_mid, v) if d_mid else (None, None)
        out.append({
            "des": des,
            "name": (r.get("fullname") or des).strip(),
            "time": r["cd"],
            "jd": float(r["jd"]),
            "dist_au": dist_au,
            "dist_km": dist_au * AU_KM,
            "dist_ld": dist_au * AU_KM / LD_KM,
            "v_kms": v,
            "h": h,
            "diameter_m": d_mid,
            "diameter_range_m": [d_lo, d_hi] if d_lo else None,
            "diameter_measured": known_d is not None,
            "energy_mt": mt,
            "crater_m": crater if d_mid and d_mid > 50 else None,
            "pha": pha,
            "elements": {k: el.get(k) for k in ("e", "a", "q", "i", "om", "w", "ma", "tp", "per", "n", "epoch")},
        })
        print(f"  {des}: {out[-1]['dist_ld']:.2f} LD")
    save("asteroids", {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "window_days": [-days_back, days_ahead], "max_au": max_au, "items": out})


# ---------------------------------------------------------------- Mars


def mars():
    d = get("https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json")
    if not d:
        return
    sols = []
    for s in d.get("soles", [])[:60]:
        def num(k):
            try:
                return float(s[k])
            except (KeyError, ValueError, TypeError):
                return None
        sols.append({"sol": int(s["sol"]), "date": s["terrestrial_date"], "ls": num("ls"), "min": num("min_temp"), "max": num("max_temp"),
                     "pressure": num("pressure"), "sky": s.get("atmo_opacity"), "uv": s.get("local_uv_irradiance_index"),
                     "sunrise": s.get("sunrise"), "sunset": s.get("sunset"), "ground_min": num("min_gts_temp"), "ground_max": num("max_gts_temp")})
    save("mars", {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source": "Curiosity rover, REMS weather station (Gale Crater)", "sols": sols})


# ---------------------------------------------------------------- Earth (EPIC)


def epic():
    items = get("https://epic.gsfc.nasa.gov/api/natural") or get(f"https://api.nasa.gov/EPIC/api/natural?api_key={KEY}")
    if not items:
        return
    out = []
    for it in items[:12]:
        d = datetime.strptime(it["date"], "%Y-%m-%d %H:%M:%S")
        url = f"https://epic.gsfc.nasa.gov/archive/natural/{d:%Y/%m/%d}/jpg/{it['image']}.jpg"
        c = it.get("centroid_coordinates", {})
        out.append({"date": it["date"], "url": url, "lat": c.get("lat"), "lon": c.get("lon")})
    save("epic", {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": out})


if __name__ == "__main__":
    which = set(sys.argv[1:]) or {"apod", "asteroids", "mars", "epic"}
    for name in ("apod", "asteroids", "mars", "epic"):
        if name in which:
            try:
                globals()[name]()
            except Exception as e:  # one feed failing shouldn't stop the others
                print(f"{name} failed: {e}", file=sys.stderr)
