# Kano Life — Step 95: Route Guidance, Turns, U-turns & Reverse Control

## Included in this update

- `js/KanoRoadNavigationUpgrade.js` — new visual junction guide, arcade route connections, left/right/straight choices, U-turns, turn animation and keyboard shortcuts.
- `js/KanoModelAssetVisualUpgrade.js` — complete replacement bootstrap that loads the new module after the existing street/fuel/flyover layers and before gameplay initialises.
- `js/KanoStreetLifeMotionUpgrade.js`, `js/KanoWorldInfrastructureUpgrade.js`, `js/KanoFlyoverRoundaboutUpgrade.js` — unchanged complete support modules carried forward from the previous stages so the `js` chain is present in this ZIP.
- `tests/KanoRoadNavigationUpgrade.test.mjs` — source regression tests for this step.
- `docs/INSTANTMESH-ASSET-PIPELINE-Step95.md` — retained InstantMesh plan and limitations.

## What this does

### Visible route guidance

The `KANO ROAD GUIDE` panel shows LEFT, STRAIGHT, RIGHT, and U-TURN choices with arrows and destination names. It previews a junction and activates the buttons within a short approach window. The controls are touch-friendly and keyboard shortcuts Q/T/E/U avoid stealing input while a user is typing or changing a select field.

The selected destination is written to the game's existing `save.routeId` and `route-select` control. Left/right turns animate the road heading; U-turns animate a 180-degree heading change and can return to a previously selected route when available.

### Reverse control restored

The previous game engine already had reverse mechanics, but the in-game driving control bar did not contain a reverse button. This step adds a visible `REVERSE` button to the existing `#drive-controls` before `main.js` constructs the input binder. It binds using the pre-existing `data-action="reverse"` contract and uses the existing speed/gear protections. Stop before changing gear, then hold BRAKE to reverse, as the game already implements.

### Turn speed guards

- Left/right: reduce speed to 35 km/h or below.
- U-turn: reduce speed to 12 km/h or below.
- A turn cannot start while reverse gear is engaged.

## Honest scope limits

This is an arcade route-choice layer, not a surveyed or navigable street-level map of Kano. Destination links use the route catalogue and configured fallback links, not verified real-world road connectivity. The renderer animates a persistent heading over the existing recycled-road scene; this step does **not** yet create physically modelled curved junctions, a roundabout circuit, traffic-aware turn paths, or a fully driveable flyover deck. The Step 94 roundabout and flyover scenery remains visual scenery for now. A subsequent stage should implement actual path geometry and collision/traffic continuity.

InstantMesh is retained in the asset pipeline notes. **InstantMesh inference was not run for Step 95**, and this update adds no asset falsely claimed to come from InstantMesh.

## Installation using File Explorer

1. Download and extract the ZIP.
2. Open the extracted `js` folder.
3. Copy all five JavaScript files into your existing project's root `js` folder. Choose **Merge folders** and replace files with the same names when prompted.
4. Do not replace `index.html`, `main.js`, `game.js`, `ui.js`, `controls.js`, the renderers, storage, project settings, or assets for this step.
5. Keep the `tests` and `docs` folders if you maintain the source project's test suite; the browser game does not need those folders at runtime.

The update needs no `harness` folder or `boot.py`.

## Verification status

- Full automated suite: **542 passed, 0 failed**.
- JavaScript syntax checker: **232 JavaScript files passed**.
- Release structure: **13 checks passed, 0 warnings, 0 failures**; 150 local module imports resolved.
- ZIP integrity: verified after packaging.
- Vite production build: not run; the dependency installation/build environment is unavailable in this pass.
- Live browser verification: not completed. This environment blocked local Chromium navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so these checks do not prove the production game visually works.
