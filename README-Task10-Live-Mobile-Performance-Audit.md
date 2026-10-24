# Kano Run — Task 10: Live Mobile Performance Audit

## Scope

This is a read-only diagnostic step. It does not change the renderer, model files, game state, graphics quality, or startup order. It does not depend on the missing `KanoMobileGeometryBudgetRules.mjs` module from Task 9.

## Files added

- `js/KanoLiveMobilePerformanceAudit.js`
- `tests/KanoLiveMobilePerformanceAudit.test.mjs`
- this README

No existing files are edited. Nothing in `public/` or `public/assets/models/` is included.

## Install

Merge the package's `js` and `tests` folders into the current repository. This adds two files only.

## Use

In DevTools on the running game, load the module:

```js
import('/js/KanoLiveMobilePerformanceAudit.js')
```

Then run:

```js
window.kanoLiveMobilePerformanceAudit()
```

For a five-second frame sample:

```js
window.kanoLiveMobileFrameSample(5000).then(console.table)
```

The module looks for the renderer exposed by the existing world performance module at `window.__KANO_WORLD_PERF_RENDERER__` and model manager at `window.__KANO_MODEL_MANAGER__` or `window.__KANO_ACTIVE_MODEL_MANAGER__`. When those globals are absent, it reports unavailable measurements rather than a pass.

## Interpretation

- WebGL triangle counts and draw calls are the last rendered frame's counters; renderer reset behavior can affect them.
- The traversal fallback is an upper-bound estimate for visible-flag meshes, not a proof of camera-frustum visibility or GPU submission.
- A model over 5,000 triangles is flagged, not simplified by this audit.
- Frame pacing depends on the device, screen refresh rate, browser tab visibility, and operating conditions.

## Verification

The included tests cover counting, unavailable-telemetry handling, non-mutation, and frame-sample fallback. They are focused tests only; the full repository `npm test`, a real browser run, and physical-phone performance are not verified by this package.
