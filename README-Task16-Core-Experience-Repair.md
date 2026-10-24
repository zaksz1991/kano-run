# Kano Life — Task 16: Core Keke, Collision, Readability, Potholes, and Flyover Repair

This package is a small additive integration against the current public GitHub `main` source inspected on 24 October 2026. It is not a replacement project ZIP or older snapshot.

## What it addresses

- **Real player keke GLB:** the current renderer rejects imported keke models when part names do not satisfy its structural-name heuristic. The new adapter accepts only existing catalogued `vehicles/keke/keke-1.glb` through `keke-8.glb` paths, and only when the entire visible model has plausible dimensions and at least three drawable meshes. It preserves the existing seated-driver path and fallback if a candidate is missing or fails bounds.
- **More readable contact:** wraps the existing `Game.moveTraffic` without replacing it, extends its short visual collision kick once per impact, and increases lateral deflection. The existing hit/damage routine remains authoritative.
- **Potholes:** replaces the flat warning-ring marker with irregular broken asphalt, a recessed dark centre, edge chips and cracks using lightweight procedural geometry and no extra lights/shadows.
- **Mobile signage/environment:** changes the sharpness preference from standard to sharp only when no explicit non-standard preference exists; adaptive quality remains in charge of subsequent frame pacing. It increases non-harmattan fog distance modestly and raises sign canvas-texture anisotropy with a throttled scan.
- **Flyover length:** expands the existing deck half-length to 17 units, extends approaches to 54 units, and lengthens the lane-marking run to follow the ramp.
- **All-time play count:** adds `/api/players-ever.js`, which increments a persistent Redis set of unique browser-profile IDs using the same `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as the current live-presence endpoint. The start screen receives a `PLAYERS WHO HAVE PLAYED` count after the player actually starts a run (not merely when opening the landing screen). It measures unique browser profiles, not verified unique humans.

## Exact files added

- `js/KanoCoreExperienceRepair.js`
- `js/KanoCoreExperienceRepairRules.js`
- `api/players-ever.js`
- `tests/KanoCoreExperienceRepair.test.mjs`

## Small complete diffs to apply

- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff`: one new import of the additive repair module. This module already loads before `main.js` in the current `index.html`.
- `integration/KanoFlyoverDriveabilityRules.mjs.diff`: two existing constants changed; no new `.mjs` file is added.
- `integration/KanoFlyoverDriveabilityUpgrade.js.diff`: lane markings now follow the extended flyover length.

No protected files are replaced. In particular, `js/KanoGameplayPresentationRepair.js`, `js/KanoModelAssetVisualUpgrade.js`, `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/ui.js`, `index.html`, `js/KanoDeviceTier.js`, `js/KanoPhoneComfortUpgrade.js`, `js/ModelManager.js`, `tests/KanoRegressionGuard.test.mjs`, and all files under `public/` remain untouched. The module validates existing GLB instances; it does not alter any asset file.

## Installation via File Explorer

1. Extract the ZIP.
2. Copy the two new `js/*.js` modules into your existing `js` folder. **No new `.mjs` file is added to `js`.**
3. Copy `api/players-ever.js` into the existing `api` folder.
4. Copy the test into `tests`.
5. Apply each of the three integration diffs to the named existing files. Do not replace whole files.
6. The lifetime counter requires the same two Upstash environment variables already used by `api/live-users.js`. If these are absent, the UI says `unavailable` rather than fabricating a number.

## Diagnostics

After the game loads, run `window.kanoCoreExperienceRepairAudit()` in DevTools. It reports the active player model path, whether the catalogued GLB passed the bounds guard, collision-kick extensions, pothole creation, texture tuning, render pixel ratio, and the existing flyover audit.

## Verification and limits

- Focused test: run `node --experimental-default-type=module --test tests/KanoCoreExperienceRepair.test.mjs` from the package root. This checks intended code paths and the Redis/API metric contract.
- Syntax checks are included in release verification.
- Full repository `npm test` could not be run here: the execution container cannot resolve `github.com`, and the current public repository root does not expose a `package.json` for a root npm script. No statement is made that the full regression suite passes.
- Real-browser and physical-phone results are **not verified**. The GLB admission path is deliberately restricted to known keke catalog paths and plausible measured bounds, but its actual visual fit still needs device inspection.
- This patch does **not** implement real left/right road branching. That would require changes to the protected `js/game.js` and `js/renderer3d.js`, which this package does not modify. The flyover is elongated, but full roundabout turn topology remains unresolved.
