# Kano Run — Task 20: Mobile World Clarity & Adaptive Resolution

## Purpose

This update targets the blurry world view reported on phones after the signboard-only change. It improves mobile texture sampling for already-loaded GLB models and sets a clearer minimum render scale while frame pacing is healthy. It does not add gameplay features, replace real models, or edit any model assets.

## Files included

- `js/KanoMobileWorldClarityRules.js` — resolution-floor and texture-filter rules.
- `js/KanoMobileWorldClarityUpgrade.js` — additive runtime hooks for `ModelManager.load` and the existing adaptive-quality resolution method.
- `tests/KanoMobileWorldClarityRules.test.mjs` — focused rules tests.
- `tests/KanoMobileWorldClarityIntegration.test.mjs` — hook and integration checks.
- `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` — one import line for the existing pre-main module.

## Install with File Explorer

1. Extract the ZIP.
2. Copy the two `.js` files from the package's `js` folder into the project's existing `js` folder.
3. Copy the two `.mjs` files into the project's `tests` folder. **Do not copy `.mjs` files into `js`.**
4. Add the single import line shown in `integration/KanoWorldPerformanceInstancingUpgrade.js.diff` to the existing `js/KanoWorldPerformanceInstancingUpgrade.js` after its `KanoAtmosphere` import. Do not replace that existing file.

No protected file is replaced. Nothing under `public/` or `public/assets/models/` is modified.

## Behavior

- Standard mode targets pixel ratio 1.0 when measured FPS is healthy, 0.88 in a softer-performance band, and 0.62 only during emergency frame-rate conditions.
- The existing `sharp` and `max` picture modes remain respected, but their requested ratio is still bounded by the device's configured maximum.
- The existing adaptive controller retains control over ratio changes; a low frame rate can still lower resolution.
- Existing loaded GLB texture images and UVs are preserved. Only magnification/minification filters and anisotropy are adjusted on mobile.
- Textures use anisotropy capped at four. Data, video and compressed textures are not forced into mipmap filtering.

## Diagnostic

After startup on a phone, run in the browser console:

```js
window.kanoMobileWorldClarityAudit()
```

The report includes the actual adaptive ratio, CSS and backing canvas dimensions, selected sharpness mode, and counts of GLB textures processed. The report is evidence of settings and counts, not a substitute for visual verification.

## Verification and limitations

The included focused tests cover the ratio policy and patch contract. The full repository `npm test`, real-browser output, and physical-phone frame pacing were not run in this build environment. The world should be inspected on the target phone after applying the update. If measured FPS enters the emergency band, clarity is intentionally traded for playability.
