KANO LIFE / KANO RUN — STEP 35
NATIVE DRIVER DETECTION AND DUPLICATE GUARD

PURPOSE
The previous fallback logic checked for Kano's animation pivot name but did not check for a valid native driver mesh inside an imported GLB. ModelManager can skip adding a procedural driver when it finds a named driver, even if that model uses a different naming convention. In that case, Step 34 could attach a second person on top of the existing driver.

CHANGES
- Detects native driver/rider/person objects using role-bearing object names.
- Measures candidate visible meshes in vehicle-root coordinates.
- Requires plausible human-sized dimensions and a location inside the keke footprint.
- Ignores seat/cockpit/wheel/rig/marker helper nodes as proof of a human driver.
- Preserves a plausible native GLB driver rather than adding a procedural duplicate.
- Still adds the independent procedural seated-driver fallback when no plausible native driver exists.
- Keeps the Step 33 keke integrity guard, Step 34 independent geometry/material clones, mobile-render helpers, crowd spacing and roadside renderer.

INSTALLATION
1. Extract this ZIP into the Kano Run project root (the folder containing index.html and package.json).
2. Replace js/renderer3d.js with the complete file included here.
3. Keep js/KanoDeviceTier.js and js/KanoInstancedRoadScroll.js alongside it.
4. Copy tests/*.test.mjs into the existing tests folder.
5. Keep ModelManager.js, main.js, game.js, index.html, CSS, GLB assets, traffic and day-cycle files unchanged.

VALIDATION LIMITS
The included source-level suite and JavaScript syntax checks are run during packaging. The actual GLBs are not bundled in the project source archive, and no browser/phone render was performed. Names and geometry dimensions are evidence of a likely visible driver, but an asset-specific model review is still needed to prove seat alignment.
