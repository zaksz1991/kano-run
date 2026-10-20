KANO LIFE — LATE CHARACTER FALLBACK UPGRADE

Replace this existing file in your project:
  js/KanoInteractionReliability.js

Why this file:
  js/main.js already imports and creates KanoInteractionReliability, and passes
  it a live getRenderer callback. The replacement uses that existing hook to
  patch the active Renderer3D instance without editing main.js or renderer3d.js.

What it does:
  - Keeps the existing renderer-aligned roadside interaction window and hint.
  - Keeps stopped-vehicle pickup compatibility and optional scene diagnostics.
  - Checks already-loaded character GLBs when the renderer creates or updates
    ambient pedestrians and roadside pickup actors.
  - If the renderer's exact preferred character model is missing, chooses an
    already-cached compatible passenger/pedestrian GLB rather than leaving the
    procedural placeholder when another usable model is available.
  - Restores instance method wrappers when the renderer changes or the page
    closes. It preserves ModelManager's shared cached geometry.

Limit:
  This cannot create character art when every compatible GLB failed to load.
  In that case the existing procedural fallback remains visible. It does not
  modify ModelManager's asset catalogue or fabricate asset paths.

Checks:
  JavaScript syntax check passed. Integration was inspected against the public
  source structure: main.js creates KanoInteractionReliability before starting
  the renderer and calls update() each frame; Renderer3D.draw() calls syncZones
  and upgradePedestrians(). Browser visuals have not been verified here.
