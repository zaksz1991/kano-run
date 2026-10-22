KANO LIFE — STEP 23: MOBILE GLB INSTANCE & PRELOAD BUDGET

What was found
--------------
The mobile renderer deliberately uses procedural flyovers and several roadside
prop types, but the mobile preload queue still requested their imported GLB
categories. In addition, the presentation layer could promote as many as 14
building slots into detailed GLBs on a phone even though the core mobile path
is designed around a much smaller detailed-scene budget. The GLB model-pool
patch also retained four suburban and three industrial-building templates on
mobile.

What this package changes
-------------------------
- Complete replacement: kano-run/js/KanoGameplayPresentationRepair.js
- Complete replacement: kano-run/js/main.js
- New focused test: kano-run/tests/KanoMobileGLBDrawBudget.test.mjs
- Mobile detail cap: at most four imported building facades; other nearby slots
  remain as the existing procedural buildings.
- Mobile pool: two suburban and two industrial building variants, retaining
  some model variation without keeping seven building templates.
- Mobile preload queue no longer loads flyover, roadlight, bench, trafficLight,
  stopSign, busStop or marketStall categories which the mobile renderer keeps
  procedural (the last three also have no ModelManager candidates).
- Desktop full-detail category list and building budget are unchanged.
- Existing GLB one-time bounds preparation, frustum culling and visibility
  repair from Step 2 are preserved.

What stays
----------
The actual keke, traffic simulation, missions, collisions, all road markings,
procedural streetlights, procedural flyovers, buildings, kerbs, verges, and the
existing model files remain. No files in public/assets are removed or modified.

Install
-------
Extract into the existing kano-run folder and replace only the two included
JavaScript files at their matching paths. The test file may be added to tests/.
No full npm test run is requested for this update.

Validation performed here
-------------------------
- node --check passed for main.js and KanoGameplayPresentationRepair.js.
- Focused regression checks passed (5/5).
- ZIP integrity check passed.
- The full project suite and physical-phone GPU performance were not run.
