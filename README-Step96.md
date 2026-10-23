# Kano Life — Step 96: Road World Coordinates & Real Junction Surfaces

## Download and install

This package is an additive source update for the existing Kano Run project. It does not require a `harness` folder or `boot.py`.

1. Extract the ZIP using File Explorer.
2. Copy the included `js` folder into the existing project's `js` folder, merging folders and replacing files with the same names.
3. The package includes the complete replacement `KanoModelAssetVisualUpgrade.js` and the new `KanoRoadWorldCoordinatesUpgrade.js`; support modules from Steps 92–95 are included unchanged for reference and continuity.
4. Do not replace `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, storage, the entire project configuration, or assets for this step.

## What changed

### 1. Signed world-distance coordinate

The engine now tracks a separate `kanoWorldDistanceKm` using signed speed. Forward motion increases it; reverse motion decreases it. The scale is 1008 world units per kilometre, matching the renderer's existing `signedSpeed * dt * 0.28` scenery scroll. Career distance remains the existing forward-only statistic.

### 2. World-anchored bridge and roundabout scenery

Flyovers and Step 94 roadside roundabout scenes are positioned from repeating distance anchors and hidden outside the local road-view band. Their positions are synchronised immediately before the WebGL render, after the original scenery loop has updated them. Their signs remain aligned with the corresponding flyover. This avoids nearby wrap/recycle pops and makes reverse movement shift these landmarks in the correct world direction.

### 3. Junction geometry

As an upcoming junction enters the view band, the renderer creates a true Three.js intersection apron with left/right curved road strips, outgoing side-road surfaces, markings, and direction cues. Every third junction also receives a roundabout circuit connected to a side branch, including the ring surface, central island, alternating red/white curbs, and low landscaping. These meshes are anchored to the signed world coordinate, not parented to the vehicle.

### 4. Runtime inspection

Run `window.kanoRoadWorldCoordinatesAudit()` in browser DevTools to inspect the current signed travel coordinate, active junction actor(s), distance anchors, visibility, and player-parenting checks. The function does not transmit data.

### 5. Preserved areas

The route-choice HUD is hidden while reverse gear is engaged, because the current menu choices are forward-junction instructions. The existing engine, vehicle control, scoring, save schema, route list, renderer implementation, model assets, and InstantMesh plan remain unchanged. This remains an arcade world-coordinate layer: vehicle collision and turn steering are still not full wheel-physics path following, and the route graph is not a surveyed street map.

## Validation

- Focused Step 96 regression tests: run `node --test tests/KanoRoadWorldCoordinatesUpgrade.test.mjs` from the package root.
- JavaScript syntax validation: the included JavaScript files should parse with an ES-module-aware checker.
- ZIP integrity: checked separately after packaging.
- Production build and live visual browser test: not completed in this environment. The package's local source checks do not guarantee live appearance or performance.

## Important technical note

The separate world distance aligns renderer travel to forward and reverse movement. The established career distance remains forward-only. If later steps change how navigation advances through turns/U-turns, the navigation graph and physical junction schedule should be unified around the same signed world coordinate; do not infer full road topology from the arcade destination labels.

InstantMesh inference was not run for Step 96. No generated model is represented as InstantMesh output.
