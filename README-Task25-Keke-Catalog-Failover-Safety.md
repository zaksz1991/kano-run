# Kano Life — Task 25: Keke Catalog Failover Safety

## Why this update exists

Task 24 retries other keke GLBs after a specific visual-validation failure. Its implementation temporarily changed the contents of the shared `MODEL_KEYS.keke` array using `splice()`. Since this array is exported by `ModelManager.js` and is shared across renderer generations, modifying its contents during asynchronous loading could affect another model load.

Task 25 replaces that behavior. It swaps the catalog object's `keke` property to a private candidate-array reference only while `ModelManager.load('keke')` is synchronously starting, then restores the original array reference immediately. `ModelManager.load()` captures its catalog array before its first await, so the active retry keeps using the candidate list while other renderer/model-manager activity sees the original catalog. The original array is never edited.

The retry policy remains narrow: only `vehicles/keke/keke-1.glb` through `keke-8.glb` and the existing explicitly retryable visual-structure/bounds rejections can trigger failover. The current player vehicle remains active unless the renderer accepts an alternative.

## Contents

- `js/KanoKekeCatalogFailoverRepair.js` — complete replacement of the Task 24 adapter.
- `js/KanoKekeCatalogFailoverRules.js` — complete replacement for path policy and isolated catalog capture.
- `js/KanoKnownKekeModelAcceptanceRepair.js` and `js/KanoKnownKekeValidationRules.js` — Task 23 dependencies, included so the bundle is self-contained.
- `js/KanoWorldPerformanceInstancingUpgrade.js` — complete Task 24 bridge with the existing import that activates the repair.
- `tests/KanoKekeCatalogFailoverRules.test.mjs` — focused regression tests; keep this file under `tests/`, not `js/`.

## Install with File Explorer

1. Unzip this package.
2. Copy the five `.js` files in the ZIP's `js` folder into the project's `js` folder, replacing those same filenames. They are complete files, not snippets.
3. Copy `tests/KanoKekeCatalogFailoverRules.test.mjs` into the project's `tests` folder.
4. Do not change `renderer3d.js`, `ModelManager.js`, `main.js`, `game.js`, `ui.js`, `index.html`, or anything under `public/` / `public/assets/models/`.

The bridge file is included unchanged from Task 24 so this ZIP also carries the activation import. Installing it does not modify the protected game files listed above.

## Runtime diagnostic

Once the bridge loads, `window.kanoKekeCatalogFailoverAudit()` reports the initial failed path, candidates attempted, accepted alternative, stop reason, and errors. `sharedCatalogMutated` is always false in this repair because it no longer mutates the shared array; the field exists to make the invariant explicit in saved reports.

## Checks performed for this package

- Focused regression tests: run locally and report their actual result.
- JavaScript syntax checks: run locally and report their actual result.
- ZIP integrity: checked locally.
- Full repository `npm test`: not run because this package does not contain the complete current repository.
- Real browser/phone gameplay and actual GLB rendering: not verified here.
