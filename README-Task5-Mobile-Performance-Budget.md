# Kano Life — Task 5: Mobile Performance Budget Instrumentation

## Scope

This is a new-files-only diagnostic package for the latest public `main` architecture. It does not use a previous ZIP as a code base and does not change the protected startup chain. The current repair layer exposes the active model manager through `window.__KANO_ACTIVE_MODEL_MANAGER__`; the auditor uses that known hook when it is present.

## Budget to measure

- Total rendered scene: target no more than 100,000 visible triangles.
- Any individual loaded model: target no more than 5,000 triangles on phones.
- Frame pacing target: 16.67 ms per frame (60 FPS); frames over 33.33 ms are also counted.

These are acceptance targets, not verified current-game results. The auditor reports violations; it does not decimate GLBs, replace assets, change adaptive resolution, or mutate gameplay.

## Files added

- `js/KanoMobilePerformanceBudget.js`
- `tests/KanoMobilePerformanceBudget.test.mjs`

No existing files are replaced. No files from `public/` or `public/assets/models/` are included.

## Running in the game

After the game has loaded and the model manager has started, import the new module in the browser's developer console:

```js
import('/js/KanoMobilePerformanceBudget.js').then(m => m.installKanoMobilePerformanceBudget())
```

Then run:

```js
window.kanoMobilePerformanceBudgetAudit()
```

This reports loaded model-template triangle counts, models above the 5,000-triangle target, GLB-backed actor counts, and the 100,000-triangle budget when a scene or renderer is supplied. In this app, the complete Renderer3D scene is not exposed as a public global, so the default report deliberately marks total scene triangles as unknown rather than claiming a pass. GLB actor totals are a lower bound because procedural meshes are not included.

To sample browser frame pacing for five seconds:

```js
window.kanoMobilePerformanceFrameSample(5000).then(console.table)
```

The results require a real browser/phone run; Node tests do not simulate phone performance.

## Tests and limitations

Run the focused tests with `node --test tests/KanoMobilePerformanceBudget.test.mjs`. This repository's public root currently does not expose `package.json`, so the full `npm test` command could not be run here. The tests exercise the auditing math and budget classification against synthetic geometry; they do not assert that current real GLBs meet the 5,000-triangle target.
