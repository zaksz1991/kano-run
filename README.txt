KANO LIFE — MOBILE BACKGROUND TRAFFIC MESH-BUDGET FIX

Replace only this complete file in the existing project:
  kano-run/js/renderer3d.js

Optional focused regression test included:
  kano-run/tests/KanoMobileFallbackTrafficBatching.test.mjs

WHAT CHANGES
- Mobile fallback cars, motorcycles, SUVs, taxis, buses, trucks, KAROTA and
  ambulance traffic are rendered as one vertex-coloured mesh per vehicle.
- The merged geometry is created once per vehicle type and reused by later
  fallback vehicles. It is released when Renderer3D is disposed.
- This affects background traffic visuals only. Game traffic positions,
  speed, steering, collisions, missions, player keke and the desktop procedural
  traffic models are not changed by this optimization.
- Imported GLB vehicles remain available within the existing mobile model
  budget; vehicles that use them are not replaced by the simplified mesh.
- This replacement includes the previously delivered mobile kerb batching,
  mobile back-face culling and simplified background-keke mesh work contained
  in the current renderer3d.js baseline used for this update.

NOTES
- No model, texture, audio, or other source assets are deleted or moved.
- This is a draw-call reduction, not a guarantee of a particular phone frame
  rate. Actual performance still depends on the device and scene.
- Only the focused static regression checks and JavaScript syntax checks were
  run for this package. The full project test suite and production build were
  not run here.
