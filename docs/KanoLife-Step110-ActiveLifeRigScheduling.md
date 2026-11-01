# KANO LIFE — Step 110: Active Life-Rig Scheduling

## Reason for the change

The driving frame loop calls `KanoSceneUpgrade.update()` continuously. Before this step, `updateLifeRigs()` traversed every procedural life-stage rig on every frame, even while the player was driving on the road and all bedroom, household, breakfast, street, school, and garage rigs were inactive. Each inactive rig still incurred visibility checks, trigonometric calculations, and transform assignments.

## Implementation

- Adds `KanoLifeRigSceneScheduler.js`, a small pure helper that synchronises root visibility and builds a reusable list of rigs belonging to the active scene.
- `KanoSceneUpgrade` rebuilds that list only when `renderer.lifeScene` changes.
- `updateLifeRigs()` now advances only the active list. The road scene normally has no active life-stage rigs, so the per-frame rig animation loop is empty during driving.
- Active bedroom, household, breakfast, street, school, walk, and garage rigs continue using the existing animation equations and frame cadence.
- Redundant market-root visibility writes are avoided.
- Empty ambient crowd and walking-passenger arrays no longer enter their update methods.

## Preserved behavior

This does not change the game loop, renderer, scene catalogue, GLB assets, player vehicle, traffic AI, collision, route progression, passenger logic, fares, fuel, vehicle condition, KAROTA heat, or life-stage transitions. It does not delete any actor or replace any model. On entering a life stage, the scene's rigs are activated and animated; on leaving, they are hidden and removed from the active update list.

## Verification

- Six new Step 110 tests pass.
- Combined suite after Step 110: 1,414 tests, 1,398 passed, 16 failed.
- The same 16 failures were present in the Step 109 baseline; no new full-suite failure appeared.
- Source/test syntax check: 528 files checked, 0 syntax failures.
- The supplied snapshot has no root `package.json`, so `npm test` cannot start. Tests were run directly with Node's test runner.
- The supplied snapshot omits `public/`; no bundled model or audio asset test can be fully satisfied from this snapshot.
- No physical Mali-G52 device session was available. No FPS gain is claimed until the deployed build is measured on the phone.

## Package relationship

This delivery is cumulative with Step 109 and includes the Step 109 Performance Lab and character LOD files so the newer diagnostics are available when this optimisation is tested.
