# Kano Life — Step 92
## Street-life movement, natural hijab pose, and checkpoint passengers

This is an incremental update for the existing static Kano Life project. It does not need a `harness` folder, `boot.py`, a terminal, or a build-tool installation.

### Changes in this pass

1. Replaces the old roadside primitive figures with articulated 3D street people wearing varied Hausa-style boubou/kaftan, kufi, abaya, and hijab outfits.
2. Women in hijab have their arms resting naturally down at their sides; they no longer depend on the bundled unrigged A-pose GLB for walk-cycle animation.
3. Pedestrians get leg gait, gentle arm swing, subtle torso movement, and small sidewalk movement each frame.
4. General checkpoints with a hub receive four distinct waiting passengers on mobile and six on desktop. The former single security/placeholder passenger is removed.
5. The character update is loaded before `main.js` creates the renderer, so no core engine file needs to be replaced.
6. Includes an InstantMesh asset pipeline plan. InstantMesh inference was **not run** in this environment; this pass does not claim these runtime-built characters are final high-detail InstantMesh output.

### Install via File Explorer

1. Extract this ZIP.
2. Open the extracted `js` folder.
3. Copy **both complete JavaScript files** into the existing project's `js` folder and replace the file with the same name when prompted.
4. The `tests` and `docs` folders are for records and regression checks; they are not required by the browser game.

Only these two game files are changed:

- `js/KanoStreetLifeMotionUpgrade.js` (new)
- `js/KanoModelAssetVisualUpgrade.js` (complete replacement that loads the new layer before the game bootstrap)

No `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, storage, route logic, or asset files are replaced by this package.

### Verification completed

- `node --test tests/*.test.mjs`: **518 passed, 0 failed**
- JavaScript syntax checks: **226 files passed**
- Release-structure checks: **13 passed, 0 warnings, 0 failures**
- Local imports: **147 modules checked**
- ZIP integrity: checked after packaging

These are source-level checks. A Vite production build and live interactive browser test were not completed. After applying the files, use `window.kanoStreetLifeMotionAudit()` in browser DevTools if available to confirm the layer is registered and inspect sidewalk/crowd counts.

### Explicitly outside Step 92

This pass does not yet implement the redesigned fuel station, parked checkpoint keke, checkpoint/world persistence after passing, the Kwankwasiyya flyover driving route and signage, roundabouts, left/right route guidance, U-turns, or Danfo-Run-style reverse camera/control flow. These are separate changes to be implemented in focused stages to avoid destabilising the working startup.
