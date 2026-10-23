KANO LIFE — STEP 41
OPT-IN PLAYER KEKE RUNTIME DIAGNOSTICS

Purpose
- Adds a diagnostic overlay that is completely disabled during normal gameplay.
- Enable only for troubleshooting by opening the game with ?debugKeke=1 on its URL.
- Reports the active scene, selected vehicle/model, fallback status, root and ancestor visibility, parent, local/world position, scale, renderable mesh count, structural validation result, recovery count, most recent rejection/recovery reason, canvas resolution and renderer pixel ratio.
- Updates at a bounded cadence and removes itself when Renderer3D is disposed.
- Does not mutate gameplay state, alter vehicle physics, or run new scene-tree scans solely for diagnostics.
- Preserves the Step 40 recovery transform and all previous driver/model safeguards.

Installation
1. Extract this ZIP into the existing Kano Run project folder containing index.html and package.json.
2. Replace js/renderer3d.js with the complete replacement file included here.
3. Add js/KanoKekeRuntimeDiagnostics.js at the exact path shown.
4. Keep KanoPlayerKekeRuntimeGuard.js, KanoPlayerKekeRecoveryTransform.js, KanoKekeStructureEvidence.js, KanoDeviceTier.js and KanoInstancedRoadScroll.js beside renderer3d.js. They are included unchanged for convenience.
5. Copy the included test files into the existing tests folder.
6. To activate the panel, add ?debugKeke=1 to the game URL. Remove the query parameter to return to the normal UI.

Do not replace main.js, game.js, index.html, CSS, model assets, traffic modules or day-cycle modules for this update.

Validation
- Run: node --test tests/*.test.mjs
- Syntax-check the included JS files with node --check.
- The UI is opt-in and no browser/WebGL screenshot has been captured by this package builder.
- Real-phone rendering and frame rate remain unverified.
