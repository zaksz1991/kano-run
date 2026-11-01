# KANO LIFE — Step 111: No-Clip Idle Character LOD

## Finding addressed

The previous mobile static-pose path was reached only from the animation-mixer loop. GLB characters whose source file has no usable idle clip are handled by a separate root-level fallback animation path and do not receive a mixer entry. Consequently, those idle characters could remain GPU-skinned indefinitely even when far from the camera. The latest Performance Lab screenshot shows six idle character roots and six skinned meshes but no successful static-pose conversions; the screenshot alone does not prove that every root was a no-clip fallback, so the revised diagnostics report the reason per root.

## Runtime changes

- Extracts the existing 40 m entry / 32 m exit LOD transition into one shared state-machine helper.
- Applies that same policy to mixer-backed idle characters and idle GLBs using the no-clip fallback animation.
- Keeps walking/traffic-role characters fully skinned.
- Preserves the original SkinnedMesh, skeleton, geometry and material for restoration. The temporary posed mesh is an additional child, and the source mesh is removed only from the default camera layer while baked.
- Restores the original skinned meshes when an idle fallback character approaches the 32 m exit threshold, is detached, or the animation manager is disposed.
- Caches unsupported-bake failures to avoid repeating expensive attempts for morph-target, normal-mapped or otherwise unsupported assets.
- Continues the small root-level fallback idle sway; the LOD freezes only the skeletal pose while distant.

## Diagnostics

- Separates GPU-rendered skinned meshes from original source SkinnedMeshes retained for restoration. A retained source mesh is not necessarily being GPU-skinned while baked.
- Reports no-clip idle roots entering LOD, successful no-clip bakes and no-clip bake failures.
- Retains distance bands, loading/no-clip/failed states and bake-failure reasons.

## Files

Replace:
- `js/KanoAnimationTrafficUpgrade.js`
- `js/KanoPerfLab.js`
- `js/KanoSkinnedCharacterRenderLOD.js`
- `js/KanoSceneUpgrade.js` (carried forward from Step 110)

Add:
- `js/KanoLifeRigSceneScheduler.js` (carried forward from Step 110)
- `tests/KanoIdleFallbackCharacterLOD.test.mjs`

Update tests:
- `tests/KanoSkinnedCharacterRenderLODBake.test.mjs`
- `tests/KanoSkinnedCharacterRenderLODIntegration.test.mjs`
- `tests/KanoPerfLabReliability.test.mjs`

## Verification

- Focused character LOD and Performance Lab tests: 37 passed, 0 failed.
- Full Node MJS suite: 1,424 tests; 1,408 passed, 16 failed.
- The same 16 failures occur in the Step 110 baseline. They are caused by the supplied snapshot omitting `public/` assets and by existing import/browser-shim tests; no new full-suite failure was introduced.
- JavaScript/MJS syntax check: 530 files passed, 0 syntax failures.
- `npm test` was attempted both before and after; both attempts stop with `ENOENT` because the supplied snapshot has no root `package.json`.
- Protected core files were byte-for-byte unchanged.

## Limitations

The supplied source snapshot omits `public/` and was not independently compared with the live GitHub `main` branch. No physical Mali-G52 Android session was available. This change is covered by source-level and fake-Three unit tests; improved FPS or actual device-side bake counts have not been verified. Re-run `?lab=1` after deployment and inspect `no-clip LOD`, `far idle`, `bake failed` and `skinned GPU` diagnostics.
