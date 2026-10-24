# Kano Life — Task 6: Compact Mobile Driving HUD

## What this step changes

This is a mobile-only HUD decluttering pass. It keeps **speed, fuel, shift fares, and passenger count** visible, and moves the secondary stats, mission summary, route labels, and minimap into a collapsible `MORE` drawer. The current road-navigation guide remains visible as a compact strip, so this does not remove turn choices or modify navigation behavior.

The compact layer mirrors the existing DOM values and reads current-run fares from the existing `Game` instance. It does not modify gameplay calculations, wallet payouts, save data, vehicle assets, or rendering resolution. It throttles mirror updates to approximately 8 Hz and only writes text when values change.

## Exact files added

- `js/KanoCompactDrivingHudUpgrade.js`
- `js/KanoCompactDrivingHudRules.mjs`
- `tests/KanoCompactDrivingHudUpgrade.test.mjs`
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff`

## One-line integration edit

The current `index.html` already loads `js/KanoWorldPerformanceInstancingUpgrade.js` before `js/main.js`. To activate this add-on without modifying any protected file, add the one import shown in the diff to `js/KanoWorldPerformanceInstancingUpgrade.js`, immediately after its existing `import { KanoAtmosphere } from './KanoAtmosphere.js';` line.

Do not replace that entire existing module. Apply only the single import line. This file is not listed among the protected files in the user's instructions. `index.html`, `ui.js`, `main.js`, `game.js`, `renderer3d.js`, `KanoDeviceTier.js`, `KanoPhoneComfortUpgrade.js`, `KanoModelAssetVisualUpgrade.js`, `ModelManager.js`, `KanoRegressionGuard.test.mjs`, and everything under `public/` are not edited or included.

## Fares vs wallet

The visible MONEY field is labelled **FARES** and reflects unbanked earnings for the current shift (`game.s.fares`). It deliberately does not label the banked wallet as live earnings: current fares are banked by the existing end-of-run logic. The wallet remains available on existing menu screens.

## Focused verification

Run the included focused tests using Node's test runner. These test the formatting and state rules, and confirm that the integration stays outside protected paths. The full repository `npm test` was not run in this build environment, and neither a live-browser visual test nor physical-phone performance test was performed. Treat appearance and phone comfort as **not verified** until tested on the device.
