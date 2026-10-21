# Kano Keke Life — Keke Model Calibration & Goat-Scan Performance Repair

This is a focused follow-up to the installed `KanoLifeRootCauseRepair.js` module. It uses the project's existing GLB assets and does not change the game economy, collision damage numbers, steering, fares, or progression.

## What changed

### 1. Removes the risky automatic keke rotation

`ModelManager.js` already normalizes a loaded model's size, centers/grounds its source and applies the project's default vehicle-facing rotation. The previous root-cause pass then guessed a further 90-degree rotation from width-versus-depth and translated the first child. On some GLBs, that can rotate the body independently of the attached driver or other sibling nodes.

This version no longer infers a rotation from the bounding-box aspect ratio and no longer translates an internal child. It measures and reports the complete model root while preserving ModelManager's normalization by default.

### 2. Adds exact-path calibration controls

Open the game using `?rootCauseAudit=1` or `?assetAudit=1`. The audit panel includes a **KEKE FIT · EXACT MODEL PATH** section showing the actual loaded keke file. It provides:

- Yaw correction, in degrees.
- Root X, Y and Z offsets.
- A root scale multiplier.
- **SAVE CALIBRATION & RELOAD** and **RESET THIS MODEL** buttons.

Adjustments are saved by exact GLB path in this browser's local storage. The saved outer-root transform applies to the complete keke assembly, rather than moving the body child alone. Each renamed/model-pooled GLB path can have its own calibration. The normal gameplay view has no calibration panel.

Calibration values are bounded to avoid accidental extreme transforms. Defaults are yaw/offsets `0` and scale `1`; therefore, no new orientation assumption is applied until you save a correction.

### 3. Reduces repeated goat-scene traversal

The root-cause draw hook previously traversed the world to discover goat-crossing actors on every render frame. The actor list is now cached for 180 ms on desktop and 300 ms on mobile; GLB goat mixers and visual updates still update every frame. The audit counts full scene scans and cache hits. This reduces repeated traversal work, but actual FPS improvement must be measured on the target device.

## Installation

Replace only the complete existing file:

`js/KanoLifeRootCauseRepair.js`

Use the file at that path inside this ZIP. Do not replace or edit sections of it. Keep `index.html`, `js/ModelManager.js`, `js/renderer3d.js`, `js/KanoGameplayPresentationRepair.js`, model catalogues, overrides and all GLB files unchanged.

## How to calibrate the keke

1. Open Kano Life with `?rootCauseAudit=1` added to the URL.
2. Start a 3D driving session so the actual player GLB is loaded.
3. Read the exact model path shown in the calibration section.
4. If the body faces the wrong direction, adjust **YAW °** in steps of 90 degrees. If it sits too far left/right/front/back or high/low, adjust the matching offset slightly. Use scale only when its dimensions are clearly wrong.
5. Press **SAVE CALIBRATION & RELOAD**. The next load applies the saved outer-root transform to that exact asset path.
6. Use **RESET THIS MODEL** to remove the saved override for that path.

These values are personal to the current browser unless manually transferred; they are not written back into the `.glb` binary files.

## Validation

The bundled regression tests check the absence of automatic width/depth rotation, root-level exact-path calibration, opt-in UI wiring, and cached goat scanning. Static tests and syntax validation do not prove that the selected keke looks correct in a live browser. Use the actual model path and calibration controls to tune against the live asset.
