// Where the planets are. Keplerian elements and rates from JPL's "Approximate Positions of
// the Planets" (E. M. Standish, Table 1, valid 1800-2050), accurate to a fraction of a degree.

const D2R = Math.PI / 180;

// a (au), e, I, L, long. perihelion, long. ascending node (deg); then rates per century
export const PLANETS = [
  { name: "Mercury", color: "#b9b2a8", r: 2440, el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  { name: "Venus", color: "#e8c98a", r: 6052, el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  { name: "Earth", color: "#5aa7ff", r: 6371, el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0] },
  { name: "Mars", color: "#e2734a", r: 3390, el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  { name: "Jupiter", color: "#d9b38c", r: 69911, el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  { name: "Saturn", color: "#e9d7a1", r: 58232, el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  { name: "Uranus", color: "#9fe3e8", r: 25362, el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  { name: "Neptune", color: "#6f8cff", r: 24622, el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
];

export const julian = (ms) => ms / 86400000 + 2440587.5;

/** Solve Kepler's equation M = E - e sin E (radians). */
export function eccentricAnomaly(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Heliocentric ecliptic position (au) from orbital elements in degrees. */
export function fromElements(a, e, I, M, w, O) {
  const E = eccentricAnomaly(wrap180(M) * D2R, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cO, sO, cI, sI] = [Math.cos(w * D2R), Math.sin(w * D2R), Math.cos(O * D2R), Math.sin(O * D2R), Math.cos(I * D2R), Math.sin(I * D2R)];
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  };
}

/** Position of a planet at a time (ms since 1970). */
export function planetPosition(p, ms) {
  const T = (julian(ms) - 2451545.0) / 36525;
  const [a, e, I, L, wbar, O] = p.el.map((v, i) => v + p.rate[i] * T);
  const pos = fromElements(a, e, I, L - wbar, wbar - O, O);
  return { ...pos, r: Math.hypot(pos.x, pos.y, pos.z), a, e, I, O, wbar };
}

/** Orbit outline as points, for drawing. */
export function orbitPath(p, ms, n = 240) {
  const T = (julian(ms) - 2451545.0) / 36525;
  const [a, e, I, , wbar, O] = p.el.map((v, i) => v + p.rate[i] * T);
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push(fromElements(a, e, I, (360 * k) / n, wbar - O, O));
  return pts;
}

/** Orbital period in days from semi-major axis (Kepler's third law). */
export const periodDays = (a) => 365.25636 * Math.pow(a, 1.5);

/** A small body (asteroid) position from SBDB elements: a, e, i, om, w, ma at epoch (JD), n deg/day. */
export function bodyPosition(el, ms) {
  const n = el.n ?? 360 / periodDays(el.a);
  const M = el.ma + n * (julian(ms) - el.epoch);
  return fromElements(el.a, el.e, el.i, M, el.w, el.om);
}

export function bodyOrbit(el, nPts = 240) {
  const pts = [];
  for (let k = 0; k <= nPts; k++) pts.push(fromElements(el.a, el.e, el.i, (360 * k) / nPts, el.w, el.om));
  return pts;
}

export const AU_KM = 149597870.7;
export const LIGHT_KMS = 299792.458;
