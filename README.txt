KANO LIFE — STEP 18: LAZY HIDDEN-SCENE CONSTRUCTION

REPLACES
- kano-run/js/renderer3d.js (complete replacement, based on the Step 17 cumulative renderer snapshot)

ADDS
- kano-run/tests/KanoLazySceneBuild.test.mjs (focused regression test)

WHAT CHANGES
- The garage is not constructed during initial road-renderer startup; it is built the first time the garage is entered.
- Life-scene dioramas are built one at a time, only when that specific scene is first entered. The other five scenes are not allocated yet.
- Built scenes remain cached so revisiting a scene does not rebuild its objects.
- Mobile life-scene model promotion checks only the active scene's slots and is throttled to 300 ms.
- Driving, collision logic, traffic simulation, missions, model files, textures and audio are not changed by this step.

WHY
The previous renderer created the garage and all six life-scene dioramas before ordinary driving began, even though those scenes were hidden. That allocated their meshes, geometries and materials during startup and retained them in memory. This change defers that work until a scene is actually requested.

INSTALL
Extract into the existing project and replace only the included js/renderer3d.js file. The tests file is included as a regression record; no test command is being requested from the user.

VALIDATION PERFORMED HERE
- JavaScript syntax check passed for renderer3d.js.
- All 5 focused lazy-scene regression checks passed.
- ZIP integrity check passed.
- The full project suite and a physical-phone benchmark were not run. First entry into a previously unseen garage/life scene now constructs only that scene and may incur a one-time setup cost; it is cached for later visits.
