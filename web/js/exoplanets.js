// Exoplanet hunter: results of searching TESS light curves, one star at a time.

const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const NS = "http://www.w3.org/2000/svg";

const SIZE_COLOR = { "Earth-size": "#5aa7ff", "super-Earth": "#7be0b0", "mini-Neptune": "#9fe3e8", "Neptune-size": "#6f8cff", "Jupiter-size": "#e9c48a", "too big for a planet": "#ff8a5c" };
const label = (o) => o.name || `TOI-${o.toi}`;

function outcome(o) {
  if (o.disposition === "FP") {
    const caught = o.flags.length > 0 || o.match === null;
    return {
      ok: caught,
      short: caught ? "caught" : "not caught",
      long: caught
        ? `Caught: ${o.flags.length ? o.flags.join(", ") : "no consistent planet signal at the listed period"}. NASA lists this as a false positive too.`
        : "Not caught: it looks like a planet to these checks, but NASA's follow-up showed it isn't. Some false alarms need other telescopes to spot.",
    };
  }
  if (o.disposition === "PC") {
    const good = o.match === "same" && !o.flags.length;
    return {
      ok: good,
      short: good ? "signal confirmed" : o.match === "same" ? "found, but flagged" : "not recovered",
      long: good
        ? `Signal confirmed: the same dip every ${fmt(o.period, 4)} days, and it passes every check here. It stays a candidate until other telescopes confirm it's a planet.`
        : o.match === "same"
          ? `Found at the listed period, but flagged: ${o.flags.join(", ")}.`
          : `The strongest signal here (${fmt(o.period, 3)} days) doesn't match the listed ${fmt(o.catalog.period, 3)} days.`,
    };
  }
  const ok = o.match === "same";
  return {
    ok,
    short: ok ? "found" : o.match ? `found at ${o.match} the period` : "missed",
    long: ok
      ? `Found at the published period: ${fmt(o.period, 4)} days, against NASA's ${fmt(o.catalog.period, 4)}.`
      : o.match
        ? `Found the right signal, but at ${o.match} the published period (${fmt(o.period, 3)} vs ${fmt(o.catalog.period, 3)} days).`
        : `Missed: the strongest signal is at ${fmt(o.period, 3)} days, not the published ${fmt(o.catalog.period, 3)}. The star's own flickering is stronger than the planet's dip here.`,
  };
}

function chart(host, { width, height = 220, xDomain, yDomain, xLabel, yFmt = (v) => v, xFmt = (v) => fmt(v, Math.abs(v) < 10 ? 1 : 0), logX = false }) {
  host.innerHTML = "";
  const m = { t: 10, r: 12, b: 30, l: 56 };
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  host.appendChild(svg);
  const fx = logX ? Math.log : (v) => v;
  const X = (v) => m.l + ((fx(v) - fx(xDomain[0])) / (fx(xDomain[1]) - fx(xDomain[0]))) * (width - m.l - m.r);
  const Y = (v) => height - m.b - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * (height - m.t - m.b);
  const add = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  const ticks = (lo, hi, n) => {
    const raw = (hi - lo) / n;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const s = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => (hi - lo) / k <= n) || raw;
    const out = [];
    for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-12; v += s) out.push(+v.toFixed(12));
    return out;
  };
  for (const v of ticks(yDomain[0], yDomain[1], 4)) {
    add("line", { x1: m.l, x2: width - m.r, y1: Y(v), y2: Y(v), stroke: "rgba(150,170,255,0.12)" });
    add("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", fill: "#7c83a6", "font-size": 11 }, yFmt(v));
  }
  const xt = logX ? [0.5, 1, 2, 3, 5, 8, 13].filter((v) => v >= xDomain[0] && v <= xDomain[1]) : ticks(xDomain[0], xDomain[1], 6);
  for (const v of xt) add("text", { x: X(v), y: height - 13, "text-anchor": "middle", fill: "#7c83a6", "font-size": 11 }, xFmt(v));
  add("text", { x: width - m.r, y: height - 1, "text-anchor": "end", fill: "#7c83a6", "font-size": 10.5 }, xLabel);
  return { svg, X, Y, add, m, H: height };
}

function checks(o) {
  const glow = o.glow ? ` A faint dip half an orbit later (${fmt(o.secondary_ppm)} ppm) is the planet's own glow vanishing behind its star.` : "";
  return [
    [o.snr >= 7.1, "Signal strength", `Signal-to-noise ${fmt(o.snr)} across ${o.n_transits} transits (needs 7.1 or more).`],
    [o.odd_even_sigma <= 3, "Odd vs even transits", `Odd ${fmt(o.odd_depth_ppm)} ppm, even ${fmt(o.even_depth_ppm)} ppm: ${o.odd_even_sigma <= 3 ? "the same, as a planet's should be" : "different, a sign of two stars eclipsing each other"} (${fmt(o.odd_even_sigma, 1)}σ).`],
    [!o.flags.includes("deep secondary eclipse"), "Secondary eclipse", o.flags.includes("deep secondary eclipse") ? `A deep second dip half an orbit later (${fmt(o.secondary_ppm)} ppm): two stars, not a planet.` : `No deep second dip half an orbit later.${glow}`],
    [o.shape == null || o.shape >= 0.6, "Dip shape", o.shape == null ? "Too few points to judge the shape." : `${o.shape >= 0.6 ? "Flat-bottomed (U-shaped), like a planet crossing the star" : "V-shaped: either a planet only grazing the star's edge, or two stars grazing each other"} (edge-to-middle depth ${fmt(o.shape, 2)}; planets usually 0.7 or more).`],
    [o.radius_re <= 22, "Size", `${fmt(o.radius_re, 1)} Earth radii: ${o.radius_re <= 22 ? "planet-sized" : "too big to be a planet, probably a small star"}.`],
  ];
}

export function render(data, $, showTip, hideTip) {
  const T = data.targets;
  const s = data.summary;
  const pts = T.reduce((a, o) => a + o.points, 0);
  $("#exoStats").innerHTML = [
    [`${s.known_recovered} of ${s.known_total}`, "known planets found at their published period"],
    [`${s.candidates_confirmed_signal} of ${s.candidates}`, "unconfirmed candidates: signal independently confirmed"],
    [`${s.fp_flagged} of ${s.fp_total}`, "known false alarms caught by the checks"],
    [fmt(pts), `brightness measurements searched, from ${T.length} stars`],
  ]
    .map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`)
    .join("");

  const groups = [
    ["Confirmed planets: the test", T.filter((o) => o.disposition === "KP" || o.disposition === "CP")],
    ["Unconfirmed candidates", T.filter((o) => o.disposition === "PC")],
    ["Known false alarms", T.filter((o) => o.disposition === "FP")],
  ];
  $("#exoPicker").innerHTML = groups
    .map(
      ([title, list]) =>
        `<h4>${title}</h4>` +
        list
          .map((o) => {
            const out = outcome(o);
            return `<button data-toi="${esc(o.toi)}"><span class="ball" style="background:${SIZE_COLOR[o.size_class] || "#999"}"></span>
              <span class="t">${esc(label(o))}</span><span class="ok" style="color:${out.ok ? "var(--good)" : "var(--hot)"}">${out.ok ? "✓" : "✕"}</span>
              <span class="s">${esc(out.short)} · ${fmt(o.period, 2)} d · ${esc(o.size_class)}</span></button>`;
          })
          .join(""),
    )
    .join("");

  const show = (toi) => {
    const o = T.find((x) => x.toi === toi);
    document.querySelectorAll("#exoPicker button").forEach((b) => b.setAttribute("aria-current", b.dataset.toi === toi));
    const out = outcome(o);
    const st = o.star;
    const host = $("#exoDetail");
    const disp = { KP: "known planet", CP: "confirmed planet", PC: "planet candidate", FP: "false positive" }[o.disposition];
    host.innerHTML = `
      <h3>${esc(label(o))}</h3>
      <p class="exo-sub">TOI-${esc(o.toi)} · TIC ${o.tic} · NASA lists it as a ${disp} · star ${fmt(st.radius_rsun, 2)}× the Sun's size, ${fmt(st.teff)} K · TESS sectors ${o.sectors.join(", ")}</p>
      <p class="cond" style="color:${out.ok ? "var(--good)" : "var(--hot)"}">${esc(out.long)}</p>
      <div class="tiles">
        <div class="tile"><b>${fmt(o.period, 3)} d</b><span>one orbit (NASA: ${fmt(o.catalog.period, 3)})</span></div>
        <div class="tile"><b>${fmt(o.depth_ppm / 1e4, 2)}%</b><span>dimmer during transit</span></div>
        <div class="tile"><b>${fmt(o.duration_h, 1)} h</b><span>transit length</span></div>
        <div class="tile"><b>${fmt(o.radius_re, 1)} R⊕</b><span>${esc(o.size_class)}</span></div>
      </div>
      <p class="chart-title">The dip: every transit stacked on top of each other</p>
      <div id="chFold"></div>
      <p class="chart-title">The search: how well each possible orbit length fits</p>
      <div id="chPg"></div>
      <p class="chart-title">The whole light curve (${fmt(o.span_days)} days), with each transit marked</p>
      <div id="chLc"></div>
      <p class="chart-title">How big it is (Earth radii)</p>
      <div class="sizes" id="sizes"></div>
      <p class="chart-title">The checks</p>
      <ul class="checks">${checks(o)
        .map(([pass, t, d]) => `<li class="${pass ? "pass" : "fail"}"><b>${t}</b>${d}</li>`)
        .join("")}</ul>`;
    const width = Math.max(320, host.clientWidth - 32);

    // folded transit: faint raw points, binned points, and the box model
    const fy = o.folded.map((p) => p[1]);
    const lo = Math.min(...fy, 1 - o.depth * 1.15);
    const hi = Math.max(...fy) + o.depth * 0.2;
    const pad = (hi - lo) * 0.2;
    const xr = Math.max(...o.folded.map((p) => Math.abs(p[0])));
    const f = chart($("#chFold"), { width, xDomain: [-xr, xr], yDomain: [lo - pad, hi + pad / 2], xLabel: "hours from the middle of the transit", yFmt: (v) => `${fmt((v - 1) * 100, 2)}%` });
    const raw = o.raw.filter(([x, y]) => Math.abs(x) <= xr && y >= lo - pad && y <= hi + pad / 2);
    f.add("path", { d: raw.map(([x, y]) => `M${f.X(x).toFixed(1)},${f.Y(y).toFixed(1)}h0.01`).join(""), stroke: "rgba(180,186,214,0.28)", "stroke-width": 2.2, "stroke-linecap": "round" });
    const half = o.duration_h / 2;
    f.add("path", { d: `M${f.X(-xr)},${f.Y(1)}H${f.X(-half)}V${f.Y(1 - o.depth)}H${f.X(half)}V${f.Y(1)}H${f.X(xr)}`, fill: "none", stroke: "rgba(127,168,255,0.85)", "stroke-width": 1.6 });
    for (const [x, y] of o.folded) f.add("circle", { cx: f.X(x), cy: f.Y(y), r: 3, fill: "#ffc857" });
    f.svg.onmousemove = (e) => {
      const r = f.svg.getBoundingClientRect();
      const hx = ((e.clientX - r.left) / r.width) * width;
      const near = o.folded.reduce((a, p) => (Math.abs(f.X(p[0]) - hx) < Math.abs(f.X(a[0]) - hx) ? p : a));
      showTip(e, `${fmt(near[0], 2)} h from mid-transit<br>${fmt((near[1] - 1) * 100, 3)}% brightness change`);
    };
    f.svg.onmouseleave = hideTip;

    // periodogram, with NASA's period marked
    const pmax = Math.max(...o.periodogram.map((p) => p[1]));
    const pd = [o.periodogram[0][0], o.periodogram[o.periodogram.length - 1][0]];
    const g = chart($("#chPg"), { width, height: 170, xDomain: pd, yDomain: [0, pmax * 1.12], xLabel: "orbit length tried (days)", logX: true, yFmt: (v) => fmt(v) });
    g.add("path", { d: o.periodogram.map(([x, y], i) => `${i ? "L" : "M"}${g.X(x).toFixed(1)},${g.Y(y).toFixed(1)}`).join(""), fill: "none", stroke: "#7fa8ff", "stroke-width": 1.2 });
    if (o.catalog.period >= pd[0] && o.catalog.period <= pd[1]) {
      g.add("line", { x1: g.X(o.catalog.period), x2: g.X(o.catalog.period), y1: g.m.t, y2: g.H - g.m.b, stroke: "#7be0b0", "stroke-dasharray": "4 4" });
      g.add("text", { x: g.X(o.catalog.period) + 5, y: g.m.t + 12, fill: "#7be0b0", "font-size": 11 }, "NASA's period");
    }
    g.add("text", { x: g.X(o.period), y: g.Y(pmax) - 4, fill: "#ffc857", "font-size": 11, "text-anchor": "middle" }, "▼ best");

    // whole light curve
    const lc = o.lightcurve;
    const ly = lc.map((p) => p[1]);
    const c = chart($("#chLc"), { width, height: 150, xDomain: [lc[0][0], lc[lc.length - 1][0]], yDomain: [Math.min(...ly), Math.max(...ly)], xLabel: "days (TESS clock)", yFmt: (v) => `${fmt((v - 1) * 100, 1)}%`, xFmt: (v) => fmt(v) });
    c.add("path", { d: lc.map(([x, y]) => `M${c.X(x).toFixed(1)},${c.Y(y).toFixed(1)}h0.01`).join(""), stroke: "rgba(180,186,214,0.5)", "stroke-width": 1.6, "stroke-linecap": "round" });
    for (const t of o.transits) c.add("line", { x1: c.X(t), x2: c.X(t), y1: c.H - c.m.b, y2: c.H - c.m.b - 8, stroke: "#ffc857", "stroke-width": 2 });

    // sizes next to Earth, Neptune and Jupiter
    const sizes = [["Earth", 1, "#5aa7ff"], ["Neptune", 3.88, "#6f8cff"], ["Jupiter", 11.2, "#e9c48a"], [label(o), o.radius_re, SIZE_COLOR[o.size_class] || "#999"]];
    const big = Math.max(...sizes.map((x) => x[1]));
    $("#sizes").innerHTML = sizes.map(([n, r, col]) => `<div><i style="width:${Math.max(4, (r / big) * 90)}px;height:${Math.max(4, (r / big) * 90)}px;background:${col}"></i>${esc(n)} · ${fmt(r, 1)}</div>`).join("");
  };

  $("#exoPicker").onclick = (e) => {
    const b = e.target.closest("button[data-toi]");
    if (b) show(b.dataset.toi);
  };
  const first = T.find((o) => o.disposition === "PC" && o.match === "same" && !o.flags.length) || T[0];
  if (first) show(first.toi);
}
