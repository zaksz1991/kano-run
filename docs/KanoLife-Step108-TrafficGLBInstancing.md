# KANO LIFE — STEP 108: Traffic GLB Instancing and Draw-Call Reduction

## Purpose

Reduce repeated Three.js draw submissions for background traffic when multiple copies of the same rigid GLB vehicle are present. This is a visual-rendering optimisation only; it does not alter traffic simulation or replace any model.

## Runtime behaviour

- Runs after `renderer3d.js` defines `Renderer3D` and before the first renderer is created.
- On desktop, groups matching opaque rigid GLB mesh parts by model key, shared geometry, material appearance, render order, layers and shadow flags.
- When at least two distinct traffic actor roots use a matching mesh part, those mesh parts are submitted through a shared `THREE.InstancedMesh` batch.
- The original GLB scene nodes remain intact. Only the batched source mesh nodes are hidden while their instanced batch is active.
- If fewer than two compatible vehicle roots remain, the source mesh nodes are restored and the batch is hidden.
- When a vehicle leaves the traffic actor map, its bindings are released on the next sync. When the renderer is disposed, source visibility is restored and batch materials are disposed.
- Transparent glass, semi-transparent materials, skinned meshes, morph-target meshes, custom depth/distance materials, custom per-object render callbacks and explicitly opted-out meshes remain on their original GLB path.
- Each active batch recalculates its instance bounding sphere so Three.js frustum culling continues to reject off-camera traffic rather than forcing every batched vehicle through the draw path.
- Material textures and GLB geometry remain owned by the existing model cache. The batcher does not dispose shared GLB geometry.
- On mobile, the feature stays disabled because the existing renderer already uses per-type `InstancedMesh` batches for fallback traffic and limits imported traffic GLBs to a very small device-tier budget. The player keke is untouched.

## Performance Lab

The `traffic vehicles` isolation test now hides the new GLB batches as well as original traffic actors and the existing mobile fallback batches. The final report displays:

- Active GLB batches.
- Batched mesh instances.
- Number of traffic vehicle roots represented.
- Estimated draw calls avoided by replacing repeated matching mesh submissions with one batch submission.

The avoided-call value is a structural estimate for the grouped mesh instances, not a measured FPS gain. Compare the live `calls` count and repeat the same 30–50 second phone/desktop benchmark after deployment.

## Files

### Add

- `js/KanoTrafficInstancingLOD.js`
- `js/KanoTrafficInstancingUpgrade.js`
- `tests/KanoTrafficInstancingLOD.test.mjs`
- `docs/KanoLife-Step108-TrafficGLBInstancing.md`

### Replace

- `js/KanoWorldPerformanceInstancingUpgrade.js`
- `js/KanoPerfLab.js`

The cumulative deployment archive also includes the previously supplied Step 106 and Step 107 files so the sequence can be deployed together from the same source snapshot.

## Safety boundaries

- No files under `public/` are changed.
- No GLB asset is simplified, rewritten or deleted.
- No player vehicle is instanced.
- No collision, movement, traffic spawn, lane, passenger, fuel, fare, route or career state is read-modified-written by the batching layer.
- Mobile traffic fallback batching remains unchanged.

## Verification scope

The focused Node tests use the repository's vendored Three.js build and exercise real `InstancedMesh`, `Matrix4`, mesh/material cloning and cleanup behaviour. They cover successful batching, one-actor fallback, transparent-surface exclusion, actor removal restoration, mobile bypass, skin/morph exclusion and prototype lifecycle wiring.

A successful source test does not prove a frame-rate gain on a physical device. The Mali-G52 MC2 phone path intentionally bypasses this GLB batcher because current device-tier limits already allow at most one imported background traffic GLB; this step's direct benefit is expected primarily where multiple repeated GLB traffic vehicles are enabled, especially desktop/non-mobile profiles. Mobile fallback batches remain as before.
