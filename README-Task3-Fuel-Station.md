# Kano Run — Task 3: Fuel Station Forecourt Redesign

## Base and scope

This additive update was authored against the current public `main` source inspected from GitHub, specifically `js/renderer3d.js` and `js/KanoAnimationTrafficUpgrade.js`. It is not based on an older update ZIP or repository snapshot.

The current renderer builds a fuel-zone marker as a translucent green cylinder, a small green `BoxGeometry(0.34, 0.72, 0.34)` pump and a floating FUEL STOP sign. This update replaces those visual elements at runtime without replacing the renderer or changing fuel gameplay.

## What the new forecourt adds

- Concrete roadside apron and clearly marked entry/exit edge lines.
- A recognizable roofed forecourt with support columns and red/white fascia over a dark green canopy.
- Two fuel dispensers with dark displays, visible hoses and nozzles.
- Canopy signage and a roadside PETROL / DIESEL board. No live or invented price is shown.
- Mirrored layout for a fuel zone on either side of the road.
- Mobile-conscious geometry and instanced repeated components; no realtime shadows or point lights are added.
- Texture cleanup when a temporary fuel-zone actor is recycled.
- `window.kanoFuelStationForecourtAudit()` for inspecting the active rendered stations.

This does not change the current fuel consumption, refuelling rules, zone depths, vehicle physics or saved data.

## Integration — one small, complete edit

Protected files are not changed. The forecourt must be registered before normal driving begins. `js/main.js` already imports `KanoAnimationTrafficUpgrade.js`, and that file constructs `KanoGLBAnimationManager` for the active renderer. Apply the included `integration/KanoAnimationTrafficUpgrade.js.diff` to the current `js/KanoAnimationTrafficUpgrade.js`:

1. Add this import beside the existing imports at the top:

   `import { installKanoFuelStationForecourtUpgrade } from './KanoFuelStationForecourtUpgrade.js';`

2. In `KanoGLBAnimationManager`'s constructor, add this one call after `this.disposed = false;` and before `this.elapsed = 0;`:

   `installKanoFuelStationForecourtUpgrade(renderer);`

The included `.diff` records both exact additions. Do not modify `js/renderer3d.js`, `js/main.js`, `js/game.js`, `js/ui.js`, `index.html`, `js/KanoModelAssetVisualUpgrade.js`, any protected phone/guard files, or anything in `public/`.

Copy these new files into the current project:

- `js/KanoFuelStationForecourtUpgrade.js`
- `js/KanoFuelStationForecourtRules.mjs`
- `tests/KanoFuelStationForecourtUpgrade.test.mjs`

No files under `public/assets/models/` are included or overwritten.

## Checks

- `node --test tests/KanoFuelStationForecourtUpgrade.test.mjs`: run the included focused tests from the project root.
- `node --check js/KanoFuelStationForecourtUpgrade.js`: syntax check.
- Full repository `npm test`: not run in this environment.
- Real-browser and phone visuals: **not verified**.

The focused tests cover layout mirroring, valid zone selection, phone footprint dimensions, two-pump spacing, price-safe signage, integration hooks, removal of the legacy green pump/pad, station components, texture cleanup and instanced triangle accounting. They do not replace a visual test of the game.
