# Kano Run — Task 13: Remove the Missing `.mjs` Dependency

## Purpose

The current public `main` version of `js/KanoMobileGeometryBudgetUpgrade.js` imports `KanoMobileGeometryBudgetRules.mjs`, but that rules file is not present in the branch. This update supplies the same pure rules as `KanoMobileGeometryBudgetRules.js` and includes a one-line import-extension edit. **No `.mjs` file needs to be copied into `js/` for this update.**

The package does not replace the existing optimizer and does not touch `public/` or model assets. It also contains a one-line startup integration diff for `KanoAnimationTrafficUpgrade.js`, which is already imported by `main.js`.

## Files

- `js/KanoMobileGeometryBudgetRules.js` — new pure geometry budget functions; copy into the project's `js/` folder.
- `integration/KanoMobileGeometryBudgetUpgrade.js.diff` — changes only the existing optimizer's import extension from `.mjs` to `.js`.
- `integration/KanoAnimationTrafficUpgrade.js.diff` — adds an import for the existing optimizer before `main.js` constructs `ModelManager`.
- `tests/` — focused rules and integration-diff tests.

## Apply in File Explorer

1. Extract the ZIP.
2. Copy `KanoMobileGeometryBudgetRules.js` from the package's `js/` folder into the project's `js/` folder.
3. In `js/KanoMobileGeometryBudgetUpgrade.js`, change the one import path shown in `integration/KanoMobileGeometryBudgetUpgrade.js.diff` from `KanoMobileGeometryBudgetRules.mjs` to `KanoMobileGeometryBudgetRules.js`. Do not replace the optimizer file.
4. In `js/KanoAnimationTrafficUpgrade.js`, add the import shown in `integration/KanoAnimationTrafficUpgrade.js.diff` if the existing optimizer import is not already present. If a prior task already added `import './KanoMobileGeometryBudgetUpgrade.js';`, keep that one line and do not add a duplicate.
5. Copy the two new tests into the project's `tests/` folder if you want them included in subsequent test runs.

Do not modify protected files. Do not delete or overwrite anything under `public/` or `public/assets/models/`. If the `.mjs` from an earlier package was already copied, it can remain unused; do not delete it as part of this step.

## Performance behavior

The existing optimizer still targets 4,800 triangles per model and reports models that cannot be safely reduced below 5,000. Skinned meshes, morph targets, grouped multi-material geometry, explicit keep-detail objects and unsupported buffers remain protected. No generated replacement models are introduced.

## Verification

The packaged tests can be run independently with:

```sh
node --test tests/*.test.mjs
```

The focused tests in this package validate the rules and the patch files. They do not verify the whole repository's startup. Full repository `npm test`, browser rendering, and physical-phone performance are **not verified** in this environment.
