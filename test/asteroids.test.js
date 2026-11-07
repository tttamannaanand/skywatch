import assert from "node:assert/strict";
import test from "node:test";

import { approachTime, cleanName, energyMt, energyText } from "../web/js/asteroids.js";

test("JPL close-approach times are read as UTC", () => {
  assert.equal(approachTime("2026-Nov-08 01:57"), Date.UTC(2026, 10, 8, 1, 57));
});

test("impact energy matches the Chelyabinsk meteor", () => {
  // about 19 m across at about 19 km/s released roughly 0.4-0.5 megatons
  const mt = energyMt(19, 19.2, 3300);
  assert.ok(mt > 0.35 && mt < 0.6, String(mt));
});

test("energy is described in sensible units", () => {
  assert.match(energyText(0.0001), /tonnes/);
  assert.match(energyText(0.005), /kilotons/);
  assert.match(energyText(0.3), /Hiroshima/);
  assert.match(energyText(12), /megatons/);
});

test("names lose JPL's brackets", () => {
  assert.equal(cleanName("(2026 VK2)"), "2026 VK2");
  assert.equal(cleanName("99942 Apophis (2004 MN4)"), "99942 Apophis (2004 MN4)");
});
