import { AU_KM, PLANETS, orbitPath, planetPosition } from "./orbits.js";
import { FACTS, now as nowFacts, season, toF } from "./planets.js";

const $ = (s) => document.querySelector(s);
const tip = $("#tip");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NASA_KEY = "DEMO_KEY";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

function showTip(e, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14;
  let y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => (tip.hidden = true);

function segmented(host, options, value, onChange) {
  host.innerHTML = options.map(([v, label]) => `<button role="radio" aria-checked="${v === value}" data-v="${v}">${label}</button>`).join("");
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    host.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", x === b));
    onChange(b.dataset.v);
  });
}

const store = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/* ---------------- stars ---------------- */
function stars() {
  const c = $("#stars");
  const ctx = c.getContext("2d");
  let pts = [];
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = Array.from({ length: Math.round((innerWidth * innerHeight) / 5000) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.1 + 0.2, p: Math.random() * 6.28, s: 0.4 + Math.random() }));
  };
  const draw = (t) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of pts) {
      ctx.globalAlpha = reduced ? 0.6 : 0.35 + 0.35 * Math.sin(t / 1000 * s.s + s.p);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    if (!reduced) requestAnimationFrame(draw);
  };
  resize();
  addEventListener("resize", resize);
  requestAnimationFrame(draw);
}

/* ---------------- clock ---------------- */
function clock() {
  const tick = () => ($("#clock").textContent = new Date().toUTCString().replace(" GMT", " UTC").slice(5, 22) + " UTC");
  tick();
  setInterval(tick, 1000);
}

/* ---------------- picture of the day ---------------- */
const isoDay = (d) => d.toISOString().slice(0, 10);

// NASA moved APOD to science.nasa.gov, and the old api.nasa.gov endpoint now returns the
// NASA logo for every day. The new site's WordPress feed has the real pictures.
const APOD_FEED = "https://science.nasa.gov/wp-json/wp/v2/image-article?categories=22766&per_page=10&_fields=date,link,title,content";

export function parseApodPost(p) {
  const doc = new DOMParser().parseFromString(p.content.rendered, "text/html");
  const text = doc.body.textContent.replace(/\s+/g, " ").replace(/\s+([,;.)])/g, "$1").replace(/([(])\s+/g, "$1");
  const title = new DOMParser().parseFromString(p.title.rendered, "text/html").body.textContent.replace(/^APOD:[^–-]*[–-]\s*/, "").trim();
  const explanation = (text.match(/Explanation:\s*(.*?)\s*(?:Tomorrow.s picture:|Date:)/) || [])[1] || "";
  const credit = (text.match(/Credit(?: & Copyright)?:\s*(.*?)\s*(?:Authors|Explanation|$)/) || [])[1] || "";
  const html = p.content.rendered;
  const iframe = [...doc.querySelectorAll("iframe")].map((f) => f.src).find((u) => /youtube|vimeo/.test(u));
  const asset = (ext) => (html.match(new RegExp(`https://assets\\.science\\.nasa\\.gov/content/dam/[^"'\\s?]+\\.(?:${ext})`, "i")) || [])[0];
  const mp4 = asset("mp4|webm");
  const img = asset("jpe?g|png|gif|webp");
  const video = iframe || mp4;
  return {
    date: p.date.slice(0, 10),
    title,
    explanation,
    copyright: credit,
    url: video || img,
    hdurl: img,
    media_type: video ? "video" : "image",
    thumbnail_url: img,
    link: p.link,
  };
}

async function loadApod() {
  // Show the saved copy straight away, then refresh from NASA live.
  const cached = await fetch("data/apod.json").then((r) => (r.ok ? r.json() : null)).then((d) => d?.items || []).catch(() => []);
  if (cached.length) renderApod(cached);
  try {
    const r = await fetch(APOD_FEED, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status);
    const items = (await r.json()).map(parseApodPost).filter((i) => i.url);
    if (items.length && (!cached.length || items[0].date >= cached[0].date)) renderApod(items);
  } catch {
    if (!cached.length) renderApod([]);
  }
}

function renderApod(items) {
  items = items.filter((i) => i && i.url).sort((a, b) => b.date.localeCompare(a.date));
  $("#apod").setAttribute("aria-busy", "false");
  if (!items.length) {
    $("#apodTitle").textContent = "NASA's picture of the day couldn't be loaded right now.";
    $("#apodMedia").innerHTML = "";
    return;
  }
  const show = (i) => {
    const it = items[i];
    const media = $("#apodMedia");
    if (it.media_type === "video") {
      const src = /youtube|vimeo/.test(it.url) ? it.url : null;
      media.innerHTML = src ? `<iframe src="${esc(src)}" title="${esc(it.title)}" allowfullscreen loading="lazy"></iframe>` : `<video src="${esc(it.url)}" controls playsinline></video>`;
    } else {
      media.innerHTML = `<div class="skeleton"></div><img src="${esc(it.url)}" alt="${esc(it.title)}" decoding="async">`;
      media.querySelector("img").addEventListener("load", () => media.querySelector(".skeleton")?.remove());
    }
    const d = new Date(it.date + "T12:00:00Z");
    $("#apodDate").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("#apodTitle").textContent = it.title;
    $("#apodCredit").innerHTML = `${it.copyright ? `Credit: ${esc(it.copyright.replace(/\s+/g, " ").trim())}` : "NASA"}${it.link ? ` · <a href="${esc(it.link)}" target="_blank" rel="noopener">on NASA Science ↗</a>` : ""}`;
    const ex = $("#apodExplain");
    ex.textContent = it.explanation;
    ex.classList.remove("open");
    $("#apodMore").hidden = it.explanation.length < 420;
    $("#apodMore").textContent = "Read more";
    const hd = $("#apodHd");
    hd.hidden = !it.hdurl;
    if (it.hdurl) hd.href = it.hdurl;
    document.querySelectorAll("#apodStrip button").forEach((b, k) => b.setAttribute("aria-current", k === i));
  };
  $("#apodMore").onclick = () => {
    const open = $("#apodExplain").classList.toggle("open");
    $("#apodMore").textContent = open ? "Show less" : "Read more";
  };
  $("#apodStrip").innerHTML = items
    .map((it) => {
      const thumb = it.media_type === "video" ? it.thumbnail_url : it.url;
      const label = new Date(it.date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
      return `<button title="${esc(it.title)}">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ""}<span>${label}</span></button>`;
    })
    .join("");
  $("#apodStrip").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) show([...b.parentElement.children].indexOf(b));
  };
  show(0);
}

/* ---------------- the live solar system ---------------- */
function orrery() {
  const canvas = $("#orrery");
  const ctx = canvas.getContext("2d");
  const DAY = 86400000;
  let sim = Date.now();
  let speed = 1; // simulated seconds per real second
  let view = store.get("view", "all");
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let last = performance.now();
  let paths = null;
  let pathsAt = 0;
  let hover = null;
  let W = 0;
  let H = 0;

  const speeds = [["1", "Live"], [String(DAY / 1000), "1 day/s"], [String((7 * DAY) / 1000), "1 week/s"], [String((30 * DAY) / 1000), "1 month/s"], [String((365.25 * DAY) / 1000), "1 year/s"]];
  segmented($("#speeds"), speeds, "1", (v) => (speed = Number(v)));
  segmented($("#views"), [["inner", "Inner planets"], ["all", "All planets"]], view, (v) => {
    view = v;
    zoom = 1;
    pan = { x: 0, y: 0 };
    store.set("view", v);
  });
  $("#toNow").onclick = () => {
    sim = Date.now();
    speed = 1;
    $("#speeds").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-checked", k === 0));
  };

  const resize = () => {
    const dpr = devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(resize).observe(canvas);

  // Inner view is true to scale; the all-planets view uses a log scale so Mercury and Neptune both fit.
  const project = (p) => {
    const m = Math.min(W, H) / 2 - 24;
    let rr;
    const r = Math.hypot(p.x, p.y);
    if (view === "inner") rr = (r / 1.75) * m;
    else rr = (Math.log(1 + r / 0.25) / Math.log(1 + 31 / 0.25)) * m;
    const k = r ? rr / r : 0;
    return { x: W / 2 + pan.x + p.x * k * zoom, y: H / 2 + pan.y - p.y * k * zoom };
  };
  const visible = () => (view === "inner" ? PLANETS.slice(0, 4) : PLANETS);
  const size = (p) => Math.max(2.5, Math.min(10, 1.6 * Math.log2(p.r / 600))) * Math.min(1, Math.min(W, H) / 640);

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    if (drag) {
      pan.x = drag.px + (e.clientX - drag.x);
      pan.y = drag.py + (e.clientY - drag.y);
    }
    hover = null;
    let best = 18;
    for (const p of visible()) {
      const s = project(planetPosition(p, sim));
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < best) [best, hover] = [d, p];
    }
    if (hover) {
      const f = nowFacts(hover.name, sim);
      showTip(
        e,
        `<b>${hover.name}</b><br>${fmt(f.sunAU, 3)} au from the Sun (${fmt((f.sunAU * AU_KM) / 1e6)} million km)<br>Sunlight takes ${fmt(f.sunLightMin, 1)} min to arrive` +
          (hover.name !== "Earth" ? `<br>${fmt(f.earthAU, 3)} au from Earth · a radio signal takes ${f.earthLightMin < 60 ? fmt(f.earthLightMin, 1) + " min" : fmt(f.earthLightMin / 60, 1) + " h"}` : ""),
      );
    } else hideTip();
  });
  canvas.addEventListener("pointerleave", hideTip);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.min(8, Math.max(0.5, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    },
    { passive: false },
  );

  const draw = (t) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    sim += dt * speed * 1000;
    if (!paths || Math.abs(sim - pathsAt) > 200 * DAY) {
      paths = Object.fromEntries(PLANETS.map((p) => [p.name, orbitPath(p, sim, 360)]));
      pathsAt = sim;
    }
    ctx.clearRect(0, 0, W, H);
    // the Sun
    const sun = project({ x: 0, y: 0 });
    const gr = 46 * Math.sqrt(zoom) * Math.min(1, Math.min(W, H) / 640);
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, gr);
    glow.addColorStop(0, "rgba(255,220,140,0.9)");
    glow.addColorStop(0.25, "rgba(255,180,80,0.35)");
    glow.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, gr, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = "#ffd77a";
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 7, 0, 6.283);
    ctx.fill();

    const placed = [];
    for (const p of visible()) {
      // orbit
      ctx.strokeStyle = hover === p ? "rgba(180,200,255,0.55)" : "rgba(150,170,255,0.16)";
      ctx.lineWidth = hover === p ? 1.5 : 1;
      ctx.beginPath();
      paths[p.name].forEach((q, i) => {
        const s = project(q);
        i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      });
      ctx.stroke();
      // planet
      const s = project(planetPosition(p, sim));
      const r = size(p);
      if (p.name === "Saturn") {
        ctx.strokeStyle = "rgba(233,215,161,0.7)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r * 2.1, r * 0.8, -0.35, 0, 6.283);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(s.x - r / 3, s.y - r / 3, 0, s.x, s.y, r);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.25, p.color);
      g.addColorStop(1, shade(p.color));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, 6.283);
      ctx.fill();
      // label sits just outside the planet, pointing away from the Sun, so neighbours don't collide
      ctx.fillStyle = hover === p ? "#fff" : "rgba(220,226,255,0.8)";
      ctx.font = "500 12px Inter, sans-serif";
      const ang = Math.atan2(s.y - sun.y, s.x - sun.x);
      const tw = ctx.measureText(p.name).width;
      let lx = s.x + Math.cos(ang) * (r + 8) - (Math.cos(ang) < 0 ? tw : 0);
      let ly = s.y + Math.sin(ang) * (r + 8) + 4;
      lx = Math.max(4, Math.min(W - tw - 4, lx));
      for (let k = 0; k < 6 && placed.some((b) => lx < b.x + b.w && lx + tw > b.x && Math.abs(ly - b.y) < 13); k++) ly += 13;
      placed.push({ x: lx, y: ly, w: tw });
      ctx.fillText(p.name, lx, ly);
    }

    const d = new Date(sim);
    const diff = (sim - Date.now()) / DAY;
    const rel = Math.abs(diff) < 1 / 24 ? "Live" : diff > 0 ? `${fmtSpan(diff)} from now` : `${fmtSpan(-diff)} ago`;
    $("#simDate").innerHTML = `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}<small>${rel}</small>`;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  // distances from Earth, refreshed twice a second
  const list = () => {
    $("#distances").innerHTML = PLANETS.filter((p) => p.name !== "Earth")
      .map((p) => {
        const f = nowFacts(p.name, sim);
        const delay = f.earthLightMin < 60 ? `${fmt(f.earthLightMin, 1)} light-min` : `${fmt(f.earthLightMin / 60, 2)} light-hours`;
        return `<div class="dist"><span class="dot" style="background:${p.color}"></span><span><b>${p.name}</b> ${fmt(f.earthAU, 2)} au away · ${delay}</span></div>`;
      })
      .join("");
  };
  list();
  setInterval(list, 500);
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.35;
  return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`;
}

function fmtSpan(days) {
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${fmt(days / 365.25, 1)} years`;
}

/* ---------------- planet weather ---------------- */
const GLOBES = {
  Sun: "radial-gradient(circle at 40% 38%, #fff6d0, #ffc857 35%, #ff8a3c 70%, #c4421a)",
  Mercury: "radial-gradient(circle at 35% 35%, #d9d4cc, #9a948b 55%, #4a4641)",
  Venus: "radial-gradient(circle at 35% 35%, #fff2c8, #e8c98a 50%, #9b7a3e)",
  Moon: "radial-gradient(circle at 35% 35%, #f2f2ee, #b8b8b2 55%, #5c5c58)",
  Mars: "radial-gradient(circle at 35% 35%, #ffb08a, #e2734a 45%, #7a2c16)",
  Jupiter: "repeating-linear-gradient(170deg, #e8d3b0 0 5px, #c99f72 5px 9px, #f1e3c8 9px 13px, #b8875a 13px 16px)",
  Saturn: "repeating-linear-gradient(172deg, #f2e2b4 0 6px, #d9c08a 6px 10px, #efdcab 10px 15px)",
  Uranus: "radial-gradient(circle at 35% 35%, #e6fbff, #9fe3e8 50%, #3f8f99)",
  Neptune: "radial-gradient(circle at 35% 35%, #c9d6ff, #5c7cff 50%, #22307a)",
};

const SUN_FACTS = { temp: [5500, 5500], pressure: "no surface: plasma all the way down", wind: "the solar wind blows at about 400 km/s", day: "about 27 days at the equator, 35 at the poles", sky: "", weather: "Sunspots, flares and coronal mass ejections. Solar Cycle 25 peaked around late 2024." };
const MOON_FACTS = { temp: [-173, 127], pressure: "almost none", wind: "none", day: "29.5 Earth days", weather: "No air, no weather; the ground swings 300°C between day and night." };

function moonPhase(ms) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((((ms - ref) / 86400000) % synodic) + synodic) % synodic;
  const illum = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return { age, illum, name: names[Math.round((age / synodic) * 8) % 8] };
}

function weather() {
  let unit = store.get("unit", "C");
  const T = (c) => (unit === "C" ? `${Math.round(c)}°C` : `${toF(c)}°F`);
  const range = (a, b) => (a === b ? T(a) : `${T(a)} to ${T(b)}`);
  let mars = null;
  let epic = null;

  const card = (name, f, opts = {}) => {
    const s = name in FACTS ? season(name, Date.now()) : null;
    const n = name in FACTS ? nowFacts(name, Date.now()) : null;
    const globe = opts.globe ? `<div class="globe"><img src="${esc(opts.globe)}" alt="${name} seen from space"></div>` : `<div class="globe" style="background:${GLOBES[name]}"></div>`;
    const rows = [
      ["Air pressure", f.pressure],
      ["Wind", f.wind],
      ["A day lasts", f.day],
      s && ["Season now", `${s.label}${s.ls != null ? ` · Ls ${Math.round(s.ls)}°` : ""}`],
      n && name !== "Earth" && ["Sunlight", `${n.sunlight >= 1 ? fmt(n.sunlight, 1) : fmt(n.sunlight * 100, 1) + "%"}${n.sunlight >= 1 ? "× Earth's" : " of Earth's"}`],
      n && ["From the Sun", `${fmt(n.sunAU, 2)} au · light takes ${n.sunLightMin < 60 ? fmt(n.sunLightMin, 1) + " min" : fmt(n.sunLightMin / 60, 1) + " h"}`],
      ...(opts.rows || []),
    ].filter(Boolean);
    return `<article class="wcard ${opts.live ? "live" : ""}">
      <header>${globe}<div><h3>${name}</h3><span class="badge ${opts.live ? "live" : ""}">${opts.badge || "typical"}</span></div></header>
      ${opts.body || (f.mean == null
        ? `<div class="temp">${T(f.temp[1])}<small>by day · ${T(f.temp[0])} at night</small></div>`
        : `<div class="temp">${T(f.mean)}<small>${f.temp[0] !== f.temp[1] ? range(f.temp[0], f.temp[1]) : name === "Sun" ? "at the surface" : ""}</small></div>`)}
      <p class="cond">${esc(f.weather)}</p>
      ${s && s.detail ? `<p class="note">${esc(s.detail)}</p>` : ""}
      <ul class="facts">${rows.map(([k, v]) => `<li><span>${k}</span><span>${esc(v)}</span></li>`).join("")}</ul>
      ${opts.after || ""}
    </article>`;
  };

  const marsBody = () => {
    if (!mars || !mars.length) return `<div class="temp">${T(-65)}<small>average · live data loading…</small></div>`;
    const m = mars[0];
    const date = new Date(m.date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return `<div class="temp">${m.max != null ? T(m.max) : "–"}<small>high · low ${m.min != null ? T(m.min) : "–"}</small></div>
      <div class="live-grid">
        <div><b>${m.pressure != null ? fmt(m.pressure) : "–"} Pa</b><span>air pressure</span></div>
        <div><b>${esc(m.sky || "–")}</b><span>sky</span></div>
        <div><b>${esc(m.uv || "–")}</b><span>UV</span></div>
        <div><b>${esc(m.sunrise || "–")}</b><span>sunrise</span></div>
        <div><b>${esc(m.sunset || "–")}</b><span>sunset</span></div>
        <div><b>${m.ground_max != null ? T(m.ground_max) : "–"}</b><span>ground high</span></div>
      </div>
      <svg class="spark" id="marsSpark" role="img" aria-label="Daily high and low temperatures for the last 30 sols"></svg>
      <p class="note">Curiosity's latest report: sol ${m.sol}, ${date} on Earth, Gale Crater. Reports reach the public with a delay of several weeks.</p>`;
  };

  const render = () => {
    const ph = moonPhase(Date.now());
    const html = [
      card("Sun", { ...SUN_FACTS, mean: 5500 }, { badge: "our star" }),
      card("Mercury", FACTS.Mercury),
      card("Venus", FACTS.Venus),
      card("Moon", { ...MOON_FACTS, mean: null }, { badge: "live phase", rows: [["Tonight", `${ph.name} · ${Math.round(ph.illum * 100)}% lit`]] }),
      card("Earth", FACTS.Earth, {
        live: true,
        badge: "live from EPIC",
        globe: epic?.url,
        after: epic ? `<p class="note">The whole sunlit Earth, photographed ${new Date(epic.date.replace(" ", "T") + "Z").toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} by NASA's EPIC camera from about 1.5 million km away.</p>` : "",
      }),
      card("Mars", FACTS.Mars, { live: true, badge: "live from Curiosity", body: marsBody() }),
      card("Jupiter", FACTS.Jupiter),
      card("Saturn", FACTS.Saturn),
      card("Uranus", FACTS.Uranus),
      card("Neptune", FACTS.Neptune),
    ].join("");
    $("#weatherGrid").innerHTML = html;
    if (mars?.length) spark($("#marsSpark"), mars.slice(0, 30).reverse());
  };

  const spark = (svg, sols) => {
    const w = svg.clientWidth || 400;
    const h = 64;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const vals = sols.flatMap((s) => [s.min, s.max]).filter((v) => v != null);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const X = (i) => 4 + (i / Math.max(1, sols.length - 1)) * (w - 8);
    const Y = (v) => h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 14);
    const line = (k) => sols.map((s, i) => (s[k] == null ? "" : `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(s[k]).toFixed(1)}`)).join("");
    const area = `${line("max")} ${sols.map((s, i) => `L${X(sols.length - 1 - i).toFixed(1)},${Y(sols[sols.length - 1 - i].min ?? lo).toFixed(1)}`).join(" ")} Z`;
    svg.innerHTML = `<path d="${area}" fill="rgba(226,115,74,0.18)"/><path d="${line("max")}" fill="none" stroke="#ff8a5c" stroke-width="2"/><path d="${line("min")}" fill="none" stroke="#6fd3ff" stroke-width="2"/>
      <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" id="sparkHit"/>`;
    svg.querySelector("#sparkHit").addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(sols.length - 1, Math.round(((e.clientX - r.left - 4) / (r.width - 8)) * (sols.length - 1))));
      const s = sols[i];
      showTip(e, `<b>Sol ${s.sol}</b> · ${s.date}<br>High ${s.max != null ? T(s.max) : "–"} · low ${s.min != null ? T(s.min) : "–"}<br>${s.pressure != null ? fmt(s.pressure) + " Pa" : ""}`);
    });
    svg.querySelector("#sparkHit").addEventListener("mouseleave", hideTip);
  };

  segmented($("#units"), [["C", "°C"], ["F", "°F"]], unit, (v) => {
    unit = v;
    store.set("unit", v);
    render();
  });
  render();

  fetch("https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json")
    .then((r) => r.json())
    .then((d) => {
      const num = (v) => (v === "--" || v == null || v === "" ? null : Number(v));
      mars = (d.soles || []).slice(0, 60).map((s) => ({ sol: Number(s.sol), date: s.terrestrial_date, min: num(s.min_temp), max: num(s.max_temp), pressure: num(s.pressure), sky: s.atmo_opacity, uv: s.local_uv_irradiance_index, sunrise: s.sunrise, sunset: s.sunset, ground_max: num(s.max_gts_temp) }));
      render();
    })
    .catch(() => {});

  fetch("https://epic.gsfc.nasa.gov/api/natural")
    .then((r) => r.json())
    .then((items) => {
      const it = items[items.length - 1];
      if (!it) return;
      const d = it.date.slice(0, 10).replaceAll("-", "/");
      epic = { date: it.date, url: `https://epic.gsfc.nasa.gov/archive/natural/${d}/png/${it.image}.png` };
      render();
    })
    .catch(() => {});
}

stars();
clock();
loadApod();
orrery();
weather();
