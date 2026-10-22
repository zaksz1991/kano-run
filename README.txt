KANO LIFE / KANO RUN — STEP 26
Seated-driver placement and GLB calibration repair

CONTENTS
  js/KanoSceneUpgrade.js
      Complete replacement for the existing scene upgrade module.
  tests/kano-seated-driver-calibration.test.mjs
      Focused regression tests for this repair.
  TEST-STATUS.txt
      Validation results and limitations.

WHAT CHANGED
- Measures the full set of visible vehicle mesh bounds instead of trusting the first nested GLB child.
- Excludes the new seated driver and visual-only dynamics pieces from the vehicle measurement.
- Transforms the target seat position into the driver pivot's actual parent coordinate space, including nested imported model transforms.
- Keeps the procedural driver attached to the player keke and preserves the built-in fallback driver without creating a duplicate.
- Leaves a recognized, artist-authored GLB driver rig in its authored position instead of moving a nested rig as if it were a direct child of the vehicle.
- Retains the existing passenger boarding/alighting, market street, crowd, morning-life scenes, and interaction reliability logic in this module.

INSTALLATION
1. Extract this ZIP into the root of the existing kano-run project folder.
2. Allow js/KanoSceneUpgrade.js to be overwritten.
3. Keep tests/kano-seated-driver-calibration.test.mjs as an additional regression test.

This update replaces one complete JavaScript file. It does not replace main.js, game.js, renderer3d.js, CSS, assets, or other life-sim/interaction modules.

LIMITATIONS
- Static regression tests and JavaScript syntax checks can verify the calibration code path, but they cannot prove exact seating across every GLB asset.
- No browser render or physical-phone test was available in this run. The next visual check should confirm the driver sits inside the keke with the live GLB model and in the procedural fallback.
