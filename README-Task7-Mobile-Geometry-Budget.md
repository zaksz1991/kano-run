# Kano Life — Task 7: Mobile GLB Geometry Budget

## Purpose

This update directly addresses the measured mobile model-complexity problem. On mobile viewports, it simplifies eligible, static geometry from the real GLB models already loaded by the current ModelManager. It creates a derived, in-memory geometry; it never edits, re-exports, overwrites, deletes or renames a model file in `public/assets/models/`.

The working target is 4,800 triangles per model, leaving a 200-triangle margin below the 5,000-triangle hard limit.

## Files in this package

- `js/KanoMobileGeometryBudgetUpgrade.js` — new runtime adapter. It wraps the existing `ModelManager.load` method after the current GLB visual-upgrade wrapper, simplifies eligible mesh geometry before the model is put back into the cache, and reports results.
- `js/KanoMobileGeometryBudgetRules.mjs` — new pure rules for triangle counts and reduction planning.
- `tests/KanoMobileGeometryBudgetUpgrade.test.mjs` — new focused tests for the pure budget rules.
- `integration/KanoTrafficRuntimeIntegrationUpgrade.js.diff` — one import line needed to load the adapter before main.js constructs the model manager.

No protected file and no file under `public/` is included or changed. The only existing-source edit is one import line in `js/KanoTrafficRuntimeIntegrationUpgrade.js`, which the current `KanoModelAssetVisualUpgrade.js` imports before the final gameplay bootstrap.

## Safety constraints

- Desktop viewports are unchanged.
- Original packaged GLBs are never changed.
- The existing model catalogue and its intentional load order remain unchanged.
- Skinned meshes, morph-target geometry, multi-material group geometry, interleaved attributes, and the seated-driver rig are skipped rather than risking broken deformation, UV/material mapping, or driver anatomy.
- If simplification fails, the original model geometry remains available.
- If unmodifiable geometry alone keeps a model over budget, the diagnostic reports that condition. It does not hide the model or substitute a generated placeholder.
- Geometry simplification is serialized to avoid running many expensive mesh operations simultaneously during phone startup.

## Install

1. Extract the ZIP.
2. Copy both new `.js` / `.mjs` files from `js/` into the existing project `js/` folder.
3. Copy the new test file into `tests/`.
4. Apply the single import-line edit supplied in `integration/KanoTrafficRuntimeIntegrationUpgrade.js.diff` to the existing `js/KanoTrafficRuntimeIntegrationUpgrade.js`. Do not replace that file.

Do not modify `KanoGameplayPresentationRepair.js`, `KanoModelAssetVisualUpgrade.js`, `main.js`, `game.js`, `renderer3d.js`, `ui.js`, `index.html`, `KanoDeviceTier.js`, `KanoPhoneComfortUpgrade.js`, `ModelManager.js`, `KanoRegressionGuard.test.mjs`, or anything in `public/`.

## Diagnostic

After a mobile game session starts, run:

```js
window.kanoMobileGeometryBudgetAudit()
```

The report contains the original/final triangle count for each cached model, whether the 5,000-triangle hard limit was met, how many geometries were simplified, and which models remain over budget.

## Verification status

The pure rule tests and syntax checks are included with this package. They do not test the actual GLB assets, mesh appearance, shader compatibility, startup timings, or physical phone frame rate. A real-browser and phone visual/performance check remains **not verified**. The full repository `npm test` was not run in this environment.
