KANO LIFE / KANO RUN — STEP 38
NATIVE DRIVER VISIBILITY GUARD

WHY THIS UPDATE
The player-keke validator has become more strict, but the native-driver detector could still treat a named driver mesh as valid when that mesh or one of its child groups was hidden. A hidden native driver could suppress the procedural seated-driver fallback, leaving an otherwise accepted keke with no visible person.

CHANGES
- Checks the visibility path of a native driver from its own node to the vehicle root.
- Ignores the vehicle root's own visibility because cached GLB roots can be hidden before promotion into the live scene.
- Rejects hidden driver nodes and hidden intermediate groups so they do not suppress the fallback driver.
- Reuses the same visible-path helper for the driver's renderable descendant meshes.
- Retains all Step 37 vehicle-structure checks, player-keke fallback protection, mobile rendering helpers, road instancing, traffic and roadside code.

INSTALLATION
1. Extract this ZIP into the existing Kano Run project root (the folder containing index.html and package.json).
2. Replace js/renderer3d.js and js/KanoKekeStructureEvidence.js with the complete files included here.
3. Copy the included tests/*.test.mjs files into the existing tests directory.
4. Keep js/KanoDeviceTier.js and js/KanoInstancedRoadScroll.js unchanged and in place.

Do not replace main.js, game.js, ModelManager.js, index.html, CSS, assets, saved game data, traffic-mix modules, or day-cycle files.

VALIDATION LIMITS
The new tests cover visible/hidden driver hierarchies and the renderer integration at source level. Browser/WebGL rendering and physical-phone performance are not available in this validation run; actual GLB placement and appearance must still be checked in the game.
