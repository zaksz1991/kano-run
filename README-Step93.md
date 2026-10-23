# Kano Life — Step 93: Fuel Forecourt & Checkpoint Parking

## Scope

This step follows Step 92's articulated pedestrians and 4–6 passenger queues. It adds a recognizable roadside fuel forecourt and parked keke at general passenger checkpoints while preserving the existing game engine, refuelling rules, zone-depth physics, collision logic, wallet/save data, and renderer loop.

## What's in the ZIP

- `js/KanoWorldInfrastructureUpgrade.js` — new additive visual layer. It replaces the fuel zone's green-box marker with a forecourt that includes concrete apron, marked bays, a canopy, four supports, illuminated fascia/signage, two dispensers, hoses/nozzles and a small price board. General checkpoints display two parked three-wheeled keke using the renderer's existing keke model, plus marked parking bays and a sign.
- `js/KanoModelAssetVisualUpgrade.js` — complete replacement that imports the new layer before gameplay bootstrap.
- `js/KanoStreetLifeMotionUpgrade.js` — complete Step 92 replacement, retained so the pedestrian gait and checkpoint passenger queue remain in the cumulative package.
- `tests/` — Step 92 and Step 93 regression tests.
- `docs/INSTANTMESH-ASSET-PIPELINE-Step92.md` — retained InstantMesh asset plan and constraints.

## Apply

1. Extract the ZIP in File Explorer.
2. Copy the package's `js` folder into the root of the existing Kano Run project, merging folders and replacing files with the same names.
3. Keep existing `index.html`, game engine, renderer, storage, GLBs, assets, and other source files unchanged.
4. Run the game and inspect a fuel stop and a general checkpoint.

No `harness` folder or `boot.py` is needed.

## World-location behavior and limits

The fuel forecourt and parked checkpoint keke are children of `renderer.world` and are positioned from their individual game-zone depths; they are not parented to the player's keke. `window.kanoWorldInfrastructureAudit()` reports their parent relationship, zone id, visible position, passenger count, dispenser count, and checkpoint keke count.

Important: the existing road environment is still a continuous runner that recycles distant background scenery. This pass does **not** convert the driving simulation into a fixed-coordinate open world; doing that safely requires a separate engine/route-coordinate change so turns, reverse, collisions and traffic all use the same world coordinate system. The next stage should focus on visible Kwankwasiyya flyover/sign geometry and roundabout/junction assets before the route-control stage.

## InstantMesh

InstantMesh remains a required high-detail asset workstream. It was **not run** in this environment, and these procedural station visuals and parked kekes are not represented as InstantMesh output. The existing procedural keke is used at the checkpoint until a validated, correctly scaled, textured, and optimized Adaidaita Sahu GLB replaces it.

## Verification

- `node --test tests/*.test.mjs`: **523 passed, 0 failed**.
- `node scripts/check-syntax.mjs`: **228 JavaScript files passed**.
- `node scripts/verify-release.mjs`: **13 release checks passed, 0 warnings, 0 failures; 148 local imports checked**.
- ZIP integrity checked separately after packaging.
- No production build or interactive browser visual test was completed because this workspace has no `node_modules` installation. The source checks do not prove how the live deployment looks.
