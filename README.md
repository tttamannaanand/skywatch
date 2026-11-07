# Skywatch

**Real NASA data, live: the picture of the day, the planets moving right now, and the weather on every planet.**

## What's on it

- **NASA's picture of the day:** today's Astronomy Picture of the Day, plus the last 10 days. NASA moved APOD to science.nasa.gov, and the old `api.nasa.gov` endpoint now returns the NASA logo for every day, so Skywatch reads the new site's feed directly.
- **The live solar system:** every planet where it actually is right now, from JPL's planetary orbital elements. Speed time up to a year per second, drag to pan, scroll to zoom, hover for distances and light-travel times.
- **Planet weather:** a card for the Sun, every planet and the Moon.
  - **Mars, live** from the Curiosity rover's weather station in Gale Crater: high, low, air pressure, sky, UV, sunrise, sunset, and a 30-sol temperature chart.
  - **Earth, live** as photographed by NASA's EPIC camera from 1.5 million km away.
  - **Every planet:** NASA's measured temperatures, pressure and winds, plus the **season it's in today**, how strong its sunlight is, and how long light takes to reach it.
  - **The Moon's** phase tonight.

## Accuracy checks

`node --test` runs 8 tests:
- planet positions match JPL Horizons at J2000 (Earth to 0.003 au);
- Kepler's equation is solved for very eccentric orbits;
- orbits close and stay between perihelion and aphelion;
- seasons line up with known solstice dates.

As an independent check, Skywatch's computed Mars season (Ls 341.5° on 25 Aug 2026) matches the Ls 341 that Curiosity itself reported for that day.

## Run it

```bash
python3 -m http.server -d web 8000     # open http://localhost:8000
python3 pipeline/fetch_daily.py        # refresh the saved copies in web/data (needs `pip install requests`)
```

A GitHub Action refreshes the data every morning and publishes `web/` to GitHub Pages. The page also fetches the picture of the day, Mars weather and Earth photos live in your browser, and falls back to the saved copies if NASA is slow.

## Data

[NASA APOD](https://science.nasa.gov/apod/) · [JPL approximate planetary positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html) · [Curiosity REMS weather](https://mars.nasa.gov/msl/weather/) · [NASA EPIC](https://epic.gsfc.nasa.gov/) · [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). Not affiliated with NASA.

## Coming next

- Asteroid watch: this month's close approaches on their real orbits, with "if it hit" energy and crater estimates.
- Exoplanet hunter: searching real TESS light curves for transiting planets, checked against NASA's Exoplanet Archive.
