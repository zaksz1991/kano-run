# Kano Life — Task 24: Keke Catalog Failover Repair

## What this update changes

The current model manager loads the first catalogued keke GLB that passes HTTP/parse and broad dimension checks. The renderer then applies a separate visual-structure check. If that first loaded GLB fails the renderer check, the player can remain on the procedural yellow keke even when another catalogued model might work.

Task 24 adds a constrained failover path: when a known `vehicles/keke/keke-1.glb` through `keke-8.glb` candidate is rejected for a specific visual-structure or bounds reason, the renderer asks the existing `ModelManager` to try the next untested catalog entry. The current vehicle remains active until an alternative is accepted. It uses the Task 23 geometry-backed acceptance adapter first, then tries other catalogued GLBs if that model is still rejected.

The adapter does not edit `renderer3d.js` or `ModelManager.js`, change driving physics, or modify anything inside `public/` or `public/assets/models/`. It does not dispose shared GLB geometry because traffic instances may use the same cache resources. It restores the catalog array order when failover exits and restores the original cached keke if no alternative is accepted.

## Files included

- `js/KanoWorldPerformanceInstancingUpgrade.js` — complete replacement based on the current public `main` version, retaining its existing mobile/desktop world instancing, brightness profile, and optional performance audit panel while activating Task 24.
- `js/KanoKekeCatalogFailoverRepair.js` — runtime failover adapter.
- `js/KanoKekeCatalogFailoverRules.js` — isolated path/retry policy helpers.
- `js/KanoKnownKekeModelAcceptanceRepair.js` and `js/KanoKnownKekeValidationRules.js` — complete Task 23 dependencies.
- `tests/KanoKekeCatalogFailoverRules.test.mjs` — focused tests. Keep this in `tests/`, not `js/`.

## Install using File Explorer

1. Unzip this package.
2. Copy all five `.js` files in the package's `js` folder into the project's `js` folder, replacing files with the same names. The included world-performance bridge is a complete file, not a patch or partial snippet.
3. Copy `tests/KanoKekeCatalogFailoverRules.test.mjs` into the project's `tests` folder.
4. Do not copy anything into `public/` and do not replace protected files such as `renderer3d.js`, `ModelManager.js`, `main.js`, `game.js`, `ui.js`, or `index.html`.

## Runtime audit

After the bridge loads, inspect `window.kanoKekeCatalogFailoverAudit()` in the browser console. The report shows whether the adapter installed, the initially rejected model and reason, alternative paths checked, any accepted alternative, and a stop reason. The existing `window.kanoKnownKekeModelAcceptanceAudit()` remains available for Task 23's geometry decision.

## Verification completed here

- Focused policy tests: 5 passed, 0 failed.
- JavaScript syntax checks: passed for the new modules and included full bridge.
- ZIP integrity check: passed.
- Full repository `npm test`: not run in this packaging environment.
- Actual GLB loading, browser startup, and live phone gameplay: not verified. This package is designed to retry alternatives; it does not guarantee an available catalogued asset will pass validation.
