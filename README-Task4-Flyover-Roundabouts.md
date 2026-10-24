# Kano Run — Task 4: KWANKWASIYYA Flyover Driveability

## Scope

This is an additive renderer adapter based on the current public `main` source inspected at:

- `js/renderer3d.js`
- `js/KanoFlyoverRoundaboutUpgrade.js`
- `js/KanoTrafficMix.js`

It is not built on an earlier ZIP or snapshot. No protected source file or model asset is re-exported.

## What this update changes

- Adds longitudinal entry and exit ramps aligned to the existing flyover deck.
- Adds lightweight lane dashes and red/white side parapets using instanced meshes.
- Hides the existing transverse guard rails that otherwise cross the driving line over the bridge.
- Keeps the rendered player, nearby traffic actors, roadside zones, and mobile instanced traffic at the matching flyover/ramp elevation while the base scene renders.
- Synchronizes ramp movement with the base renderer's 0.72 parallax flyover movement, including signed reverse travel and the existing wrap coordinates.
- Exposes `window.kanoFlyoverDriveabilityAudit()` for runtime inspection.
- Retains existing KWANKWASIYYA signage and roundabout scenery by importing the already-present `KanoFlyoverRoundaboutUpgrade.js`; that file is not changed by this package.

## Roundabout limitation

The roundabout scenery is still **visual-only**. The protected `js/game.js` and `js/renderer3d.js` still use a signed linear road simulation and lane-based steering; real roundabout branching, exits, and path-following cannot be made physically traversable with this additive visual adapter alone. The audit explicitly reports `roundaboutRoutesDriveable: false`. Implementing true route topology would require permission to change those protected core files.

The flyover integration is a visual-driveability adapter over that same linear simulation. It does not introduce wheel physics or surveyed road geometry.

## Files included

- `js/KanoTrafficMix.js` — complete small-module replacement based on current `main`, retaining the selector and adding one side-effect import for the new adapter.
- `js/KanoFlyoverDriveabilityUpgrade.js` — new adapter module.
- `js/KanoFlyoverDriveabilityRules.mjs` — new pure ramp and signed-scroll rules.
- `tests/KanoFlyoverDriveabilityIntegration.test.mjs` — new integration/source-regression tests.
- `tests/KanoFlyoverDriveabilityRules.test.mjs` — new pure-function tests.

Nothing in `public/` is included or modified. The following protected files are not included or modified: `js/KanoGameplayPresentationRepair.js`, `js/KanoModelAssetVisualUpgrade.js`, `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/ui.js`, `index.html`, `js/KanoDeviceTier.js`, `js/KanoPhoneComfortUpgrade.js`, `js/ModelManager.js`, and `tests/KanoRegressionGuard.test.mjs`.

## Install

1. Extract the ZIP with File Explorer.
2. Merge the package `js` folder into the project's existing `js` folder. Replace `KanoTrafficMix.js` with the included current-main-derived file and add the two new adapter/rules files.
3. Copy the two new tests into the existing `tests` folder.
4. Do not replace any protected file or anything under `public/`.

## Verification

- Focused tests: **12 passed, 0 failed** (`node --test tests/*.test.mjs` in the extracted package).
- JavaScript syntax checks: **5 included modules passed**.
- ZIP integrity: checked after packaging.
- Full repository `npm test`: **not run** in this environment.
- Real-browser rendering, live flyover drive-through, roundabout routing, and physical-phone performance: **not verified**.

The focused tests cover ramp-height profile, forward/reverse recycling, invalid movement state, and the expected integration hooks. They do not replace an actual in-game visual test.
