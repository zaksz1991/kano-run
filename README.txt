KANO LIFE / KANO RUN — STEP 37
KEKE ROOT-NAME CONTAMINATION FIX

WHY THIS UPDATE
The Step 36 screenshot still shows character-like GLB meshes occupying the player position without a keke body. The previous structure gate searched every mesh's full ancestor name path. If ModelManager names the root object `keke`, that generic root label was inherited by every child and automatically counted as vehicle-part evidence. The guard could therefore accept an incorrectly mapped crowd/character GLB.

CHANGES
- Excludes generic model/container/root names (including `keke`, `vehicle`, `Scene`, and `Root`) from structural evidence.
- Retains the complete name path only for identifying character/pedestrian assets that should be rejected.
- Counts named vehicle parts and wheel parts only from specific descendant/mesh names.
- Tightens the unnamed-geometry fallback to require a genuinely broad, low chassis close to ground level.
- Adds a standalone, Three.js-independent classifier and behavioural regression tests for the exact root-name contamination case.
- Preserves the player-keke guard, seated-driver fallback, native-driver detection, mobile rendering helpers, traffic batching, roadside scenery and sidewalk spacing from Step 36.

INSTALLATION
1. Extract this ZIP into the existing Kano Run project root (the folder containing `index.html` and `package.json`).
2. Replace `js/renderer3d.js` with the complete file included here.
3. Add `js/KanoKekeStructureEvidence.js` at the same relative path; `renderer3d.js` imports it directly.
4. Copy the included `tests/*.test.mjs` files into the existing `tests` directory.
5. Keep `js/KanoDeviceTier.js` and `js/KanoInstancedRoadScroll.js` unchanged and in place.

Do not replace `main.js`, `game.js`, `ModelManager.js`, `index.html`, CSS, assets, saved game data, traffic-mix modules, or day-cycle files.

VALIDATION LIMITS
The direct classifier tests exercise the previous root-name contamination case. Source-level renderer regression tests, syntax checks and ZIP integrity are also run before packaging. The real GLB assets and browser/WebGL runtime are not available for an in-game render verification, so physical-phone visuals and frame rate remain unverified.
