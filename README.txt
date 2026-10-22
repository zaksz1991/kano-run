KANO LIFE — STEP 5: MOBILE TRAFFIC KEKE DRAW-CALL REDUCTION

Replace only:
  kano-run/js/renderer3d.js

Optional regression test included:
  kano-run/tests/KanoMobileTrafficKekeBatching.test.mjs

What changes:
- Combines the procedural background mobile keke's body parts into one shared BufferGeometry with vertex colours.
- Renders each lightweight background keke as one Mesh instead of a group of many meshes, reducing draw calls per keke.
- Reuses the merged geometry across all fallback background keke actors.
- Keeps the player's keke, GLB traffic budget, traffic positions, and game-side vehicle/collision simulation unchanged.
- The translucent-looking windscreen on lightweight traffic becomes a light opaque blue surface so the merged keke can use one material and one draw call.
- Retains the previous mobile front-face-culling change in renderer3d.js.

No model, texture, audio or other source files are changed.

Validation performed here: syntax check and focused static regression tests. This is not a physical-phone performance benchmark.
