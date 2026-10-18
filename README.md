# Kano Life 4.2.0 (Kano Run)

Kano Life is a mobile-first endless-lane driving and street-life game set in Kano State, northern Nigeria. It uses Vite, vanilla JavaScript ES modules, and Three.js 0.170+. Game Developer: **Hassan Zakariya**.

## Release status

This is an implementation candidate for `zaksz1991/kano-run`; it has not been pushed to GitHub or deployed to Vercel from this environment. It does not bundle the repository's GLB/JPG/audio packs. The asset catalog was aligned to the case-sensitive asset listing supplied by the owner. Apply the code overlay without deleting `public/assets/models/`, `public/assets/environment/`, or `public/assets/audio/`.

`npm run check` and **53/53 automated tests** pass. The Vite build has not been verified because `node_modules` is not installed here and the previous npm registry connection failed. No browser screenshots or live GLB requests have been verified, so the production state must not be described as shipped yet.

## Install, test, build

- `npm install` installs Three.js and Vite.
- `npm run dev` starts the development server.
- `npm run check` syntax-checks source modules with Node.js.
- `npm test` runs the native Node regression suite.
- `npm run build` calls `node ./node_modules/vite/bin/vite.js build` to avoid Vite `.bin` permission issues.
- `npm run preview` previews the production output.

For Vercel, set the repository root as the project root, build command `npm run build`, and output directory `dist`. `.github/workflows/ci.yml` checks syntax, tests and the Vite build on pushes and pull requests to `main`.

## Controls and diagnostics

- Touch: left/right, brake, gas, horn. Horizontal swipes also change lanes.
- Keyboard: Left/Right or A/D to steer; W/Up to accelerate; Space/Down to brake; H to honk; Escape to open the menu.
- Career speed is capped at **38 km/h base** (driver modifiers apply). Free roam is capped at **36 km/h base**. Time Attack is intentionally a separate arcade race mode, with a **150 km/h base cap** so the 3.5 km medal target is achievable. Holding gas accelerates; releasing it lets the keke coast to a stop.
- Ordinary single-person roadside pickup/drop/fuel interactions work up to **12 km/h** when aligned to the shoulder. The marked **GENERAL CHECKPOINT · KEKE STOP** requires the driver to slow to **6.5 km/h or less** for group/large-passenger boarding.
- The pause menu has all six modes, Hausa/Yoruba/Igbo dialects, camera, one-/two-way traffic, sound, renderer quality, daily missions, radio, local Naija standings, and the garage.
- `/?force2d` selects Canvas 2D. `/?force3d` requests WebGL for visual diagnosis.
- WebGL failure or context loss replaces the active canvas before creating a Canvas 2D context. The 2D fallback has its own drawing for the bedroom, compound, neighbourhood, roadside food stall, school junction, park garage, road, traffic, keke and collision plane.
- On mobile, low-FPS fallback happens only after performance remains below 10 FPS for about eight seconds, unless 3D is forced.
- Successful model loads should log `[ModelManager] OK <key> ← assets/models/...`; the player replacement logs `[Kano Life] Player keke visible using ...`. Scene models log `[Kano Life] scene model ... installed in ...`.

## Kano morning and street-life routines

The opening is now a **seven-scene Northern Nigerian morning** rather than a single breakfast screen: wake up in a modest bedroom; help with household water and compound chores or leave; walk past neighbourhood shops; choose akara with pap, masa and tea, bread and tea, pap only, or skip breakfast; pass market-road sellers and pedestrians; reach the school/mosque junction; then enter the guarded keke park, greet Mallam security and inspect/unlock the same player vehicle.

The road life loop can also present school-run passengers, small market deliveries, roadside vulcanizer service, fuel queue stress, wedding convoys, sachet-water/phone-credit sellers, goats crossing at the outskirts, market-day foot traffic, Juma'a traffic, harmattan haze, rain puddles, muddy roads and school/mosque crossing pressure. These are optional choices/modifiers rather than compulsory tasks every few seconds. KAROTA remains Kano's checkpoint authority; the game deliberately does not use LASTMA.

## Passenger stops and vehicle contact

- Ordinary individual pickups, drop-offs and fuel stops appear at a roadside pull-in, not the middle lane.
- Large passengers and groups only appear at the labelled General Checkpoint/Keke Stop. It boards the available marked number of seats (2–4) after the keke stops nearly completely. Individual roadside pickups consume one seat.
- Same-direction traffic only closes the gap if the player is travelling faster. Faster traffic ahead recedes. Oncoming vehicles occur only in two-way mode and close at the sum of both vehicles' speeds.
- Model-forward correction is applied inside the cached GLB so the traffic root can represent same-direction or oncoming orientation. Contact uses relative speed; low-speed scrapes are recoverable and high-speed impacts cause larger damage.
- In Canvas 2D, near traffic is projected to the player-keke height rather than sliding underneath the bottom control row. Road markings, traffic and pickup pads move using the same distance/speed convention; pads stop moving while stopped.

## Modes and progression

- **Career:** fares, pickup/drop, missions, KAROTA decisions, fare negotiation, rich-man drama, robber events, fuel, condition, tyres, collisions and three life savers.
- **Time Attack:** 3.5 km; Gold ≤95 seconds, Silver ≤125 seconds, otherwise Bronze. Higher speed is confined to this race mode.
- **Fuel Gauge Challenge:** starts with 42% fuel and aims for 4 km.
- **Match Drop:** correct destination gives ×1.75; a wrong stop gives ×0.35 and resets the streak.
- **Potholes Challenge:** reach 3 km with fewer than eight pothole hits.
- **Free roam:** low-pressure driving capped below Career.

There are 60+ Kano route names, seven driver profiles, unlockable drivers/paint, Kano-labelled radio stations, Hausa-first flavour plus Yoruba/Igbo challenge language, WAT daily login rewards and claimable daily missions, recent runs, achievements, best times, and top-three local tribe boards. Progress remains in that browser profile; tribe boards are not an online leaderboard.

## Model, texture and audio map

The app loads models beneath `public/assets/models/`, served at `/assets/models/`. Preserve the existing asset directory. Paths are case-sensitive and spaces are URL-encoded.

- **Player keke:** `vehicles/keke/keke-3.glb` first, then `keke-1.glb` through `keke-8.glb`.
- **Cars:** `vehicles/cars/quaternius_cc0-normal-car-1190.glb`, `lowpoly_bmw_e36_m3.glb`, `2006_kia_ceed.glb`, `2005_chrysler_300.glb`, and `1979_chevrolet_impala.glb`.
- **SUV/truck:** `quaternius_cc0-suv-1402.glb`, `quaternius_cc0-truck-1449.glb`, `peterbilt_352.glb`, `volvo_fh.glb`, `volvo_fh_cement_truck.glb`, and `2002_dodge_ram_2500.glb`.
- **Special vehicles:** `vehicles/special/{ambulance,bus,karota,okada,police}.glb`.
- **People:** existing GLBs under `characters/passengers/` (hijab/men/suit models) and `characters/pedestrians/` (pedestrian, school-age, woman and security models).
- **Buildings:** `world/buildings-suburban/building-type-d.glb` through `building-type-u.glb`; `world/buildings-industrial/building-a.glb` through `building-t.glb`.
- **Flyovers:** `world/roads/kano_urban_flyover.glb`, with `kai_tak_flyovers.glb` and `kowloon_bay_flyover.glb` alternatives. Procedural spans appear immediately and loaded GLBs replace them where usable.
- **Roads and props:** `world/roads/light-square.glb`, construction cones/barriers, electricity poles; `world/props/Bench.glb`, `Traffic-Light.glb`, `Stop-sign.glb`, `Police-Car.glb`, and `SUV.glb`.
- **Textures:** `/assets/environment/ground/asphalt.jpg`, `market-stall.jpg`, pothole images, and existing audio stations/effects under `/assets/audio/`.

`ModelManager` tries ordered alternatives, normalizes height, checks abnormal bounds, repairs material visibility, grounds wheels/feet, caches clones and keeps fallback geometry visible when a model is missing or rejected. On phones, the keke and essential traffic models load first; pedestrians, buildings and flyovers follow in progressive batches. The catalog matching does not itself prove that the real files return HTTP 200 or look correct in a browser.

## Local colour and billboards

Promotional links/billboards point to [RuffNeck Entertainment](https://ruffneck-entertainment.vercel.app) and [RuffNeck Learn](https://ruffneck-lms.vercel.app). Northern details include Hausa greetings, market sellers, school and mosque junctions, wedding traffic, local route names and roadside keke stops.

## Release checklist

- Preserve existing model, texture and audio assets while applying the overlay.
- Run `npm run check`, `npm test` and `npm run build` in a network-enabled repository environment.
- Test `/`, `/?force2d`, and `/?force3d` on desktop and mobile; verify actual `[ModelManager] OK ...` logs.
- Confirm GLB vehicle fronts point away from the camera in normal one-way play; verify bridge deck elevation and scale.
- Complete the morning sequence, select non-akara breakfast options, greet security, drive, load at roadside, stop at General Checkpoint with a group, drop passengers, and encounter KAROTA/events.
- Verify collisions line up visually with the player, touch controls work in portrait/landscape, and no event/continue button leaves the game stuck.
- Push to GitHub and deploy to Vercel only after the production build and browser QA pass.
