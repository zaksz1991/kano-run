KANO LIFE — STEP 44
PLAYER KEKE RENDER-STATE DIAGNOSTICS

Purpose
- Extends the opt-in ?debugKeke=1 report with read-only checks for mesh and material state.
- Reports mesh counts, hidden hierarchy nodes, missing geometry/position attributes, empty draw ranges, missing or non-drawable materials, zero-opacity materials, disabled color writes, frustum-culling flags, and camera-layer mismatches.
- Includes small samples of meshes that pass basic render-state checks and meshes with notable issues.
- Does not change any visibility, layer masks, transforms, materials, geometry, camera values, or renderer state.
- Runs only inside the existing opt-in diagnostic path. The renderer reuses the same 900 ms throttle as the camera/bounds scan.
- Complements (does not replace) the camera-frustum check. Passing these checks does not prove GPU drawing succeeds or that a mesh is not occluded.

Installation
1. Extract this ZIP into the existing Kano Run project root.
2. Replace the complete js/renderer3d.js and js/KanoKekeRuntimeDiagnostics.js files.
3. Add js/KanoKekeRenderStateDiagnostics.js at the exact same js/ path.
4. The archive also carries forward the Step 43 diagnostic helper dependencies unchanged; keep them in the js/ folder.
5. Copy the included tests into the project's tests/ folder.
6. Open the game with ?debugKeke=1 and use Copy report or Save report .txt if the player's keke is missing.

This is a diagnostics-only update. It does not add a vehicle recovery rule or force any material/layer values.
Do not replace main.js, game.js, index.html, CSS, model assets, traffic/day-cycle modules, or saved game data.

Validation
- Included Node suite: 93 passed, 0 failed.
- node --check passed for every included js/*.js file.
- ZIP integrity checked after packaging.
- Production Vite build, real-browser/WebGL rendering, and physical-phone performance were not verified in this environment.
