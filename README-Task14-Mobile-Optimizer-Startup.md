# Kano Run — Task 14: Correct Mobile Geometry Optimizer Activation

## Why this small patch exists

The currently published `main` source has `js/KanoMobileGeometryBudgetRules.js`, but the optimizer still imports `KanoMobileGeometryBudgetRules.mjs`. That import does not resolve because the `.mjs` file is absent. The current `index.html` already loads `KanoWorldPerformanceInstancingUpgrade.js` before `main.js`, but the world-performance module does not currently import the optimizer.

This patch corrects both wiring problems without creating another rules module, replacing the optimizer, or touching protected files.

## Exact changes

Apply `integration/KanoMobileGeometryBudgetStartup.patch`. It contains only two small edits:

1. Change the optimizer's rules import from `.mjs` to the existing `.js` file.
2. Add a static import of the optimizer to `KanoWorldPerformanceInstancingUpgrade.js`, an existing entrypoint loaded before `main.js`.

Add `tests/KanoMobileGeometryBudgetActivationRegression.test.mjs` to the repository's `tests` folder. It asserts the rules path exists, startup ordering is preserved, mobile-only registration remains in place, and failures keep the original GLB geometry.

No changes are required to `index.html`, `main.js`, `ModelManager.js`, `KanoModelAssetVisualUpgrade.js`, the regression guard, or any file under `public/`.

## Apply using File Explorer

1. Extract the ZIP.
2. Open `integration/KanoMobileGeometryBudgetStartup.patch` and apply its two minimal edits to the named files. Do not replace either complete file.
3. Copy the new regression test into the existing `tests` folder.
4. Keep `js/KanoMobileGeometryBudgetRules.js` as `.js`; do not add or rename any `.mjs` rules file for this patch.

## Verification status

This package was built from the current public `main` source inspection. The full repository test suite and real-browser startup could not be run from this environment. Run the repository's established test command after applying the patch. The new focused test can be run with:

`node --test tests/KanoMobileGeometryBudgetActivationRegression.test.mjs`

The test intentionally reads the repository's actual files, so it must be run after both edits are applied. It is not represented as passing before then.

## Scope

This restores the existing optimizer's intended pre-`main.js` activation path. It does not claim that every GLB will meet the 5,000-triangle limit: unsupported or protected geometry is reported and left intact, and the actual result must be checked with the existing `window.kanoMobileGeometryBudgetAudit()` diagnostic on a mobile browser.
