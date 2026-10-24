# Kano Life — Task 17: Real Player Keke GLB Activation

## Purpose

The current renderer can reject the catalogued `vehicles/keke/keke-3.glb` when its child mesh names do not match the renderer's structural-name heuristic, leaving the procedural yellow keke visible. This additive repair narrows that specific rejection case; it does not replace the binary GLB or generate a substitute vehicle.

## Files in this package

- `js/KanoKekeGlbActivationRepair.js` — new prototype adapter and runtime diagnostic.
- `js/KanoKekeGlbActivationRules.js` — new narrow validation rule.
- `tests/KanoKekeGlbActivationRepair.test.mjs` — focused geometry/allowlist tests.
- `tests/KanoKekeGlbActivationStartup.test.mjs` — checks the adapter's scope and integration diff.
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` — one import line added to the existing early-loaded performance module.

## Install with File Explorer

1. Extract the ZIP.
2. Copy both new `.js` files into the existing project's `js` folder.
3. Copy both new test files into `tests`.
4. Apply the single import line from `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` to the existing `js/KanoWorldPerformanceInstancingUpgrade.js`.
5. Do not replace the entire existing module.

No `.mjs` file needs to be added to `js`. No protected file or file under `public/` is modified. The `.glb` asset itself is not touched.

## Scope and safety

The original renderer validator remains authoritative except for one narrowly approved case: exact path `vehicles/keke/keke-3.glb`, failure reason `missing-vehicle-structure-evidence`, plausible normalized vehicle bounds, and zero character-mesh evidence. Other reasons—empty/hidden model, character-only model, invalid dimensions, or any other GLB path—remain rejected. The patch does not invent wheels, body meshes, passengers, or vehicle geometry.

The source ModelManager's orientation convention is retained. It rotates the imported keke source by PI and creates its seated driver rig on the normalized vehicle wrapper with forward axis `-Z`; this patch does not force an additional yaw change without visual evidence.

## Runtime verification

After the game starts and the model-loading attempt has completed, open the browser console and run:

```js
window.kanoKekeGlbActivationAudit()
```

Key fields:
- `playerModelPath`: the currently installed player's GLB path (null if fallback is still active).
- `playerUsesFallback`: true means the procedural model is still visible.
- `keke3Asset`: asset audit state, if the runtime publishes it.
- `validation`: original or narrowly accepted visual validation result.
- `meshCount`, `estimatedTriangles`, `namedWheelMeshes` and `driverRigPresent`: inspection details.

If `playerUsesFallback` remains true, the audit result distinguishes the actual model path, cached candidate and validation reason. This can indicate a network/load failure or a separate geometry problem not covered by the narrow rule.

## Verification performed here

- Focused Node tests: run `node --test tests/*.test.mjs` from the extracted package.
- Syntax checks: run `node --check js/KanoKekeGlbActivationRepair.js` and `node --check js/KanoKekeGlbActivationRules.js` in an ES-module-aware setup.
- Full repository `npm test`: not run in this environment.
- Real browser and physical phone: not verified.

This patch is intended to let the real catalogued GLB pass only the specific mesh-name evidence gap. It does not claim the keke looks correct in the live game until you visually inspect it on your phone.
