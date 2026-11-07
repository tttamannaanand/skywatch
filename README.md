# Skywatch

**Real NASA data, live: the picture of the day, the planets moving right now, the weather on every planet, the asteroids flying past Earth, and a hunt for planets around other stars.**

## What's on it

- **NASA's picture of the day:** today's Astronomy Picture of the Day, plus the last 10 days. NASA moved APOD to science.nasa.gov, and the old `api.nasa.gov` endpoint now returns the NASA logo for every day, so Skywatch reads the new site's feed directly.
- **The live solar system:** every planet where it actually is right now, from JPL's planetary orbital elements. Speed time up to a year per second, drag to pan, scroll to zoom, hover for distances and light-travel times.
- **Planet weather:** a card for the Sun, every planet and the Moon.
  - **Mars, live** from the Curiosity rover's weather station in Gale Crater: high, low, air pressure, sky, UV, sunrise, sunset, and a 30-sol temperature chart.
  - **Earth, live** as photographed by NASA's EPIC camera from 1.5 million km away.
  - **Every planet:** NASA's measured temperatures, pressure and winds, plus the **season it's in today**, how strong its sunlight is, and how long light takes to reach it.
  - **The Moon's** phase tonight.

- **Asteroid watch:** every asteroid JPL predicts will pass within about 20 Moon-distances of Earth, from a week ago to two months ahead.
  - A **close-approach dial** (Earth in the middle, the Moon's orbit dashed, each rock placed by date and distance).
  - A **flyby list** with size, speed and an honest **"if it hit"**: energy in Hiroshima bombs, whether it would burn up, airburst or leave a crater.
  - Their **real orbits** in the live solar system, all converging on Earth.
- **Exoplanet hunter:** real TESS light curves from 26 stars, searched for transiting planets with box least squares.
  - It tests itself on confirmed planets, hunts in unconfirmed candidates, and runs every signal through the checks astronomers use to catch eclipsing binary stars posing as planets: odd vs even transits, secondary eclipses, dip shape and size.
  - Along the way it spotted KELT-9b's own glow: a faint second dip as the planet, hot enough to glow, passes behind its star.
  - **Results:** all **12 of 12** known planets found at their published periods, none wrongly flagged. **6 of 9** unconfirmed candidates pass every check. **1 of 4** known false alarms caught (by its V-shaped dip). The other three were exposed by follow-up observations from other telescopes and look exactly like planets in TESS data alone.

## Accuracy checks

`node --test` runs 12 tests:
- planet positions match JPL Horizons at J2000 (Earth to 0.003 au);
- Kepler's equation is solved for very eccentric orbits;
- orbits close and stay between perihelion and aphelion;
- seasons line up with known solstice dates;
- impact energy matches the 2013 Chelyabinsk meteor;
- close-approach times are read as UTC.

As an independent check, Skywatch's computed Mars season (Ls 341.5° on 25 Aug 2026) matches the Ls 341 that Curiosity itself reported for that day.

## Run it

```bash
python3 -m http.server -d web 8000     # open http://localhost:8000
python3 pipeline/fetch_daily.py        # refresh pictures, asteroids, Mars and Earth data (needs `pip install requests`)
python3 pipeline/hunt.py               # re-run the exoplanet hunt (needs `pip install -r requirements.txt`, takes ~10 min)
```

A GitHub Action refreshes the data every morning and publishes `web/` to GitHub Pages. The page also fetches the picture of the day, Mars weather and Earth photos live in your browser, and falls back to the saved copies if NASA is slow.

## Data

[NASA APOD](https://science.nasa.gov/apod/) · [JPL approximate planetary positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html) · [Curiosity REMS weather](https://mars.nasa.gov/msl/weather/) · [NASA EPIC](https://epic.gsfc.nasa.gov/) · [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) · [JPL close-approach](https://ssd-api.jpl.nasa.gov/doc/cad.html) and [small-body](https://ssd-api.jpl.nasa.gov/doc/sbdb.html) databases · [TESS light curves via MAST](https://archive.stsci.edu/missions-and-data/tess) · [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/). Not affiliated with NASA.

