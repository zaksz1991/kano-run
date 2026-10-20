KANO LIFE — WORLD / ENVIRONMENT / CHARACTER GLB VISUAL UPGRADE

PACKAGE FILES
- index.html
  Complete replacement for the current game entry page. It loads the new model
  quality bootstrap first while preserving the existing game UI and controls.
- js/KanoModelAssetVisualUpgrade.js
  Complete new bootstrap module. It installs a visual-quality pass on the
  existing ModelManager before loading KanoGameplayPresentationRepair.js and
  the regular game entry point.

ASSET GROUPS AFFECTED
- /assets/models/world/*.glb and nested world directories
- /assets/models/environment/*.glb and nested environment directories
- /assets/models/characters/*.glb and nested character directories

WHAT CHANGES AT RUNTIME
- Repairs missing or unusable vertex normals where geometry supports it.
- Fills in missing geometry bounds used by visibility/culling.
- Improves oblique texture filtering (lower setting on touch/mobile devices).
- Corrects display colour space for base-colour and emissive textures only when
  it is missing or incorrect.
- Applies a conservative roughness cap to plain, untextured materials without
  replacing original base colours or textured roughness maps.
- Fixes depth-write behavior for translucent blended materials.
- Normalizes skin weights for skinned character meshes and disables static
  frustum clipping on those skinned meshes to reduce animated limb popping.
- Preserves source transforms, model orientation, game physics, input, scores,
  traffic logic, and saved progress.

MODEL AUDIT
Once the game is running, the browser console function
window.kanoGlbAssetQualityAudit() returns/prints a summary of the loaded GLBs,
including category, mesh/triangle counts, skinned meshes, and repairs applied.
Only assets that have actually loaded are included in the report.

IMPORTANT SCOPE LIMIT
This package improves how the existing GLB assets are prepared and displayed at
runtime. It does not rewrite the binary .glb files, rebuild their meshes, paint
new textures, or invent new character animation clips. The original model files
remain unchanged. The existing game animation manager continues to handle any
supported character clips.

INSTALLATION WITH GITHUB'S BROWSER EDITOR
1. Extract the ZIP.
2. Add the included js/KanoModelAssetVisualUpgrade.js as a new file at that
   exact path, using the full file contents from the ZIP.
3. Replace index.html with the complete index.html included in the ZIP.
4. Keep all other game files unchanged.

VALIDATION
JavaScript syntax checks and package integrity checks should be run after file
placement. This package was syntax-checked locally; live browser rendering on
physical devices has not been tested in this session.
