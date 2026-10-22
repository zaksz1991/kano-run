KANO LIFE — STEP 13: INSTANCED ROAD-MARKING UPDATE REDUCTION

Contents
- kano-run/js/renderer3d.js: complete replacement for the current Step 9 renderer3d.js baseline.
- kano-run/js/KanoInstancedRoadScroll.js: new helper that scrolls instanced kerbs and lane markings without rewriting every instance matrix every frame.
- kano-run/tests/KanoInstancedRoadScroll.test.mjs: focused regression tests for forward movement, reverse movement, boundary wrapping, and root rebasing.

What changes
The earlier road-scroll loop recalculated and uploaded every kerb and every lane-marking instance matrix during every driving frame. This update moves each whole InstancedMesh using its object transform each frame, rewrites an individual matrix only when that marking crosses the loop boundary, and performs a complete refresh only when the root offset is periodically rebased. The visuals remain instanced; geometry, materials, spacing, colour, physics, traffic, missions, models and audio are not intentionally changed.

Install
Copy/merge the files at the paths shown inside this ZIP into the matching existing kano-run folder. Replace js/renderer3d.js with the complete included file and add js/KanoInstancedRoadScroll.js. Keep all other files and assets unchanged. The regression test is additive.

Validation performed for this ZIP
- Node syntax checking for the complete renderer3d.js and the new helper.
- All focused tests in KanoInstancedRoadScroll.test.mjs.
- ZIP integrity check.

Not claimed
The full local project test suite, production build, and physical-phone performance benchmark were not run. This targeted change is intended to reduce per-frame CPU work and instance-buffer uploads for road decorations; it does not by itself prove that all phone lag is resolved.
