KANO LIFE / KANO RUN — STEP 36
PLAYER KEKE VEHICLE-STRUCTURE GATE

PURPOSE
The latest phone screenshot shows a group of character-like meshes occupying the player's position while the keke body is missing. The previous player-model guard checked visible mesh bounds and overall dimensions, but a wrongly mapped crowd/character GLB could span a vehicle-sized footprint and pass that test.

CHANGES
- Adds structural evidence checks to player-keke candidate validation instead of relying on overall bounds alone.
- Looks for vehicle-specific part/group names, wheel/tire evidence, or a broad low body/chassis-like mesh.
- Recognizes character-oriented node names and rejects a character-only candidate when it has no vehicle-structure evidence.
- Records the evidence counts and measured bounds in `userData.kanoKekeVisualValidation` for browser-side diagnostics.
- Keeps the existing procedural keke and seated driver active when a candidate fails the new structure gate.
- Preserves Step 33 visibility protection, Step 34 independent seated-driver fallback geometry/materials, Step 35 native driver detection, mobile rendering, traffic batching, roadside scenery, and pedestrian spacing.

INSTALLATION
1. Extract this ZIP into the Kano Run project root (the folder containing `index.html` and `package.json`).
2. Replace `js/renderer3d.js` with the complete replacement file included here.
3. Keep `js/KanoDeviceTier.js` and `js/KanoInstancedRoadScroll.js` alongside it. They are included unchanged as direct imports.
4. Copy `tests/*.test.mjs` into the existing `tests` folder (or use the included files to refresh the focused renderer test set).

Do not replace `main.js`, `game.js`, `ModelManager.js`, `index.html`, CSS, assets, saved game data, traffic-mix modules, or day-cycle files for this update.

VALIDATION LIMITS
The included 48 tests are source-level regression tests. Node syntax checks and ZIP integrity checks passed during packaging. Actual GLB assets were not available for a Three.js browser-render test, and no browser screenshot or physical-phone performance test was run. Asset-specific names vary, so the new structural gate intentionally retains a low-body geometry fallback for vehicles whose mesh names are generic; inspect the validation diagnostics if a genuine keke GLB is rejected.
