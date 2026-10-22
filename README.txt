KANO LIFE / KANO RUN — STEP 34
SEATED DRIVER FALLBACK PRESERVATION

PURPOSE
Step 33 prevents an invisible/collapsed keke GLB from displacing the visible fallback vehicle. Step 34 closes a related gap: when a candidate vehicle passes validation but has no recognized seated-driver rig, the renderer previously logged a warning and still removed the procedural keke that contained the visible fallback driver.

CHANGES
- Keeps Step 33's visible-mesh, transform and vehicle-bound validation.
- Detects a named driver pivot on the accepted model before applying a fallback.
- If there is no usable driver pivot, clones the old procedural driver's pivot into the accepted keke before the old vehicle is removed.
- Deep-clones the fallback driver's geometries and materials so disposal of the old procedural keke cannot dispose the new driver's render resources.
- Sets up driverPivot/arm references for the existing driver animation path.
- Places the fallback driver using clamped ratios of the accepted vehicle's measured height/depth.
- Does not create a second driver when the incoming model already has a recognized driver rig.
- Carries forward Step 33's mobile renderer, roadside instancing, texture corrections, crowd spacing, device-tier helpers and pedestrian draw-call merge.

INSTALLATION
1. Extract this ZIP into the existing Kano Run project root (the folder with index.html and package.json).
2. Replace js/renderer3d.js with the included complete file.
3. The included js/KanoDeviceTier.js and js/KanoInstancedRoadScroll.js are the complete helper dependencies that accompany the renderer; they are carried forward unchanged from Step 33.
4. Copy the included tests/*.test.mjs into the existing tests folder.
5. Keep main.js, game.js, ModelManager.js, index.html, CSS, model assets, traffic mix, day-cycle files, and all unrelated features unchanged.

VALIDATION LIMITS
The included focused source-level suite passes. JavaScript syntax checks pass. Three.js/browser rendering, real imported GLB placement, production build, and physical-phone performance were not run in this environment. The fallback driver's position is dimension-aware but remains a generic procedural seating placement; an asset-specific cabin offset may still be needed for individual GLBs.
