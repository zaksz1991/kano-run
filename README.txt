KANO LIFE / KANO RUN — STEP 33
PLAYER KEKE VISUAL INTEGRITY GUARD

PURPOSE
The supplied phone screenshot shows the driver/pedestrian geometry visible in the roadway while the player's keke body is missing. The renderer previously accepted any successfully loaded 'keke' GLB and disposed of the visible procedural fallback without checking whether the new asset contained a visible vehicle-sized model.

THIS UPDATE
- Replaces js/renderer3d.js with a complete file based on the Step 29 renderer, preserving mobile-resolution targets, instanced roadside dividers/neem trees, denser mobile sidewalk rows, achaba rider silhouettes, texture paths, traffic fallback models, cached dioramas, and distance culling.
- Adds a pre-promotion integrity check for visible renderable mesh geometry, finite dimensions, and a plausible horizontal vehicle footprint.
- Rejects empty, invisible, collapsed, singular-transform, and person-sized candidates before the current player is detached or disposed.
- Leaves the currently active vehicle and its seated fallback driver in place when a candidate fails validation. The rejected instance is not disposed because its geometry may be shared with ModelManager's cache.
- Attaches diagnostic details to object.userData.kanoKekeVisualValidation and logs why the candidate was rejected or accepted.
- Adds regression tests covering the guard and previous mobile renderer features.

INSTALLATION
1. Extract this ZIP into the existing Kano Run project folder (the folder with index.html and package.json).
2. Replace js/renderer3d.js with the complete replacement file.
3. The ZIP includes js/KanoDeviceTier.js and js/KanoInstancedRoadScroll.js because renderer3d.js imports them; these helper files are carried forward unchanged from Step 29.
4. Copy the included tests/*.test.mjs into the existing tests folder. Do not replace package.json, index.html, main.js, game.js, CSS, assets, the Step 30 traffic mix, the Step 31 day cycle, or the Step 32 startup/test fixes.

VALIDATION LIMITS
Static regression tests validate guard order and preserve key renderer features. They do not load an actual GLB or prove visual correctness. The production app and real phone were not rendered in this environment. If an existing GLB contains only a tiny visible submesh for its vehicle body, it may be retained on the fallback until the underlying asset is corrected.
