KANO LIFE — STEP 17: MOBILE DISTANCE-CULLING CPU BUDGET

Included files (complete files, existing paths preserved):
- kano-run/js/renderer3d.js
- kano-run/tests/KanoMobileDistanceCullingCadence.test.mjs
- kano-run/tests/KanoMobileFogHorizonCulling.test.mjs
- kano-run/tests/KanoMobileRemainingStandardShaders.test.mjs

WHAT CHANGED
The mobile fog-distance visibility pass now runs at most once every 100 ms instead of scanning all scenery collections on every game render frame. It also avoids allocating a new closure each pass and avoids redundant Object3D.visible writes.

WHAT DID NOT CHANGE
- The normal render loop and game simulation cadence
- Keke handling, collisions, traffic logic, missions and zones
- Model, texture and audio assets
- Mobile render resolution and current mobile shader choices
- Desktop distance culling (this pass remains mobile-only)

INSTALL
Copy the complete kano-run/js/renderer3d.js file to the same location in your existing project. This replacement is based on the prior mobile-rendering optimization package and retains its changes. The test files are optional validation artifacts and do not need to be copied for the game to run.

VALIDATION NOTE
Focused static regression checks and syntax checks are run on the packaged files before delivery. This does not establish real-phone frame rate or guarantee that all current local edits are represented. Keep a copy of the current file before replacing it.
