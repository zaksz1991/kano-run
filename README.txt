KANO LIFE — STEP 24: GLB VISIBILITY SCAN COST FIX

PURPOSE
-------
Reduce periodic CPU work from model visibility repair, especially on mobile.
The old repair pass recursively traversed every object under the road, garage,
and active life-scene group every 450 ms on mobile. The updated pass uses the
existing renderer registries (building slots, traffic actors, pedestrians,
road props, environment detail instances, pothole-zone actors, the active keke,
and garage/life-scene slots). A shallow direct-child scan remains as a fallback
for unregistered roots.

PACKAGE CONTENTS
----------------
- js/KanoGameplayPresentationRepair.js
  Complete replacement file. No chunk edits are required.
- tests/KanoMobileGlbRegistryScan.test.mjs
  New focused regression tests for the bounded registry scan.

BEHAVIOUR PRESERVED
-------------------
- Existing imported GLBs and source asset files are unchanged.
- Imported-model preparation still computes valid geometry bounds once and
  leaves frustum culling enabled.
- The existing 450 ms mobile / 250 ms desktop repair cadence remains unchanged.
- Existing model-pool sizes, building caps, traffic, passenger scenes, road
  markings, procedural environment, collisions, controls, missions, and saved
  progress are not intentionally changed.
- The player keke, live traffic actors, environment ground-details and pothole
  GLB surfaces are explicitly included in the root registry.

INSTALL
-------
1. Open the downloaded ZIP and copy its js/KanoGameplayPresentationRepair.js
   into the matching js folder of the existing kano-run project, replacing the
   old file with this complete file.
2. Optionally copy tests/KanoMobileGlbRegistryScan.test.mjs into the project's
   tests folder. It is only for regression testing and is not loaded by the game.
3. Do not replace main.js, renderer3d.js, index.html, assets, or other files for
   this update.

VALIDATION PERFORMED HERE
-------------------------
- JavaScript syntax checks passed for main.js and
  KanoGameplayPresentationRepair.js.
- The Step 23 mobile GLB budget tests plus the Step 24 tests passed: 9/9.
- ZIP integrity check passed.
- The available project test snapshot reported 85/88 passing. Three failures
  are outside this change: the bundled GLB catalog test expects exports absent
  from scripts/glb-catalog-sync.mjs; the world-performance test expects a
  different main.js import order; and the root-cause test expects a different
  version of js/KanoLifeRootCauseRepair.js. These failures were not changed
  by this package.
- Full browser playback and physical-device performance were not measured here.
