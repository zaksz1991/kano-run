# Kano Life (Kano Run)

Kano Life is a mobile-first endless-lane driving and street-life game set in Kano State, Nigeria. It is built with Vite, vanilla JavaScript ES modules, and Three.js 0.170. Game Developer: **Hassan Zakariya**.

## Project status

This is an upgrade candidate and testable project package, not a verified production release. The project has not been committed to the public GitHub repository or deployed to Vercel from this environment. The native tests and syntax checks pass; the Vite production build and browser-level QA still require an environment where dependencies can be installed.

## Install, test, build

- `npm install` installs Three.js and Vite.
- `npm run dev` starts the development server.
- `npm run check` checks the source modules with Node.js.
- `npm test` runs the native Node regression suite.
- `npm run build` runs `node ./node_modules/vite/bin/vite.js build` to avoid Vite `.bin` permission issues.
- `npm run preview` previews the production output.

For Vercel, use the repository root, build command `npm run build`, and output directory `dist`. `.github/workflows/ci.yml` runs dependency installation, syntax checks, tests, and the production build on pushes and pull requests to `main`.

## Renderer and diagnostics

- Default: Three.js/WebGL when it initializes successfully.
- `/?force2d`: force the visible Canvas 2D road game.
- `/?force3d`: request WebGL and disable the low-FPS auto-fallback for diagnostic purposes.
- WebGL failure or context loss switches to a **fresh canvas** before requesting a 2D context.
- On mobile, the watchdog switches to 2D only below 10 FPS for about eight consecutive seconds; it does not fall back just because the game dips below 18 FPS.
- Inspect `window.__KANO_RENDER_MODE__` and console logs. Successful optional GLB loads should emit `[ModelManager] OK <key> ← assets/models/...`.

## Controls

- Touch: left/right, brake, gas, horn. Swiping horizontally across the road also changes lanes.
- Keyboard: Left/Right or A/D to steer; W/Up to accelerate; Space/Down to brake; H to honk; Escape to open the menu.
- Slow to nearly zero to load/drop passengers or refill at a fuel pad.
- The pause menu contains game modes, dialect, camera, one-/two-way traffic, sound, renderer quality, daily missions, radio cycling, local Naija standings, and the garage.

## Modes and systems

- **Career:** fares, passenger pickups/drop-offs, daily and run missions, KAROTA checkpoints, fare negotiation, rich-man drama, fuel, condition, tyres, collision damage, and life savers.
- **Time Attack:** target 3.5 km; Gold at 95 seconds or less, Silver at 125 seconds or less, otherwise Bronze. Best time is stored per route.
- **Fuel Gauge Challenge:** starts at 42% fuel and aims for 4 km.
- **Match Drop:** the passenger destination must match the stop for the ×1.75 reward; incorrect stops pay ×0.35 and reset the streak.
- **Potholes Challenge:** reach 3 km with fewer than eight pothole hits.
- **Free roam:** lower-pressure driving.

There are 60+ Kano route labels, seven driver profiles, unlockable drivers and paint jobs, radio stations, Hausa/Yoruba/Igbo flavour, WAT-based daily login rewards, claimable daily missions, local run history, best scores/times, achievements, and top-three local tribal scoreboards. Run-mission counters accumulate repeatable actions correctly (drops, boards, fares, near misses, refills, VIPs, horn uses, checkpoints and special pickups), while combo and clean-distance objectives track the peak rather than adding repeated snapshots. All progression is local to the current browser profile; tribal boards are not an online leaderboard. Saved values are normalized against known routes, drivers, paint jobs, radio stations, dialects, and settings before the UI uses them.

## Optional GLB assets

No third-party GLBs are included. Add owned/licensed assets below `public/assets/models/`; the directory guide lists accepted catalog paths. Recommended models are low-poly/optimized, correctly oriented, and within realistic vehicle/character bounds.

- `vehicles/keke/keke-1.glb` through `keke-8.glb`
- `vehicles/cars/`: `sedan.glb`, `car.glb`, `taxi.glb`, `suv.glb`, `truck.glb`, `motorcycle.glb`
- `vehicles/special/`: `police.glb`, `karota.glb`, `bus.glb`, `okada.glb`, `ambulance.glb`
- `characters/passengers/`: `hijab_muslim_woman.glb`, `women_in_hijab.glb`, `Man.glb`, `suit.glb`
- `characters/pedestrians/`: `pedestrian.glb`, `Man.glb`
- `world/buildings-suburban/`: `building-1.glb`, `house.glb`, `building.glb`
- `world/buildings-industrial/`: `industrial-building.glb`, `factory.glb`, `building.glb`
- `world/roads/`: flyover paths, street-light alternatives, cones, and gravel/dirt mound alternatives.
- `world/props/`: bench, bus stop, traffic light, stop sign, and market-stall GLB alternatives. Procedural prop stand-ins remain visible when the models are absent.
- Optional asphalt texture: `public/assets/environment/ground/asphalt.jpg`.

The `ModelManager` tries ordered fallback paths, normalizes models to per-type target heights, rejects absurd bounding boxes, repairs materials to render on both sides, clones cached assets, and grounds model wheels/feet at Y=0. The desktop scene also upgrades procedural buildings, flyover, streetlights, market stalls, benches, bus stops, traffic lights, stop signs, cones and dirt mounds when corresponding GLBs load. Missing or unsuitable assets do not prevent gameplay: procedural models remain visible. Mobile preloads only essential vehicle/pedestrian types; desktop can load additional models.

Resource lifecycle: traffic and zone actors release transient geometry/materials when removed. GLB clones mark cache-shared geometry so actor cleanup never frees cached model resources. When switching renderers, the ModelManager disposes cached models and pending loads clean up late results. Rejected malformed models are also disposed rather than retained in GPU memory.

## Cultural content and promotion

The game uses Kano route names, Hausa-first greeting/fare lines, KAROTA (never LASTMA), market stalls, local street details, pedestrians with northern clothing cues, and optional promotional billboards for RuffNeck Entertainment and RuffNeck Learn.

## Current verification boundary

- Native regression suite: **36 tests passed** in the current candidate, including gameplay, save normalization, UI integration and asset-catalog contract tests.
- JavaScript syntax check: passed.
- Vite production build: **not run successfully here**, because Vite is not installed in the package directory and the environment could not reach the npm registry during dependency installation.
- GLB requests/model orientation: not verified with the user's actual asset pack.
- Desktop/mobile visual testing and Vercel deployment: not completed.
