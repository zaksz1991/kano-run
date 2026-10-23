KANO LIFE — STEP 39
PLAYER KEKE RUNTIME VISIBILITY WATCHDOG

Purpose
- Checks the active player's keke at a throttled interval while the game is in road or garage mode.
- Detects when the active player has no visible renderable meshes or fails the existing keke-structure validator.
- Restores the built-in procedural keke with a seated driver rather than leaving the player standing in the road with no vehicle.
- Does not dispose a rejected imported model, because ModelManager may share its GLB geometry/materials with the asset cache.
- Stores a runtime health report on userData.kanoRuntimeKekeHealth and logs only when recovery is necessary.

Installation
1. Extract this ZIP into the existing Kano Run project folder containing index.html and package.json.
2. Replace js/renderer3d.js with the complete file included here.
3. Add js/KanoPlayerKekeRuntimeGuard.js.
4. Keep KanoKekeStructureEvidence.js, KanoDeviceTier.js and KanoInstancedRoadScroll.js beside renderer3d.js. They are included unchanged for convenience.
5. Copy the included tests into the existing tests folder.

Do not replace main.js, game.js, index.html, CSS, the day-cycle system, traffic modules or any models/assets for this update.

Validation
- Focused runtime visibility tests included; run with: node --test tests/KanoPlayerKekeRuntimeGuard.test.mjs
- The remaining included tests are carried forward from Step 38.
- Syntax checks and focused tests were executed in the package build environment.
- Browser/WebGL rendering and real-phone frame rate have not been measured in this build environment.
