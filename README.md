# Kano Life — Task 11: Restore and activate the mobile geometry-budget adapter

## Why this step exists

The current public `main` version of `js/KanoMobileGeometryBudgetUpgrade.js` imports `./KanoMobileGeometryBudgetRules.mjs`, but the matching `.mjs` module is absent from `main`. The geometry adapter also needs to be imported before `main.js` creates `ModelManager`. The current `index.html` already loads `KanoWorldPerformanceInstancingUpgrade.js` before `main.js`, so this step uses that existing entrypoint.

This package is authored against current public `main` source. It is not based on an older ZIP. It supplies the missing pure-rules dependency and a small integration diff; it does not include or re-export the optimizer itself.

## Files in this package

- `js/KanoMobileGeometryBudgetRules.mjs` — new dependency required by the current optimizer.
- `tests/KanoMobileGeometryBudgetRules.test.mjs` — new focused unit tests.
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` — one small import addition to the current file.

## Install with File Explorer

1. Extract the ZIP.
2. Copy `js/KanoMobileGeometryBudgetRules.mjs` into the project's existing `js` folder. Keep the `.mjs` extension and exact filename.
3. Copy `tests/KanoMobileGeometryBudgetRules.test.mjs` into the existing `tests` folder.
4. Apply the single import addition shown in the integration diff to the existing `js/KanoWorldPerformanceInstancingUpgrade.js`. Do not replace the whole file.

Keep `js/KanoGameplayPresentationRepair.js`, `js/KanoModelAssetVisualUpgrade.js`, `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/ui.js`, `index.html`, `js/KanoDeviceTier.js`, `js/KanoPhoneComfortUpgrade.js`, `js/ModelManager.js`, `tests/KanoRegressionGuard.test.mjs`, and everything under `public/` unchanged.

## Behavior and limitations

- Target: 4,800 triangles per eligible mobile model.
- Hard limit: 5,000 triangles per model.
- Models already at or below the hard limit are not simplified by this rules module.
- Over-budget models are only simplified if the current optimizer identifies eligible static single-material mesh geometry.
- Protected, skinned, morph-target and unsupported grouped/multi-material geometry is preserved and reported if it leaves a model over budget.
- Source GLB files are not modified. The existing optimizer works on derived in-memory geometry and retains source geometry if simplification fails.

## Validation

The focused Node test suite in this package should be run with Node's built-in test runner. These tests cover counting, reduction planning and vertex-removal bounds. They do not prove that the browser import chain succeeds in the whole game.

Full repository `npm test`, startup integration, actual model triangle counts, browser rendering and physical-phone frame pacing were not verified in this environment.
