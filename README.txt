KANO LIFE — STEP 19: MOBILE PROCEDURAL PEDESTRIAN DRAW-CALL REDUCTION

REPLACES
- kano-run/js/renderer3d.js (complete replacement based on the Step 18 cumulative renderer snapshot)

ADDS
- kano-run/tests/KanoMobilePedestrianMeshMerge.test.mjs (focused regression record)

WHAT CHANGES
- On phones, each procedural roadside pedestrian's static body, head, clothing, accessories, and legs are merged into one vertex-coloured mesh.
- The two pivoted arm meshes remain separate so the current arm-swing animation still works.
- Each procedural phone pedestrian therefore drops from roughly 5–8 mesh submissions to about 3, depending on clothing variant.
- Desktop pedestrian geometry and visual detail remain unchanged.
- The static merged geometry is disposed with its pedestrian when a GLB replaces the procedural actor. Materials still used by animated arms are not disposed early.
- No model, texture, or audio assets are added, removed, or moved.

PRESERVED
- Existing road markings, curb/shoulder rendering, mobile traffic batches, fog-distance visibility, animation timing, lazy garage/life-scene construction, and mobile procedural Lambert materials from the Step 18 snapshot.
- Pedestrian path positions and arm animation behavior.
- Player keke, traffic simulation, collisions, missions, and renderer selection.

INSTALL
Extract the ZIP into the existing project and replace only js/renderer3d.js. The new test is included as a regression record; no test command is being requested from you.

VALIDATION PERFORMED HERE
- node --check passed for the complete replacement renderer.
- All 5 focused static regression assertions passed.
- An isolated geometry runtime check passed against the repository-bundled Three.js module: static geometry merged, normals and vertex colours were generated, and the animated arm pivot/material remained attached.
- ZIP integrity check passed.
- The production browser scene and physical phone were not benchmarked. The runtime check used the repo-bundled Three.js r170 module, not the installed npm Three.js version. This is a draw-call reduction target, not a claim that the overall phone-performance issue is solved.

NOTE
This package continues from the Step 18 renderer snapshot. Because earlier upgrades touched the same file, this replacement should be applied only if that cumulative Step 18 version is the current renderer file in the project. It does not modify other source files or assets.
