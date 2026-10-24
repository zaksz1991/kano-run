# Kano Life — Task 1: Vehicle-to-Vehicle Contact Response

## Base and scope

This update was prepared against the live public `main` branch source currently served by GitHub, using the existing `js/KanoTrafficMix.js` and the current Game collision contract. It does not use one of the older downloadable update ZIPs as its base.

Only these project files are included:

- `js/KanoTrafficMix.js` — complete current-main replacement with one additive import. The original 40/30/30 selector behavior is preserved.
- `js/KanoVehicleCollisionContactUpgrade.js` — new runtime adapter that wraps the existing `Game.moveTraffic` hook, after the core collision test, to hold a newly contacted traffic actor briefly and push it laterally out of the player's collision envelope. The core damage/scoring/spawn logic remains authoritative.
- `js/KanoVehicleCollisionContactRules.mjs` — new pure collision geometry helpers, including a swept-envelope backstop for a visible contact that the core's conservative dimensions classified as a near miss.
- `tests/KanoVehicleCollisionContactUpgrade.test.mjs` — new focused regression tests; existing tests are not changed.

No protected file, `index.html`, `public/`, or model asset is included or overwritten.

## Apply

Copy the package's `js` folder into the project `js` folder, merging folders and replacing `KanoTrafficMix.js` when prompted. Copy the new test file into `tests`.

## Verification limits

The focused tests passed with Node's built-in test runner against the new geometry/backstop rules. The repository root currently serves no `package.json`, so `npm test` was not run. No live browser test was performed. The live collision result therefore remains **not verified**.
