KANO LIFE — STEP 9: MOBILE SCENE-PROMOTION AND FRAME-ALLOCATION FIX

This package continues from the latest Mobile Traffic Frame-Allocation Fix and
contains a complete replacement for js/renderer3d.js plus one focused regression
test. It does not change gameplay physics, traffic movement, collision rules,
missions, renderer-mode selection, model assets, textures, or audio.

Changes:
1. Mobile world-asset and pedestrian model-promotion scans run at most once
   every 300 ms per subsystem, rather than scanning model slots and pedestrian
   arrays on every rendered frame. Desktop remains unthrottled. New models can
   therefore take up to 300 ms longer to replace procedural placeholders.
2. Zone synchronization reuses one Set instead of allocating a new Set each
   rendered frame.
3. Includes all previous rendering and traffic optimizations from the supplied
   Step 8 renderer replacement.

Install:
Copy the complete kano-run/js/renderer3d.js over the same file in the existing
project. Copy the included test only if you want to keep the regression fixture.
Do not replace other files or modify/move/delete model, texture, or audio assets.

Validation performed during preparation:
- node --check js/renderer3d.js: passed
- node --test tests/KanoMobileScenePromotionBudget.test.mjs: passed
- ZIP integrity: passed

This is a source-level optimization. It has not been benchmarked on a physical
phone, and this package does not claim the game's overall frame rate is fixed.
No full project test suite was run.
