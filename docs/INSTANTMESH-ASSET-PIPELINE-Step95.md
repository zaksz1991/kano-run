# InstantMesh asset pipeline — carried forward in Step 95

InstantMesh remains part of the Kano Life asset strategy, particularly for a higher-fidelity Adaidaita Sahu keke, natural posed and rigged Hausa/Northern Nigerian pedestrians and passengers, and production-quality infrastructure assets. Source project: `TencentARC/InstantMesh`.

This step focuses on playable route-choice feedback and the existing driving renderer, not on replacing the GLB catalogue. **InstantMesh inference was not run for Step 95.** No existing procedural mesh or placeholder is represented as an InstantMesh-generated asset.

Recommended next asset pipeline:

1. Use licensed or user-provided reference images of a real Adaidaita Sahu with correct body proportions, yellow/original paint variants, black canopy, wheelbase and driver position.
2. Generate/prepare a mesh with InstantMesh in a suitable GPU environment with the required weights available.
3. Clean the mesh, remove hidden geometry, check normals and topology, preserve clean wheel pivots and canopy dimensions, decimate to practical mobile budgets, and produce UVs/materials.
4. Create a rigged pedestrian base with feet planted, arms resting naturally at the sides, separated arms/hands, and walk/idle clips. The hijab and clothes are separate visual variants, not a reason to use an A-pose or arms-wide pose as an idle animation.
5. Export GLB, validate scale/orientation and mobile draw calls, then test at real phone resolutions before replacing currently working assets.

## Route-topology boundary

Step 95 adds visible lane-independent junction choices, arcade links between named destinations, turn animation, U-turn behavior and a visible reverse-gear control wired to the existing reverse mechanics. Its route connections are **not a surveyed Kano road graph**. The persistent road heading rotates the existing recycled-road scene; it does not yet construct genuine curved junction geometry or a full driveable flyover deck. Those remain separate physics/path tasks and should not be represented as already complete.
