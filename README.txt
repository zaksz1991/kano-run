KANO LIFE / KANO RUN — STEP 28
Consolidated mobile renderer + Kano roadside merge

PURPOSE
The last roadside update replaced renderer3d.js with a pre-mobile-optimization copy. That silently dropped several performance safeguards already introduced in the mobile rendering series. Step 28 restores those safeguards and integrates the Kano-specific additions into one complete renderer file.

WHAT CHANGED
- Restores mobile pedestrian mesh merging, tier-aware scene-asset promotion cadence, distance culling, cached lazy life-scene construction, instanced lane/curb scrolling, and one-InstancedMesh-per-type fallback traffic.
- Keeps the Kano neem-tree line and repeating black/white concrete roadside dividers as instanced scenery that recycles with world movement.
- Corrects asphalt and market-stall texture paths to /assets/models/environment/ground/.
- Increases procedural roadside pedestrians from 8 to 10 on low-tier phones and 12 on mid/high-tier phones. Stronger phones may promote 2 or 3 nearby pedestrians to real GLB models; low-tier phones retain a one-GLB limit. Other fallback people keep their static parts merged.
- Restores sharpness targets of 1.40 for high-tier phones, 1.15 for mid-tier phones, and 0.92 for low-tier phones. The existing adaptive controller can step down if measured frame times require it.
- Adds two-rider achaba silhouettes to batched mobile motorcycles without adding a separate draw call per rider; desktop/modelled motorcycles also receive a passenger where the source model only has one rider.
- Keeps detailed procedural Kano police-pickup and Hiace-style bus fallbacks when no suitable specialized GLB is available. Mobile fallback versions remain merged into traffic batches.
- Preserves the mobile fog horizon and adds cleanup for shared rider geometry.

FILES
  js/renderer3d.js                       Complete replacement renderer
  js/KanoDeviceTier.js                   Complete replacement render-budget helper
  js/KanoInstancedRoadScroll.js          Compatible instanced-road scrolling helper
  tests/KanoStep28RendererMerge.test.mjs New focused regression tests
  tests/KanoLazySceneBuild.test.mjs      Retained lazy-scene regression tests
  tests/KanoMobilePedestrianMeshMerge.test.mjs Retained mesh-merge tests, updated for the tier-aware crowd count
  TEST-STATUS.txt                        Validation summary

INSTALLATION
Extract this ZIP into the root of the existing Kano Run project. Allow the three files under js/ to be replaced. Keep the existing main.js, game.js, CSS, asset files, Step 26 KanoSceneUpgrade.js, and Step 27 KanoCulturalStreetEventsUpgrade.js unchanged.

This is a complete file replacement. It does not require inserting code snippets or replacing individual sections.

VALIDATION AND LIMITATIONS
The focused source-level test group and JavaScript syntax checks pass. Browser rendering, full-project build, and real-phone frame timing have not been verified in this run. The police pickup, Hiace, and Achaba rider additions are procedural fallbacks; existing suitable GLB models remain preferred.
