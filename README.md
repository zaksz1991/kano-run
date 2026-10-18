# Kano Life 4.1.0 (Kano Run)

Kano Life is a mobile-first endless-lane driving and street-life game set in Kano State, northern Nigeria. It uses Vite, vanilla JavaScript ES modules, and Three.js 0.170+. Game Developer: **Hassan Zakariya**.

## Project and release status

This is an implementation candidate for the existing `zaksz1991/kano-run` repository. It has **not** been pushed to GitHub or deployed to Vercel from this environment. It does not bundle the user's existing GLB pack; the model catalog has been aligned to the case-sensitive asset paths in the repository tree supplied for this audit. Apply code changes without deleting or replacing `public/assets/models/` or the audio assets.

The Node regression suite and JavaScript syntax checks pass. A Vite production build and real browser/WebGL session have not been verified here because Vite is not installed in this working package and dependency installation previously failed when the npm registry could not be resolved.

## Install, test, build

- `npm install` installs Three.js and Vite.
- `npm run dev` starts the development server.
- `npm run check` syntax-checks the source modules with Node.js.
- `npm test` runs the native Node regression suite.
- `npm run build` runs `node ./node_modules/vite/bin/vite.js build` to avoid Vite `.bin` permission issues.
- `npm run preview` previews the production output.

For Vercel, use the repository root, build command `npm run build`, and output directory `dist`. `.github/workflows/ci.yml` runs dependency installation, syntax checks, tests, and the production build on pushes and pull requests to `main`.

## Controls and diagnostics

- Touch: left/right, brake, gas, horn. Horizontal swipes also change lanes.
- Keyboard: Left/Right or A/D to steer; W/Up to accelerate; Space/Down to brake; H to honk; Escape to open the menu.
- Brake nearly to zero before loading or dropping passengers or refilling at a fuel pad.
- The pause menu has all six game modes, dialect, camera, one-/two-way traffic, sound, renderer quality, daily missions, radio, local Naija standings, and the garage.
- `/?force2d` selects the Canvas 2D renderer. `/?force3d` requests WebGL and disables automatic low-FPS switching for diagnosis.
- WebGL failure/context loss replaces the render canvas before asking for a 2D context. The 2D renderer also draws the dedicated parked-keke garage scene during the morning sequence.
- Mobile changes to 2D only after performance stays below 10 FPS for about eight seconds, unless 3D is explicitly forced. It does not switch for a small FPS dip.
- Successful model loads should log `[ModelManager] OK <key> ← assets/models/...`; the player replacement logs `[Kano Life] Player keke visible using ...`.

## Kano morning routine

The opening is a short interactive sequence: wake up at about 06:05, step into the Kano neighbourhood, stop at a roadside stall for akara and pap (or pap only/skip), walk to the keke park, greet Mallam security, and unlock the same player Adaidaita Sahu model before starting the shift. The meal costs ₦450 for akara plus pap or ₦250 for pap. Eating breakfast gives a small 5% fare bonus for that run. A real 3D garage/parking yard is shown in WebGL; the 2D fallback renders a matching garage and visible three-wheeled keke.

The road camera targets lower in the view so the driver's keke is not hidden under the mobile controls. The procedural fallback is a three-wheel keke with a driver, open passenger space, canopy, windshield, and visible headlights rather than a generic box. The model loader swaps in the real keke GLB when available. Road movement, lane dashes, and zone motion share a consistent speed-to-world scale; fare pads stop moving when the player stops.

## Modes and systems

- **Career:** fares, passenger boarding and drop-offs, missions, KAROTA checkpoints, negotiation, rich-man drama, robber events, fuel, condition, tyres, collisions, and life savers.
- **Time Attack:** 3.5 km target; Gold at 95 seconds or less, Silver at 125 seconds or less, otherwise Bronze. The race mode has a higher speed cap than normal city driving.
- **Fuel Gauge Challenge:** starts at 42% fuel and aims for 4 km.
- **Match Drop:** matching the passenger's destination earns the larger multiplier; wrong stops get a reduced payout and reset the streak.
- **Potholes Challenge:** reach 3 km with fewer than eight pothole hits.
- **Free roam:** lower-pressure driving, slower than Time Attack.

Career cruise target is 27 km/h before the selected driver's modifier, with a 68 km/h base cap. Free roam cruises at 30 km/h with a 62 km/h base cap. Time Attack cruises at 42 km/h and has a 140 km/h base cap, so a Gold time is possible when the player drives cleanly and holds gas.

There are 60+ Kano route labels, seven driver profiles, unlockable drivers and paints, Kano-labelled radio stations, Hausa-first flavour plus Yoruba/Igbo challenge language, WAT daily login rewards and claimable daily missions, recent runs, achievements, best times, and top-three local tribal boards. Progress remains on that browser profile; tribal boards are not an online leaderboard.

## Model and texture mapping

The app requests assets below `public/assets/models/`, which Vite serves at `/assets/models/`. Preserve the existing asset directory. Catalog paths use the real names supplied in the audit and are case-sensitive.

- **Player keke:** `vehicles/keke/keke-3.glb` first, then `keke-1.glb` through `keke-8.glb`.
- **Cars:** `vehicles/cars/quaternius_cc0-normal-car-1190.glb`, `lowpoly_bmw_e36_m3.glb`, `2006_kia_ceed.glb`, `2005_chrysler_300.glb`, and `1979_chevrolet_impala.glb`.
- **SUV/truck:** `quaternius_cc0-suv-1402.glb`, `quaternius_cc0-truck-1449.glb`, `peterbilt_352.glb`, `volvo_fh.glb`, `volvo_fh_cement_truck.glb`, `2002_dodge_ram_2500.glb`.
- **Specials:** `vehicles/special/{ambulance,bus,karota,okada,police}.glb`.
- **People:** valid files from `characters/passengers/` such as `hijab_muslim_woman.glb`, `women_in_hijab.glb`, `Man.glb`, `Man in Suit.glb`; and `characters/pedestrians/` such as `muslim_girl.glb`, `pedestrian.glb`, `Man in Long Sleeves.glb`, and `police_man.glb`.
- **Buildings:** `world/buildings-suburban/building-type-d.glb` through `building-type-u.glb`; industrial models `world/buildings-industrial/building-a.glb` through `building-t.glb`.
- **Flyovers:** `world/roads/kano_urban_flyover.glb`, with `kai_tak_flyovers.glb` and `kowloon_bay_flyover.glb` as ordered alternatives. Two or three bridge spans are visible using procedural fallbacks while the available GLB loads.
- **Street lights and road details:** `world/roads/light-square.glb`, `light-curved.glb`, construction cones/barriers, electricity poles, and `environment/ground/photoscan_-_pothole_1.glb`.
- **Props:** use exact case, e.g. `world/props/Bench.glb`, `Traffic-Light.glb`, `Stop-sign.glb`, `Police-Car.glb`, and `SUV.glb`. There is no dedicated bus-stop GLB in the listed pack, so the app retains its purpose-built shelter instead of stretching an unrelated road piece into a bus stop.
- **Textures:** `/assets/environment/ground/asphalt.jpg`, `/assets/environment/ground/market-stall.jpg`, and the supplied pothole textures.

`ModelManager` tries ordered alternatives, encodes spaces in filenames, normalizes per-type height, rejects implausible bounds, repairs materials to render on both sides, clones cached models, and keeps wheels/feet on the road. Real vehicle GLBs replace road traffic placeholders after loading; different loaded character models replace different roadside pedestrians. On phones, the essential models load first and the remaining traffic/building/flyover/character models load in small background batches. Missing or unsuitable files should leave the procedural fallbacks visible rather than an empty road.

## Monetization and local colour

In-world billboards and start-screen promos link to [RuffNeck Entertainment](https://ruffneck-entertainment.vercel.app) and [RuffNeck Learn](https://ruffneck-lms.vercel.app). Northern life details include Hausa greetings, market stalls, Hausa/Yoruba/Igbo flavour, KAROTA (not LASTMA), pedestrians in northern clothing, and locally named Kano routes.

## Current verification boundary

- **43/43 Node tests passed** after the latest morning-routine, real-model-path, road-speed, flyover, and 2D-garage updates.
- `npm run check` passed for the source modules.
- JSON/package script validation passed.
- Vite production build: **not verified** because Vite is not installed here; an earlier npm installation attempt could not resolve `registry.npmjs.org`.
- Actual GLB HTTP responses, model facing/quality, browser/WebGL visuals, mobile performance, and Vercel deployment: not yet verified.
