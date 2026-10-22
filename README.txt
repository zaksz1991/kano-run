KANO LIFE / KANO RUN — STEP 30
Mobile Kano traffic mix and service-vehicle activation

WHY THIS UPDATE
The presentation repair layer already balanced normal traffic into approximately 40% keke, 30% motorcycles, and 30% four-wheel vehicles. However, its four-wheel selector only chose car, taxi, and SUV. That made the existing renderer's mobile Hiace and police-pickup fallbacks unreachable during ordinary traffic spawning.

WHAT CHANGED
- Keeps the 40/30/30 family split: keke / motorcycles / all four-wheel road traffic.
- Lets buses and police pickups appear on phones within the existing four-wheel share; this does not increase total traffic spawn count.
- On desktop, also permits trucks and KAROTA vehicles within that same four-wheel share.
- Leaves explicit event and wedding-convoy vehicles untouched.
- Uses the existing renderer fallbacks when a suitable dedicated GLB is unavailable. It does not create or replace binary model assets.
- Adds a pure traffic selector helper and deterministic regression tests.

FILES
- js/KanoGameplayPresentationRepair.js — complete replacement; retains the Step 24 GLB visibility registry and existing presentation repairs.
- js/KanoTrafficMix.js — new helper imported by the presentation repair module.
- tests/KanoMobileGlbRegistryScan.test.mjs — retained Step 24 regression tests.
- tests/kano-traffic-mix-upgrade.test.mjs — new tests for the traffic family ratio and mobile/desktop vehicle types.
- TEST-STATUS.txt — test summary.

INSTALLATION
Extract the ZIP into the root of the existing Kano Run project. Replace js/KanoGameplayPresentationRepair.js and add js/KanoTrafficMix.js at that exact path. Do not replace main.js, game.js, index.html, renderer3d.js, CSS, assets, or save data.

The existing index.html already loads KanoModelAssetVisualUpgrade.js, which imports KanoGameplayPresentationRepair.js. No extra script tag or chunk replacement is needed. The import of KanoTrafficMix.js is included in the complete replacement file.

VALIDATION LIMITS
The selector and source integration regression tests pass, JavaScript syntax checks pass, and the ZIP archive is valid. A Vite production build, browser rendering, and physical-phone traffic count/FPS have not been run here. Bus and police visuals use the game's available GLB assets or its existing procedural fallbacks.
