# Kano Run — Task 12: Correct mobile geometry optimizer startup wiring

## Why this update exists

The current public `main` source contains `js/KanoMobileGeometryBudgetUpgrade.js`, and that module imports `./KanoMobileGeometryBudgetRules.mjs`. The rules module is missing from the current public `main` (`raw.githubusercontent.com/.../js/KanoMobileGeometryBudgetRules.mjs` returns 404). In addition, importing the optimizer from `KanoTrafficMix.js` alone is not a reliable startup guarantee because the main app entrypoint imports `KanoAnimationTrafficUpgrade.js`, while `main.js` then constructs `ModelManager`.

This package supplies the missing rules module and one import-line integration diff for `js/KanoAnimationTrafficUpgrade.js`, a module already imported by `js/main.js`. `index.html`, `main.js`, `KanoModelAssetVisualUpgrade.js`, `ModelManager.js`, and `renderer3d.js` are not modified. This places the optimizer in the active app import graph after the separately loaded visual upgrade has registered its `ModelManager.load` wrapper, but before `main.js` creates the manager instance.

## Included files

- `js/KanoMobileGeometryBudgetRules.mjs` — new pure rules module required by the existing optimizer.
- `integration/KanoAnimationTrafficUpgrade.js.diff` — small import-line edit for the existing module already imported by `main.js`.
- `tests/KanoMobileGeometryBudgetRules.test.mjs` — focused tests for geometry-budget rules.
- `tests/KanoMobileGeometryBudgetStartup.test.mjs` — tests for the intended integration target and protected-file constraints.

The existing `js/KanoMobileGeometryBudgetUpgrade.js` remains unchanged. Do not replace it. No model files or any files under `public/` are changed.

## Install with File Explorer

1. Extract the ZIP.
2. Copy `js/KanoMobileGeometryBudgetRules.mjs` into your project’s `js` folder, preserving the `.mjs` extension and exact filename.
3. Copy both `.mjs` tests into the project’s `tests` folder.
4. Apply the import-only edit in `integration/KanoAnimationTrafficUpgrade.js.diff` to `js/KanoAnimationTrafficUpgrade.js`. The diff is deliberately small; do not replace that file.
5. If you previously applied the Task 11 integration diff that imports the optimizer from `KanoWorldPerformanceInstancingUpgrade.js`, remove that one added import before using this corrected integration point. Avoid loading the optimizer from multiple early hooks because wrapper order matters.

## Budget behavior

The existing optimizer targets 4,800 triangles per eligible mobile model and reports against a 5,000-triangle hard limit. It simplifies eligible static geometry in memory. Skinned, morph-target, multi-material/grouped, explicitly protected, or otherwise unsupported geometry remains unchanged and is reported. The source GLB bytes under `public/assets/models/` are not modified.

## Verification

- Focused rules and package integration tests: run `node --test tests/*.test.mjs` in the extracted package.
- JavaScript module syntax: checked for the new `.mjs` modules.
- ZIP integrity: checked after packaging.
- Full repository `npm test`: not run here because the full current working tree and its configured test script were not available in this environment.
- Production build, live browser startup, actual model reductions, and phone performance: **not verified**.

The package-level integration test verifies the intended diff target, not the running app. Confirm in a real browser using `window.kanoMobileGeometryBudgetAudit()` after the app has loaded on a touch device. Check that `enabled` is true and inspect each loaded model's `status`, `originalTriangles`, and `finalTriangles`.
