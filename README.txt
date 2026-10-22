KANO LIFE / KANO RUN — STEP 25
Kano roadside set and visual clarity update

CONTENTS
  js/renderer3d.js                 Complete replacement renderer file
  tests/kano-roadside-set.test.mjs Focused regression tests for this update
  TEST-STATUS.txt                  Validation results and known suite failures

WHAT CHANGED
- Adds instanced neem trees on both sides of the road.
- Adds repeating black-and-white concrete roadside divider segments with diagonal stripes.
- Adds a second rider to motorcycle traffic for a two-rider achaba look, reusing cached rider geometry.
- Adds a detailed procedural Kano police pickup fallback when only a generic police-car model is available.
- Gives the procedural minibus/Hiace fallback a row of side windows, pillars, a green belt stripe, and a raised roof edge.
- Checks the cached model path before cloning unsuitable police/bus models, avoiding disposal of a clone that may share cached GLB resources.
- Corrects optional asphalt and market-stall texture paths to /assets/models/environment/ground/.
- Lightens the night sky/fog and keeps the harmattan sky pale.
- Uses instanced meshes and recycling loops for repeated trees/dividers to limit added draw calls and avoid growing the scene indefinitely.

INSTALLATION
1. Extract this ZIP into the root of your existing kano-run project, keeping the folders shown in the ZIP.
2. Allow the existing js/renderer3d.js file to be overwritten.
3. Keep tests/kano-roadside-set.test.mjs as an added test file.

This update intentionally replaces one runtime file and adds one test file. It does not replace main.js, game.js, CSS, or other life-sim/interaction files. Apply it on top of the latest audit-fix code so your separate day-cycle, breakfast, pickup-interaction, and HUD fixes remain in place.

LIMITATIONS
- The new neem trees, dividers, police pickup, and minibus are stylized procedural 3D fallbacks; this ZIP does not include new external GLB assets or reproduce real photographs pixel-for-pixel.
- No browser screenshot comparison or physical-phone frame-rate test was available in this run.
