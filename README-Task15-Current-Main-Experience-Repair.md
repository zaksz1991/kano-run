# Kano Life — Task 15: Current-main experience repair

This package is an additive patch bundle reviewed against the current public `main` source on 2026-10-24. It is not a re-export of an older ZIP and contains no copies of protected files or files under `public/`.

## Why this step exists

Several of the existing feature modules are present in `main` but are not loaded by the pre-main startup chain. The current `index.html` already loads `KanoWorldPerformanceInstancingUpgrade.js` before `main.js`, making that file the narrow startup integration point.

## Changes supplied

**New files**
- `js/KanoProfileSelectionStateRules.js` — safe route/driver/dropdown normalization helpers.
- `js/KanoCurrentMainExperienceRepair.js` — repairs stale saved dropdown IDs, preserves unlock requirements, conditionally accepts only the known `vehicles/keke/keke-3.glb` when the existing validator rejects it solely for semantic naming evidence and its real meshes/bounds/triangles are plausible, and allows one nearby GLB traffic actor on low-tier phones.
- Two focused test files under `tests/`.

**Small edits supplied as diffs, not full replacements**
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` — imports the existing mobile geometry budget and flyover-driveability modules before `main.js` initializes the application. It deliberately does not activate the separate navigation/world-coordinate/path-continuity modules in this pass, limiting startup risk.
- `integration/KanoFlyoverDriveabilityRules.mjs.diff` — lengthens the existing deck half-length from 2.6 to 7.5 and ramp end from 34 to 44.
- `integration/KanoFlyoverRoundaboutUpgrade.js.diff` — mounts the KWANKWASIYYA title panel on the approach-facing side of the backing.

## Important constraints

- Keep `js/KanoGameplayPresentationRepair.js`, `js/KanoModelAssetVisualUpgrade.js`, `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/ui.js`, `index.html`, `js/KanoDeviceTier.js`, `js/KanoPhoneComfortUpgrade.js`, `js/ModelManager.js`, `tests/KanoRegressionGuard.test.mjs`, and everything under `public/` untouched.
- No real model is deleted, renamed, overwritten, or substituted with a procedural placeholder by this package.
- The keke acceptance fallback is path-whitelisted and still requires plausible bounds, at least two renderable source meshes, and at least 300 triangles. If the GLB is missing or fails bounds checks, the game will continue to use its existing fallback.
- A low-tier phone is allowed one nearby GLB traffic actor, not an unbounded full-scene GLB population.
- The life-routine / real-life simulation remains part of the game. No life panels or progression systems are removed.
- The longer flyover and title alignment have not been tested in a real browser. Roundabouts still do not have full road topology; the source simulation remains arcade/linear in places.
- This package does not force a higher pixel ratio. The blur is tied to the phone's adaptive quality/resolution path; forcing sharpness before verifying model optimization could undo the speed gain.

## Install

Extract with File Explorer. Add the two new `.js` files to the project's `js` folder and the tests to `tests`. Apply each integration diff to the current matching file. Do not replace the full target files. This patch adds no new `.mjs` file to the project.

## Verification status

- Only the bundled rules/integration tests can be run here.
- Full repository `npm test`: **not run**.
- Real-browser and physical-phone tests: **not verified**.
