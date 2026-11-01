# KANO LIFE — STEP 107: Skinned Character Render LOD

## Purpose

Reduce mobile rendering and animation cost for distant idle passengers and roadside characters without deleting their GLB assets or replacing their appearance with procedural figures.

## Runtime behaviour

- Applies only on mobile and only to character roots classified as `idle` by the existing GLB animation manager.
- At 40 metres or farther, the manager attempts to bake the current pose of every supported `SkinnedMesh` below that character root into ordinary `Mesh` geometry.
- The baked mesh is a child of the original `SkinnedMesh`, so it inherits the original node transform and visibility. The source skinned node is moved off the default camera layer while the static-pose mesh uses the source camera layers.
- Skin-index and skin-weight attributes are removed from the temporary baked geometry. The source GLB geometry and skeleton are not mutated.
- At 32 metres or nearer, the temporary static geometry is disposed and the original skinned mesh is restored to its original camera layers. The original mixer then resumes.
- The 8-metre hysteresis band prevents repeated conversions while a character moves around a threshold.
- Walking/traffic-role characters remain on the existing animation path.
- GLBs with morph targets, tangent attributes, normal maps, missing skin data, or custom depth/distance materials are left fully skinned. The conversion is all-or-nothing for one character root, preventing a half-frozen body.
- Detached roots and manager disposal restore the original model and dispose temporary geometry.

## Performance Lab

The people isolation row now hides both source `SkinnedMesh` objects and static-pose LOD children. The result overlay additionally reports active character roots, roots currently using static-pose LOD, static-pose meshes, and remaining skinned meshes.

## Files

### Replace

- `js/KanoAnimationTrafficUpgrade.js`
- `js/KanoPerfLab.js`

### Add

- `js/KanoSkinnedCharacterRenderLOD.js`
- `tests/KanoSkinnedCharacterRenderLODPolicy.test.mjs`
- `tests/KanoSkinnedCharacterRenderLODIntegration.test.mjs`
- `tests/KanoSkinnedCharacterRenderLODBake.test.mjs`
- `tests/KanoSkinnedCharacterRenderLODThreeRuntime.test.mjs`
- `docs/KanoLife-Step107-SkinnedCharacterRenderLOD.md`

No public assets, model files, renderer core, game logic, HTML entry point, device-tier file, or regression guard is replaced.

## Verification scope

- Policy tests cover mobile/idle eligibility, entry threshold, exit hysteresis and missing-camera fail-safe.
- Bake tests cover clone-only geometry mutation, source layer restoration, disposal, idempotence and morph-target fallback.
- A runtime test uses the repository's vendored Three.js r170 `SkinnedMesh`, `Skeleton`, `BufferGeometry` and `Mesh` classes.
- Existing animation cadence tests remain in place.
- Full Node test suite, JavaScript syntax scan and static checks are reported in `VERIFICATION-RESULTS-STEP107.txt`.

This does not replace a real Android test. FPS improvement on the Mali-G52 MC2 must be measured after deployment with `?lab=1` while driving for at least 30 seconds. A successful source test does not establish a device FPS gain.
