# Kano Life — Task 23: Catalogued Keke Structure-Validation Repair

## What this update addresses

The current renderer can reject a real catalogued keke model when its GLB uses generic mesh names. When ModelManager attaches a seated driver, the failure may be reported as `character-only-model-no-vehicle-structure`. Task 22 only covered `missing-vehicle-structure-evidence`; this complete replacement extends that narrow exception to both name-evidence failures.

The model is accepted only when all conditions hold:

- The path is one of the existing `vehicles/keke/keke-1.glb` through `keke-8.glb` files.
- The original rejection is one of the two name-evidence-only reasons above.
- Measured dimensions are plausible for ModelManager's normalised keke model.
- Renderable geometry shows either at least two wheel-like components, or a substantial low body component plus at least eight visible meshes.

All other renderer rejection reasons remain unchanged. This package does not create, rename, replace or modify assets under `public/`; it does not touch protected engine files.

## Install using File Explorer

1. Unzip this package.
2. Copy the complete `js/KanoKnownKekeModelAcceptanceRepair.js` and `js/KanoKnownKekeValidationRules.js` files into the project's `js` folder, overwriting the same two Task 22 files if those are already installed. These are full-file replacements, not snippets.
3. If the Task 22 import is already present in `js/KanoWorldPerformanceInstancingUpgrade.js`, no additional wiring change is needed. The import must remain exactly `import './KanoKnownKekeModelAcceptanceRepair.js';` and must load before `main.js` creates the renderer.
4. If that import was never added, use the supplied integration diff as a one-line reference for adding it to the current bridge. Do not replace the bridge file with this diff.
5. The `.mjs` test belongs in `tests/`, not `js/`.

## Focused test results

The focused rules test covers catalog paths 1–8, path traversal, both covered validator reasons, unrelated failure preservation, dimensions, mesh thresholds, and missing geometry evidence.

The package authoring environment runs only these self-contained focused tests. It has not run the whole repository `npm test`, loaded the actual GLB files in a browser, or verified the live mobile game. Do not interpret the focused unit tests as proof that `keke-3.glb` passes its runtime geometry check on the live build.

## Runtime diagnostic

After the module loads, the browser console can inspect `window.kanoKnownKekeModelAcceptanceAudit()` to see whether the adapter installed, which catalogued path was checked, the original rejection reason, measured bounds/component evidence, and whether geometry justified acceptance.
