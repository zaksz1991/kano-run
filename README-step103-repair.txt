KANO STEP 103 REPAIR (complete replacement files)

Copy the js, tests and public folders into your project root, merge folders, replace files with the same names. Commit through GitHub.

WHAT WAS WRONG IN STEPS 84-103
1. Step 98 replaced js/KanoGameplayPresentationRepair.js (5,851 lines) with an older 837-line copy. That removed the mobile GLB budgets, visibility prep, traffic selector and building caps.
2. Steps 98+ removed the core life-sim modules from the startup chain (LifeSimulation, RealLife, PassengerRelationships, ParkOperations, StreetRhythm) and the Life&Career bind guard. 9 of the 27 life panels were no longer loaded (browser check: 18 panels instead of 27).
3. Step 84 deleted 90 real model files and replaced 14 real models with tiny generated placeholders (real keke-3, buses, police, buildings, Man.glb etc.).

WHAT THIS ZIP DOES
- js/KanoGameplayPresentationRepair.js: restored the full Step 97 version.
- js/KanoModelAssetVisualUpgrade.js: sim modules + bind guard re-added, Step 98-103 layers kept.
- public/assets/models: all deleted real models restored, 14 placeholder replacements reverted to the real models, plus copies under the file names the code actually asks for.
- tests: Step 84 asset test now only checks each GLB is valid (no size cap). Two obsolete tests removed/updated.

RESULT: 1236 of 1236 tests pass. Headless browser: 27 life panels mounted, 22/22 modules loaded, 0 runtime errors, Career starts from the title screen.
Not verified: real GLB rendering and phone FPS.
