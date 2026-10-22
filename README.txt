KANO LIFE — MOBILE TRAFFIC FRAME-ALLOCATION FIX

Purpose
- Reduce avoidable JavaScript garbage/allocation in Renderer3D.syncTraffic(),
  which runs on each active driving frame.
- Reuse the active-traffic Set, mobile GLB candidate array, and traffic-type Set.
- Replace per-frame filter/filter/sort temporary arrays with one reusable
  candidate array and a single in-place sort only when GLB model slots are free.
- Keep traffic selection priority (closest eligible vehicles first), model
  budgets, instance batching, traffic movement, collisions, and player keke
  unchanged.

Files
- kano-run/js/renderer3d.js: complete replacement, based on the preceding
  Mobile Traffic Instancing Fix source and preserving those earlier changes.
- kano-run/tests/KanoMobileTrafficFrameAllocation.test.mjs: optional focused
  static regression checks.

Install
1. Extract this ZIP.
2. Copy the complete kano-run/js/renderer3d.js to the same path in your
   existing project, replacing that file only.
3. Keep every other source file and all model, texture, and audio assets intact.

Validation performed here
- JavaScript syntax check passed.
- Four focused static regression checks passed in an isolated assembled copy.
- ZIP integrity passed.
- Full project tests/build and physical-phone benchmarking were not run here.

This targets traffic-sync CPU allocation; it is not a claim that all lag is fixed.
