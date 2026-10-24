# Kano Run — Task 8: Activate Mobile Geometry Budget

## Why this update exists

The latest public `main` source contains `js/KanoMobileGeometryBudgetUpgrade.js` and a test file that imports `js/KanoMobileGeometryBudgetRules.mjs`, but that rules file returns 404 from the current `main` raw URL. The existing reducer is also not imported by `js/KanoTrafficMix.js`. That means the budget logic is not reliably active during normal startup.

This update fixes that narrow integration gap. It does not use an older ZIP as its source.

## Files included

- `js/KanoMobileGeometryBudgetRules.mjs` — new pure rules module required by the existing reducer.
- `js/KanoTrafficMix.js` — complete current-main replacement with one additional side-effect import for the existing mobile reducer. Existing traffic categories and thresholds are preserved.
- `tests/KanoMobileGeometryBudgetIntegration.test.mjs` — new focused regression tests for the rules and the startup import.

The existing `js/KanoMobileGeometryBudgetUpgrade.js` is intentionally not included or replaced. Keep the current `main` copy. The protected startup, gameplay, renderer, UI, device-tier, phone-comfort, model-manager, regression-guard, HTML, and all `public/` files remain unchanged.

## Install

1. Extract the ZIP in File Explorer.
2. Merge the package `js` folder into the project's `js` folder; replace `KanoTrafficMix.js` and add `KanoMobileGeometryBudgetRules.mjs`.
3. Copy the new test to the existing `tests` folder.
4. Do not copy an older `KanoMobileGeometryBudgetUpgrade.js` over the current file.

## Behavior

On touch/coarse-pointer/mobile viewports, the already-present reducer now has the missing rule module and is imported from the startup dependency `KanoTrafficMix.js`. The reducer attempts in-memory simplification only for eligible static, single-material geometry. Skinned, morph, grouped/multi-material, or explicitly protected geometry remains untouched. Original GLB files under `public/assets/models/` are never modified. Models that cannot be safely simplified remain over budget and are reported rather than replaced with placeholders.

## Verification

The included focused test file should be run with Node's built-in test runner. Full repository `npm test` was not run in this environment. No real browser or physical-phone test was performed, so runtime performance improvement is **not verified**.
