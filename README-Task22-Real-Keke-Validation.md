# Kano Run — Task 22: Real Keke GLB Validation Repair

## Why this change exists

The current public `main` code already preloads the real `vehicles/keke/keke-3.glb` and calls `Renderer3D.applyModel('keke', playerModel)`. The renderer's `validateKekeModelCandidate()` rejects a model when it cannot find vehicle structure from part names and named wheels, even after the loader has successfully loaded the asset. When that happens, it intentionally keeps the procedural yellow keke visible.

This update adds a narrow secondary check only for that specific `missing-vehicle-structure-evidence` failure and only for files in the existing `vehicles/keke/keke-1.glb` through `keke-8.glb` catalog. It infers vehicle evidence from measured dimensions, visible mesh count, broad low chassis geometry, and low wheel-like components. Missing/invisible geometry, implausible dimensions, other validation failures, and unrelated model paths remain rejected.

It does not create or substitute any model and it does not change any file under `public/`.

## Files in this ZIP

- `js/KanoKnownKekeValidationRules.js` — pure acceptance rules.
- `js/KanoKnownKekeModelAcceptanceRepair.js` — pre-renderer prototype adapter.
- `tests/KanoKnownKekeValidationRules.test.mjs` — focused tests against the exact pure helper source.
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` — one new import line for the existing startup bridge.

## Installation with File Explorer

1. Extract this ZIP.
2. Copy both new `.js` files into your existing `js` folder. No `.mjs` files go in `js`.
3. Copy `KanoKnownKekeValidationRules.test.mjs` into your existing `tests` folder.
4. Add the single import line in the diff to the existing `js/KanoWorldPerformanceInstancingUpgrade.js` imports, immediately after the `Renderer3D` import. Do not replace that file.

The adapter must load before `main.js` creates `Renderer3D`; the existing HTML already loads `KanoWorldPerformanceInstancingUpgrade.js` ahead of `main.js`.

## Diagnostic

After a fresh page load and starting a run, open the browser console and run:

```js
window.kanoKnownKekeModelAcceptanceAudit()
```

`acceptedByGeometry` increases only when the real catalogued model passed this narrow fallback rule. `leftRejected` indicates it still failed the rule. A successful validation does not by itself verify the model's visual orientation or guarantee that this GLB is present on the deployment.

## Verification status

- Focused pure-rule tests: see the delivered test file; results are reported separately.
- Full repository `npm test`: not run in this environment.
- Real-browser loading and phone appearance: not verified.

## Protected files

No protected file is replaced or included. `renderer3d.js`, `game.js`, `main.js`, `ui.js`, `index.html`, `ModelManager.js`, and everything under `public/` are untouched.
