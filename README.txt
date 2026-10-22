KANO LIFE — STEP 10: DISTANCE-AWARE MOBILE ANIMATION

Purpose
Reduce CPU work from detailed GLB character animations on phones without lowering 3D render resolution, removing character assets, changing traffic simulation, or changing the player's keke/driver controls.

Complete replacement file
  kano-run/js/KanoAnimationTrafficUpgrade.js

Included regression tests
  kano-run/tests/KanoGLBAnimationDiscoveryBudget.test.mjs
  kano-run/tests/KanoMobileAnimationDistanceBudget.test.mjs

What changes
- Nearby animated characters within 16 world units continue updating on every game frame.
- Characters 16–32 units away update at up to 30 animation updates per second.
- Characters 32–52 units away update at up to 20 updates per second.
- More distant decorative characters update at up to 12 updates per second.
- Distance is sampled every 120 ms using a reused Vector3, rather than on every frame.
- Accumulated elapsed time is passed to mixers, so reduced update cadence does not make their animation play in slow motion.
- Procedural idle movement for GLB characters without animation clips follows the same distance budget.
- The existing mobile root-discovery budget stays in place. The root-membership Set is reused instead of recreated every frame.
- Desktop mixer updates remain at their existing per-frame cadence.

Unchanged
- Renderer mode and render resolution
- Player keke and driver animation logic
- Driving physics, traffic simulation, collision rules and missions
- GLB, texture and audio assets

Installation
1. Extract the ZIP.
2. Copy the complete kano-run/js/KanoAnimationTrafficUpgrade.js file to the same path in the existing project, replacing that file only.
3. Keep all other source files and assets unchanged. The two test files are included to keep regression checks with the project; running npm test is not required for this step.

Validation performed here
- Node syntax check passed for the replacement JavaScript.
- 11 focused source regression tests passed in this package.
- ZIP integrity check passed.

Limitations
The focused checks verify intended source behavior, not actual frame rate. No full game/browser run or physical-phone performance benchmark was performed. Far-away character animation may look less fluid on a phone; nearby characters retain full-rate animation. No claim is made that this alone fixes all phone lag.
