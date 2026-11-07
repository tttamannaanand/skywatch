import assert from "node:assert/strict";
import test from "node:test";

import { PLANETS, eccentricAnomaly, julian, planetPosition, periodDays } from "../web/js/orbits.js";

const J2000 = Date.UTC(2000, 0, 1, 12);
const byName = Object.fromEntries(PLANETS.map((p) => [p.name, p]));

test("J2000 is Julian date 2451545", () => {
  assert.equal(julian(J2000), 2451545);
});

test("Earth sits where JPL Horizons puts it at J2000", () => {
  // Horizons, Earth-Moon barycentre, heliocentric ecliptic J2000: x -0.1771, y 0.9672
  const p = planetPosition(byName.Earth, J2000);
  assert.ok(Math.abs(p.x + 0.1771) < 0.003, `x ${p.x}`);
  assert.ok(Math.abs(p.y - 0.9672) < 0.003, `y ${p.y}`);
});

test("Mars and Jupiter at J2000 match Horizons", () => {
  // Horizons heliocentric ecliptic J2000 positions (au)
  const mars = planetPosition(byName.Mars, J2000);
  assert.ok(Math.abs(mars.x - 1.3907) < 0.01 && Math.abs(mars.y + 0.0134) < 0.01, `mars ${mars.x} ${mars.y}`);
  const jup = planetPosition(byName.Jupiter, J2000);
  assert.ok(Math.abs(jup.x - 4.0012) < 0.02 && Math.abs(jup.y - 2.9384) < 0.02, `jupiter ${jup.x} ${jup.y}`);
});

test("Kepler's equation is solved even for very eccentric orbits", () => {
  for (const e of [0, 0.2, 0.6, 0.95]) {
    for (const M of [0.1, 1, 3]) {
      const E = eccentricAnomaly(M, e);
      assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-10);
    }
  }
});

test("a planet comes back to the same place after one orbit", () => {
  const p = byName.Mars;
  const a = planetPosition(p, J2000);
  const b = planetPosition(p, J2000 + periodDays(1.5237) * 86400000);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.02);
});

test("distances from the Sun stay within perihelion and aphelion", () => {
  for (const p of PLANETS) {
    for (let d = 0; d < 4000; d += 97) {
      const { r, a, e } = planetPosition(p, J2000 + d * 86400000);
      assert.ok(r >= a * (1 - e) - 1e-6 && r <= a * (1 + e) + 1e-6, p.name);
    }
  }
});

import { season, solarLongitude, now as nowFacts } from "../web/js/planets.js";

test("seasons line up with known dates", () => {
  // Earth: northern summer solstice 2026-06-21, so Ls is about 90
  assert.ok(Math.abs(solarLongitude("Earth", Date.UTC(2026, 5, 21)) - 90) < 2);
  // Mars: northern spring lasts about 199 Earth days, so Mars Year 38 reached Ls 90 around 2025-05-29
  assert.ok(Math.abs(solarLongitude("Mars", Date.UTC(2025, 4, 29)) - 90) < 4);
  assert.equal(season("Earth", Date.UTC(2026, 11, 25)).label, "Northern winter");
  assert.equal(season("Venus", Date.UTC(2026, 0, 1)).label, "No real seasons");
});

test("sunlight falls off with the square of distance", () => {
  const n = nowFacts("Jupiter", Date.UTC(2026, 10, 7));
  assert.ok(n.sunAU > 4.9 && n.sunAU < 5.5);
  assert.ok(Math.abs(n.sunlight - 1 / n.sunAU ** 2) < 1e-12);
  assert.ok(n.sunLightMin > 40 && n.sunLightMin < 46);
});
