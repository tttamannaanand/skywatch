// Typical conditions on each planet (NASA Planetary Fact Sheet and mission results), plus
// the season each planet is in right now, worked out from where it is on its orbit.

import { PLANETS, planetPosition } from "./orbits.js";

export const FACTS = {
  Mercury: { temp: [-173, 427], mean: 167, pressure: "almost none (a thin exosphere)", wind: "no atmosphere to make wind", day: "176 Earth days sunrise to sunrise", tilt: 0.03, sky: "Black sky even at noon; the Sun looks 3× bigger than from Earth.", weather: "No weather. Just scorching days and freezing nights." },
  Venus: { temp: [462, 464], mean: 464, pressure: "92× Earth's: like being 900 m under the sea", wind: "about 360 km/h at the cloud tops, a gentle breeze at the ground", day: "117 Earth days", tilt: 177.4, sky: "Thick yellow clouds of sulfuric acid hide the Sun.", weather: "Sulfuric acid rain that evaporates before it lands; hot enough to melt lead, everywhere, all year." },
  Earth: { temp: [-89, 57], mean: 15, pressure: "1 bar (that's us)", wind: "from calm to 400 km/h in tornadoes", day: "24 hours", tilt: 23.44, sky: "Blue sky, white clouds.", weather: "Rain, snow, storms and sunshine: the only planet with liquid water on its surface." },
  Mars: { temp: [-143, 35], mean: -65, pressure: "0.6% of Earth's", wind: "up to about 100 km/h in dust storms", day: "24 h 39 m (a sol)", tilt: 25.19, sky: "Butterscotch by day, blue sunsets.", weather: "Dust devils, planet-wide dust storms, and CO₂ frost in winter." },
  Jupiter: { temp: [-145, -108], mean: -110, pressure: "no surface: gas all the way down", wind: "up to about 620 km/h; the Great Red Spot is a storm wider than Earth", day: "9 h 56 m", tilt: 3.13, sky: "Bands of ammonia clouds.", weather: "Lightning storms bigger than on Earth, and a storm that's been raging for at least 190 years." },
  Saturn: { temp: [-185, -122], mean: -140, pressure: "no surface", wind: "up to about 1,800 km/h at the equator", day: "10 h 33 m", tilt: 26.73, sky: "Pale gold haze over the clouds.", weather: "A six-sided jet stream (the hexagon) spins around its north pole." },
  Uranus: { temp: [-224, -197], mean: -195, pressure: "no surface", wind: "up to about 900 km/h", day: "17 h 14 m", tilt: 97.77, sky: "Methane makes it cyan.", weather: "Tipped on its side: each pole gets 42 years of daylight, then 42 years of night." },
  Neptune: { temp: [-218, -200], mean: -200, pressure: "no surface", wind: "up to about 2,100 km/h, the fastest in the solar system", day: "16 h 6 m", tilt: 28.32, sky: "Deep blue methane haze.", weather: "Dark storms the size of Earth that come and go within a few years." },
};

// A date when each planet's northern hemisphere had its spring equinox (solar longitude 0).
// Measuring how far the planet has gone round its orbit since then gives today's season.
const EQUINOX = {
  Earth: Date.UTC(2026, 2, 20, 14, 46),
  Mars: Date.UTC(2024, 10, 12),
  Jupiter: Date.UTC(2021, 4, 1), // tilt is tiny, so this barely matters
  Saturn: Date.UTC(2009, 7, 11),
  Uranus: Date.UTC(2007, 11, 7),
  Neptune: Date.UTC(2038, 0, 1), // approximate
};

const lon = (p) => Math.atan2(p.y, p.x) * (180 / Math.PI);

/** Solar longitude Ls in degrees: 0 northern spring, 90 summer, 180 autumn, 270 winter. */
export function solarLongitude(name, ms) {
  if (!(name in EQUINOX)) return null;
  const p = PLANETS.find((x) => x.name === name);
  const ls = lon(planetPosition(p, ms)) - lon(planetPosition(p, EQUINOX[name]));
  return ((ls % 360) + 360) % 360;
}

export function season(name, ms) {
  const f = FACTS[name];
  if (name === "Mercury" || name === "Venus") return { label: "No real seasons", detail: name === "Venus" ? "It spins upside down with almost no tilt." : "Almost no tilt; days and nights do all the work.", ls: null };
  const ls = solarLongitude(name, ms);
  const q = Math.floor(ls / 90);
  const north = ["spring", "summer", "autumn", "winter"][q];
  const south = ["autumn", "winter", "spring", "summer"][q];
  const into = Math.round(((ls % 90) / 90) * 100);
  if (name === "Jupiter") return { label: "Barely any seasons", detail: `Tilted only ${f.tilt}°, so the north is technically in ${north}.`, ls };
  return {
    label: `Northern ${north}`,
    detail: `${into}% of the way through; it's ${south} in the south.`,
    ls,
  };
}

/** Things that are true right now: distance from the Sun, sunlight strength, light delay. */
export function now(name, ms) {
  const p = PLANETS.find((x) => x.name === name);
  const here = planetPosition(p, ms);
  const earth = planetPosition(PLANETS[2], ms);
  const fromEarth = name === "Earth" ? 0 : Math.hypot(here.x - earth.x, here.y - earth.y, here.z - earth.z);
  return {
    sunAU: here.r,
    sunlight: 1 / (here.r * here.r), // compared with Earth's average
    sunLightMin: (here.r * 149597870.7) / 299792.458 / 60,
    earthAU: fromEarth,
    earthLightMin: (fromEarth * 149597870.7) / 299792.458 / 60,
  };
}

export const toF = (c) => Math.round((c * 9) / 5 + 32);
