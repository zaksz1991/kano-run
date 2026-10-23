KANO LIFE — STEP 40
PLAYER KEKE RECOVERY TRANSFORM PRESERVATION

Purpose
- Preserves the active vehicle's position and orientation before the runtime guard reparents it.
- Converts the vehicle's world transform into the destination parent's coordinate space if a corrective reparent is necessary.
- Restores the procedural keke at the failed vehicle's previous location rather than always snapping it to the default road/garage spawn point.
- Keeps the procedural fallback at its known scale so a GLB's unusual normalization scale cannot make the fallback tiny or oversized.
- Records whether the recovered pose came from same-parent coordinates, world-space conversion or safe defaults.
- Keeps cached GLB resources detached and undisposed because ModelManager may share their geometry and materials.

Installation
1. Extract this ZIP into the existing Kano Run project folder containing index.html and package.json.
2. Replace js/renderer3d.js with the complete file included here.
3. Add js/KanoPlayerKekeRecoveryTransform.js.
4. Keep KanoKekeStructureEvidence.js, KanoPlayerKekeRuntimeGuard.js, KanoDeviceTier.js and KanoInstancedRoadScroll.js beside renderer3d.js. They are included unchanged for convenience.
5. Copy the included tests into the existing tests folder.

Do not replace main.js, game.js, index.html, CSS, day-cycle modules, traffic modules or any models/assets for this update.

Validation
- Included Node test suite run: node --test tests/*.test.mjs
- All included tests passed in the package build environment.
- JavaScript syntax was checked across the included JS files.
- Vite production build, browser/WebGL rendering and real-phone frame rate have not been measured in this environment.
