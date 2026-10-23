# InstantMesh — asset pipeline carried forward in Step 97

InstantMesh remains intended for replacing low-fidelity placeholders with licensed/user-approved, higher-detail Kano-specific assets: the yellow Adaidaita Sahu with black canopy, naturally posed and rigged people, checkpoint passenger variants, fuel forecourt, Kano shops, and Kwankwasiyya bridge details.

**InstantMesh inference was not run for Step 97.** This update is a navigation-coordinate and path continuity pass; it contains no generated-model claim.

When a suitable GPU inference environment and model weights are available:

1. Use licensed or supplied reference images for the exact vehicle and Northern Nigerian street context.
2. Generate a candidate mesh with TencentARC InstantMesh (https://github.com/TencentARC/InstantMesh).
3. Retopologise/decimate and repair normals; verify scale, pivot, forward axis, canopy, and wheel locations.
4. Build real idle/walk clips for people. Do not use a static A-pose or arms-wide hijab model as a walking/idle replacement.
5. Export GLB and test each asset through `ModelManager`, including low-end mobile draw-call, triangle, and texture budgets.
6. Preserve the existing model as a fallback until the new GLB has been checked in the deployed browser.

Do not place InstantMesh model weights or an inference runtime into the static website. The browser game should consume validated, optimised assets only.
