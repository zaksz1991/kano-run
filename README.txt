KANO LIFE — STEP 21: MOBILE TRAFFIC SELECTION CADENCE

Purpose
-------
Reduce avoidable JavaScript work in the mobile renderer without changing
resolution, visible traffic counts, vehicle movement, collision ownership,
missions, models, textures, or audio.

Changes
-------
1. Reuses a persistent deadline and rescans/sorts mobile imported-traffic
   candidates no more than once every 350 ms while the renderer has free model
   slots. This specifically avoids sorting on every frame when the model cache
   exists but contains no eligible vehicle model.
2. Leaves per-frame traffic movement, actor transforms, and the simulation in
   the normal update path.
3. Replaces two hot-path Array.entries() loops for driver/pedestrian arm
   animation with index loops to avoid per-frame iterator/pair allocations.
4. Includes a focused source-regression test.

Install
-------
Copy the complete kano-run/js/renderer3d.js over the same file in the project.
Copy the new test into kano-run/tests if desired. Keep every other source file
and all model, texture, and audio assets unchanged.

Validation note
---------------
This package was checked with JavaScript syntax validation and its four focused
source-regression tests. It was not benchmarked on a physical phone, and the
full project test suite was not run. No result here claims the overall game lag
has been fixed.
