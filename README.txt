KANO LIFE / KANO RUN — STEP 32
World instancing activation and regression-suite repair

PURPOSE
This is an additive update for the existing Kano Run project. It registers the existing world-performance module during startup and updates three outdated static/regression checks to match the current implementation.

CHANGES
1. index.html now loads js/KanoWorldPerformanceInstancingUpgrade.js after KanoCulturalStreetEventsUpgrade.js and before KanoLifeRootCauseRepair.js and KanoModelAssetVisualUpgrade.js. This activates the existing batched road-marking/window logic and brightness-profile hooks; it does not introduce another renderer or force 3D mode.
2. tests/glb-catalog-sync.test.mjs now tests the current supported API from scripts/glb-catalog-sync.mjs: actual GLB path discovery, safe category assignment, runtime CATALOG transformation, no-assets fallback and override validation. The old test imported two removed functions and asserted a variant-pooling transform that this plugin no longer implements.
3. tests/root-cause-repair.test.mjs now validates the current exact-model-path calibration policy. It verifies measured bounds are recorded and automatic width/depth axis guessing remains disabled; it no longer expects the deliberately removed guess-yaw behavior.

INSTALLATION
1. Extract this ZIP into the existing kano-run project root (the folder containing index.html and package.json).
2. Allow the included files to overwrite the same paths:
   - index.html
   - tests/glb-catalog-sync.test.mjs
   - tests/root-cause-repair.test.mjs
3. Do not replace main.js, game.js, renderer3d.js, CSS, model assets, or save data for this update.

This ZIP is an incremental update. Keep the preceding Kano Life updates already installed.
