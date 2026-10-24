# Kano Run — Task 18: Real Sidewalk Walking Gait

## What this update changes

This is a small additive patch based on the current public `main` renderer source inspected for this task. It does not use an older ZIP as its source.

- Adds alternating animated legs to existing procedural sidewalk pedestrians.
- Batches all pedestrian legs into one `InstancedMesh` (two instances per procedural walker) to constrain draw-call overhead on phones.
- Adds a subtle torso bob and ensures arms continue a light counter-swing even if the player's driver animation clock is inactive.
- Retains the game's existing clothing colours, long tunic silhouettes, kufi caps, hijab/scarf variants, and character skin-tone palette.
- Preserves a pedestrian's real GLB model when model promotion succeeds; the gait overlay is hidden for model-backed actors and for culled actors.
- Removes only the old direct-child procedural leg cylinders that match their known position/dimensions, then replaces them with the batched animated legs. It never traverses or edits `public/assets/models`.

## Files added

- `js/KanoNorthernPedestrianGaitUpgrade.js`
- `js/KanoNorthernPedestrianGaitRules.js`
- `tests/KanoNorthernPedestrianGait.test.mjs`
- `tests/KanoNorthernPedestrianGaitIntegration.test.mjs`

## One-line integration edit

Apply the single import line in `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` to the latest `js/KanoWorldPerformanceInstancingUpgrade.js`, alongside its existing imports. Do not replace that file.

No new `.mjs` file belongs in `js/`; the `.mjs` files in this package are tests under `tests/` only.

## Verification

- Focused Node tests: to be run from the package's `tests` folder using `node --test *.test.mjs`.
- JavaScript syntax: should be checked after merging the new module and import.
- Full repository `npm test`: not run in this environment; the public repository root currently returns 404 for `package.json`.
- Browser and phone visual gait: **not verified**.

This update targets pedestrian gait only. It does not fix the player keke GLB fallback, vehicle collisions, sign readability, or route topology.
