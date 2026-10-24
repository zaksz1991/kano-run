# Kano Run — Task 21: Activate Existing Runtime Repairs

## Purpose

The current public `main` contains several additive repair modules, but the current `index.html` loads only `KanoWorldPerformanceInstancingUpgrade.js` before `main.js`; that bridge does not import the keke GLB activation, pedestrian gait, mobile world-clarity, mobile geometry-budget, or flyover driveability modules. The modules are therefore present in the repository but their hooks may not execute during a normal launch.

This update wires those existing modules through the already-loaded startup bridge. It adds no new gameplay systems and does not replace any model.

## Exact change

One existing file is edited by adding five import statements:

- `js/KanoWorldPerformanceInstancingUpgrade.js`

The ZIP includes `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` with the exact insertion. It is a small import-only edit; do not replace the full bridge file.

The imports activate:

1. `KanoKekeGlbActivationRepair.js` — narrow acceptance exception for the catalogued `keke-3.glb` only when the failure is the missing structural-name evidence and the model bounds are plausible.
2. `KanoNorthernPedestrianGaitUpgrade.js` — low-cost gait for eligible procedural pavement walkers.
3. `KanoMobileWorldClarityUpgrade.js` — existing texture filtering and adaptive-resolution clarity policy.
4. `KanoMobileGeometryBudgetUpgrade.js` — existing mobile-only in-memory simplification for eligible static geometry, using the current `.mjs` rules dependency already present on `main`.
5. `KanoFlyoverDriveabilityUpgrade.js` — existing raised deck and ramp adapter for the KWANKWASIYYA flyover.

The texture-clarity hook is imported before the geometry-budget hook so the latter wraps the already-clarity-aware model-load path. The browser's `index.html` already loads the world-performance bridge before `main.js`.

## Installation

1. Download and extract the ZIP in File Explorer.
2. Open `integration/KanoWorldPerformanceInstancingUpgrade.js.diff`.
3. Add the five imports to `js/KanoWorldPerformanceInstancingUpgrade.js` immediately after its existing imports. Leave all other code in that file unchanged.
4. Copy `tests/KanoRuntimeRepairStartupWiring.test.mjs` into the repository's `tests` folder. This test is designed to run in the full repository after the change is applied.

No `.mjs` files need to be copied into `js`; the `.mjs` dependencies referenced by the existing main-branch modules already exist in the current repository. No protected files are edited. Nothing in `public/` or `public/assets/models/` is changed.

## Scope and limitations

This is a startup-wiring repair, not proof that the visual issues are solved. It makes existing runtime hooks eligible to run, but does not fabricate models, replace GLBs, or claim that the keke looks correct, signs are readable, collisions are fixed, or every roundabout is traversable. Those outcomes need browser/phone checks.

Because this workspace does not contain the complete current GitHub working tree, the full `npm test` suite was not run here. Run the included integration regression test from the root of the project after applying the edit, then verify the game on the phone.

## Runtime checks

After the game starts, these existing reports can help verify the hooks were registered:

- `window.kanoKekeGlbActivationAudit()`
- `window.kanoMobileWorldClarityAudit()`
- `window.kanoMobileGeometryBudgetAudit()`
- `window.kanoFlyoverDriveabilityAudit()`

The names above are runtime diagnostics from the existing modules; availability and reported status should be confirmed in the running build.
