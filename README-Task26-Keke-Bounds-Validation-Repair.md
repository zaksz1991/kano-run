# KANO LIFE — Task 26: Catalogued Keke Bounds-Validation Repair

## Purpose

Task 25 added catalog failover when an imported keke is rejected. The validation adapter still did not re-evaluate the specific `implausible-keke-bounds` rejection, even when root-relative normalized mesh geometry could prove that the catalogued asset has credible vehicle dimensions and wheel/chassis evidence. In that case the loader could test every catalog entry and still leave the yellow procedural fallback active.

Task 26 closes that narrow validation gap. It remeasures visible mesh geometry relative to the candidate root, and it only overrides `implausible-keke-bounds` for the known `vehicles/keke/keke-1.glb` through `keke-8.glb` catalog when all dimensional and wheel/body evidence checks pass. It does not override missing renderable geometry, invalid transforms, non-finite bounds, out-of-range local dimensions, or unrelated assets/rejection reasons.

## Package contents

- `js/KanoKnownKekeModelAcceptanceRepair.js` — complete replacement of the validation adapter.
- `js/KanoKnownKekeValidationRules.js` — complete replacement of the pure geometry acceptance rules.
- `js/KanoKekeCatalogFailoverRepair.js` and `js/KanoKekeCatalogFailoverRules.js` — the isolated Task 25 failover implementation, included so all dependencies are present.
- `js/KanoWorldPerformanceInstancingUpgrade.js` — complete bridge file, retaining the existing performance/brightness work and failover activation import.
- `tests/KanoKnownKekeValidationRules.test.mjs` and `tests/KanoKekeCatalogFailoverRules.test.mjs` — focused tests. Both `.mjs` files belong in `tests/`, not `js/`.

## Install using File Explorer

1. Extract this ZIP.
2. Copy all five `.js` files in the ZIP's `js` folder into the project's `js` folder, replacing files with the same names.
3. Copy both `.mjs` files in the ZIP's `tests` folder into the project's `tests` folder.
4. Leave `js/renderer3d.js`, `js/ModelManager.js`, `js/main.js`, `js/game.js`, `js/ui.js`, `index.html`, `js/KanoDeviceTier.js`, `js/KanoPhoneComfortUpgrade.js`, `js/KanoModelAssetVisualUpgrade.js`, and everything under `public/` unchanged.

The included bridge retains the previously added Task 25 failover import. No public model asset is altered, renamed, deleted, or added.

## Verification status

- Focused validation and failover tests: run locally; see response summary for results.
- JavaScript syntax checks and ZIP integrity: checked locally.
- Full repository `npm test`: not run because this package is not a checkout of the entire current repository.
- Live browser/phone rendering and actual GLB contents: not verified. Acceptance is limited to candidates that pass the explicit geometry and catalog checks; this package does not claim that a model will load if all GLB requests fail.
