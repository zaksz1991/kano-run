KANO LIFE — STEP 43
PLAYER KEKE CAMERA / FRUSTUM DIAGNOSTICS

Purpose
- Adds debug-only measurements of the player keke's world-space bounds and the active camera frustum.
- Reports bounds dimensions, bounds centre, camera world position, distance to the bounds centre, and whether the vehicle bounds intersect the camera frustum.
- Adds sample renderable mesh names to the plain-text diagnostic report.
- Measurements are gated behind ?debugKeke=1 and throttled to once per 900 ms; normal gameplay does not run the extra full model-bounds traversal.
- The probe synchronizes transform matrices but does not change vehicle/camera transforms, visibility, materials, physics, model selection or recovery behavior.
- Frustum results are geometric only: they do not detect occlusion, depth-buffer effects, transparent shader problems or actual GPU draw failures.

Installation
1. Extract this ZIP into the existing Kano Run project root.
2. Allow the included js/ helper files to overwrite existing copies; the helpers carried forward from Step 42 are included to preserve the tested dependency set.
3. Copy the included focused tests into the existing tests folder. The diagnostic report test is updated and the new camera-diagnostics test is added.
4. Open the game with ?debugKeke=1. Use Copy report or Save report .txt. Remove the query parameter to disable the panel.

Do not replace main.js, game.js, index.html, CSS, model assets, traffic/day-cycle modules or saved game data.

Validation
- Included Node suite: 84 passed, 0 failed.
- Syntax: node --check passed for the included JavaScript files.
- ZIP integrity checked after packaging.
- The Vite production build, browser/WebGL screenshot and physical-phone test were not performed here.
