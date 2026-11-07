// Asteroid watch: JPL's predicted close approaches, as a dial and a list.

const LD_KM = 384400;
const HIROSHIMA_MT = 0.015;

export const cleanName = (n) => n.replace(/^\((.*)\)$/, "$1").trim();
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** JPL's "2026-Nov-08 01:57" (UTC) to a timestamp. */
export function approachTime(cd) {
  const [d, t] = cd.split(" ");
  const [y, mon, day] = d.split("-");
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(mon);
  const [hh, mm] = t.split(":").map(Number);
  return Date.UTC(Number(y), m, Number(day), hh, mm);
}

/** Kinetic energy in megatons for a diameter (m) and speed (km/s), stony density. */
export function energyMt(dM, vKms, density = 2600) {
  const mass = (density * Math.PI * dM ** 3) / 6;
  return (0.5 * mass * (vKms * 1000) ** 2) / 4.184e15;
}

export function energyText(mt) {
  if (mt < 0.001) return `${fmt(mt * 1e6)} tonnes of TNT`;
  if (mt < HIROSHIMA_MT) return `${fmt(mt * 1000, 1)} kilotons of TNT`;
  if (mt < 1) return `about ${fmt(mt / HIROSHIMA_MT)}× the Hiroshima bomb`;
  return `${fmt(mt, mt < 10 ? 1 : 0)} megatons, ${fmt(mt / HIROSHIMA_MT)}× Hiroshima`;
}

export function whatIf(a) {
  const d = a.diameter_m;
  if (!d) return "Size unknown.";
  const [lo, hi] = a.diameter_range_m || [d, d];
  const e = energyMt(d, a.v_kms);
  let effect;
  if (d < 25) effect = "It would burn up as a bright fireball high in the sky, maybe dropping a few meteorites.";
  else if (d < 60) effect = "An airburst like Chelyabinsk (2013) or Tunguska (1908): windows shattered or forest flattened over a wide area.";
  else if (d < 140) effect = `It could reach the ground: a crater roughly ${fmt(a.crater_m || 0)} m wide, with city-scale damage.`;
  else effect = `Big enough to cause regional devastation; JPL counts objects this size as potentially hazardous.`;
  const range = a.diameter_measured ? "" : ` (somewhere between ${fmt(lo)} and ${fmt(hi)} m, depending on how dark it is)`;
  return `If it hit: ${energyText(e)}${range ? `, for a ${fmt(d)} m rock${range}` : ""}. ${effect}`;
}

export function render(data, $, showTip, hideTip) {
  const now = Date.now();
  const items = data.items.map((a) => ({ ...a, t: approachTime(a.time), nm: cleanName(a.name) })).sort((a, b) => a.t - b.t);
  const future = items.filter((a) => a.t > now);
  const closest = [...items].sort((a, b) => a.dist_ld - b.dist_ld)[0];
  const biggest = [...items].sort((a, b) => (b.diameter_m || 0) - (a.diameter_m || 0))[0];
  const next = future[0];
  const inMoon = items.filter((a) => a.dist_ld < 1).length;
  const when = (t) => {
    const days = (t - now) / 86400000;
    const abs = Math.abs(days);
    const s = abs < 1 ? `${fmt(abs * 24)} hours` : `${fmt(abs)} day${Math.round(abs) === 1 ? "" : "s"}`;
    return days >= 0 ? `in ${s}` : `${s} ago`;
  };
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  $("#astStats").innerHTML = [
    [items.length, `asteroids pass within ${fmt(data.max_au * 149597870.7 / LD_KM)} Moon-distances`],
    [inMoon, "come closer than the Moon"],
    [`${fmt(closest.dist_ld, 2)} LD`, `closest: ${esc(closest.nm)}, ${fmt(closest.dist_km)} km`],
    [next ? when(next.t).replace("in ", "") : "–", next ? `until the next: ${esc(next.nm)}` : "no more in this window"],
  ]
    .map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`)
    .join("");

  // ---- the dial ----
  const svg = $("#astClock");
  const S = 560;
  const C = S / 2;
  const maxLD = (data.max_au * 149597870.7) / LD_KM;
  const R = (ld) => 34 + (C - 64) * Math.sqrt(Math.min(ld, maxLD) / maxLD);
  const t0 = Math.min(...items.map((a) => a.t), now);
  const t1 = Math.max(...items.map((a) => a.t), now);
  const A = (t) => -Math.PI / 2 + ((t - t0) / (t1 - t0 || 1)) * Math.PI * 1.9;
  $("#clockRange").textContent = `${day(t0)} → ${day(t1)}`;
  const ring = (ld, dash, label) => `<circle cx="${C}" cy="${C}" r="${R(ld)}" fill="none" stroke="${dash ? "rgba(255,200,87,0.55)" : "rgba(150,170,255,0.16)"}" ${dash ? 'stroke-dasharray="4 5"' : ""}/>
    <text x="${C}" y="${C + R(ld) + 13}" fill="${dash ? "#ffc857" : "#7c83a6"}" font-size="11" text-anchor="middle">${label}</text>`;
  const dotR = (d) => Math.max(2.6, Math.min(11, 2.4 + 3.2 * Math.log10(Math.max(d || 5, 5) / 5)));
  const weekTicks = [];
  for (let t = t0; t <= t1; t += 7 * 86400000) {
    const a = A(t);
    const x = C + Math.cos(a) * (C - 34);
    const y = C + Math.sin(a) * (C - 34);
    weekTicks.push(`<text x="${x}" y="${y}" fill="#7c83a6" font-size="10.5" text-anchor="middle" dominant-baseline="middle">${day(t)}</text>`);
  }
  const nowA = A(now);
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.innerHTML = `
    ${[5, 10, maxLD].map((ld) => ring(ld, false, `${fmt(ld)} LD`)).join("")}
    ${ring(1, true, "the Moon")}
    ${weekTicks.join("")}
    <line x1="${C}" y1="${C}" x2="${C + Math.cos(nowA) * (C - 50)}" y2="${C + Math.sin(nowA) * (C - 50)}" stroke="rgba(123,224,176,0.7)" stroke-width="1.5"/>
    <text x="${C + Math.cos(nowA) * (C - 50)}" y="${C + Math.sin(nowA) * (C - 50) - 6}" fill="#7be0b0" font-size="11" text-anchor="middle">now</text>
    <circle cx="${C}" cy="${C}" r="10" fill="#5aa7ff"/><circle cx="${C - 3}" cy="${C - 3}" r="3" fill="#cfe6ff" opacity=".6"/>
    ${items
      .map((a, i) => {
        const ang = A(a.t);
        const r = R(a.dist_ld);
        const past = a.t < now;
        const fill = past ? "rgba(180,186,214,0.45)" : a.dist_ld < 1 ? "#ffc857" : "#ff8a5c";
        return `<circle data-i="${i}" cx="${C + Math.cos(ang) * r}" cy="${C + Math.sin(ang) * r}" r="${dotR(a.diameter_m)}" fill="${fill}" stroke="${a.pha ? "#ff4d4d" : "rgba(5,6,12,0.8)"}" stroke-width="${a.pha ? 2 : 1}" style="cursor:pointer"/>`;
      })
      .join("")}`;
  svg.onmousemove = (e) => {
    const c = e.target.closest("circle[data-i]");
    if (!c) return hideTip();
    const a = items[c.dataset.i];
    showTip(e, `<b>${esc(a.nm)}</b> · ${when(a.t)}<br>${fmt(a.dist_ld, 2)} Moon-distances (${fmt(a.dist_km)} km)<br>${fmt(a.v_kms, 1)} km/s · about ${fmt(a.diameter_m || 0)} m across`);
  };
  svg.onmouseleave = hideTip;

  // ---- the list ----
  let filter = "upcoming";
  const list = () => {
    const shown = filter === "upcoming" ? future : filter === "moon" ? items.filter((a) => a.dist_ld < 1) : items;
    $("#astList").innerHTML =
      shown
        .map((a) => {
          const past = a.t < now;
          return `<li>
          <span class="nm">${esc(a.nm)}${a.dist_ld < 1 ? '<span class="pill moon">closer than the Moon</span>' : ""}${a.pha ? '<span class="pill pha">potentially hazardous</span>' : ""}${past ? '<span class="pill past">passed</span>' : ""}</span>
          <span class="when">${when(a.t)} · ${day(a.t)}</span>
          <span class="meta">${fmt(a.dist_ld, 2)} Moon-distances (${fmt(a.dist_km)} km) · ${fmt(a.v_kms, 1)} km/s · about ${fmt(a.diameter_m || 0)} m across</span>
          <span class="bar" title="Distance, out to ${fmt(maxLD)} Moon-distances; the line is the Moon"><i style="width:${Math.min(100, (a.dist_ld / maxLD) * 100)}%"></i><s style="left:${(1 / maxLD) * 100}%"></s></span>
          <span class="hit">${esc(whatIf(a))}</span>
        </li>`;
        })
        .join("") || `<li><span class="meta">Nothing in this window.</span></li>`;
  };
  const seg = $("#astFilter");
  seg.innerHTML = [["upcoming", "Upcoming"], ["moon", "Inside the Moon's orbit"], ["all", "All"]].map(([v, l]) => `<button role="radio" aria-checked="${v === filter}" data-v="${v}">${l}</button>`).join("");
  seg.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.v;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", x === b));
    list();
  };
  list();
  void biggest;
  return items;
}
