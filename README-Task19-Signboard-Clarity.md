# Kano Life — Task 19: Mobile Signboard Clarity

## Purpose

The supplied screenshots show the KWANKWASIYYA sign and other road signs becoming difficult to read on a phone. The existing sign generator uses a 1200 × 300 canvas, 92 px title text, 39 px subtitle text, and anisotropy 2. This update moderately increases texture detail, title/subtitle size, stroke contrast, and filtering while keeping the existing sign meshes and world geometry intact.

## Files in this package

- `js/KanoSignboardClarityRules.js` — new sign texture profile and validation helpers.
- `tests/KanoSignboardClarity.test.mjs` — focused profile tests.
- `integration/KanoFlyoverRoundaboutUpgrade.js.diff` — small, targeted edit to the existing `js/KanoFlyoverRoundaboutUpgrade.js`.

## Install with File Explorer

1. Extract this ZIP.
2. Copy the new `KanoSignboardClarityRules.js` into the existing project `js` folder.
3. Copy `KanoSignboardClarity.test.mjs` into the existing `tests` folder.
4. Apply the unified diff to the current `js/KanoFlyoverRoundaboutUpgrade.js`. Only the sign texture function and one import are changed. Do not replace the full file with a snapshot.

No `.mjs` file goes into `js`. No protected file is modified. Nothing in `public/` or `public/assets/models/` is included or changed.

## What this does not claim

- It does not change the renderer's pixel ratio, frame pacing, fog distance, or global world resolution.
- It does not lengthen the flyover or implement road branching.
- It does not replace any existing sign or vehicle model.
- Browser rendering and physical-phone readability remain **not verified**.

The texture grows from 360,000 to 589,824 texels, about 1.64× per sign texture, rather than increasing both dimensions to 2048 and multiplying memory use by nearly 12× relative to the original 1200 × 300 surface.

## Verification

- Focused test suite: run `node --test tests/KanoSignboardClarity.test.mjs`.
- The test covers the profile and its bounds, not rendered sign appearance.
- Full project `npm test`: not run in this environment.
