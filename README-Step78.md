# Kano Life Step 78 — Confirmed Startup Runtime Error Hotfix

## What the browser diagnostics identified

The 23 October 2026 diagnostic report recorded an uncaught `ReferenceError`:

`MAX_HOUSEHOLD_WATER_LITRES is not defined`

The existing model module exports this value as `500`, but `js/KanoNorthernDriverHouseholdWaterUpgrade.js` used it when rendering water-purchase buttons without importing it. When that render path ran, the module threw before completing its installation path. The value is now explicitly imported from the existing model module.

## Files

- `js/KanoNorthernDriverHouseholdWaterUpgrade.js` — complete replacement file with the missing named import fixed.
- `tests/KanoNorthernDriverHouseholdWaterStartupRegression.test.mjs` — regression tests for the missing import and server/test-environment import safety.
- `docs/Kano-Life-Step78-Startup-Runtime-Error-Fix.md` — diagnosis, audit scope and verification limits.
- `TEST-STATUS-Step78.txt` — test/build/browser status.
- `TEST-OUTPUT-Step78.txt` — full test output from the offline merged project snapshot.

## Install with File Explorer / GitHub GUI

1. Extract this ZIP.
2. Merge the included `js` and `tests` folders into the existing `kano-run` project.
3. Replace the complete file `js/KanoNorthernDriverHouseholdWaterUpgrade.js` with the supplied file. Do not paste a fragment.
4. Add the new regression test file under `tests/`.
5. Do not replace `index.html`, `js/main.js`, `js/game.js`, settings controls, wallet/storage, either renderer, package files, or original assets for this one-line runtime fix.

The live diagnostics show the household water module and its capacity model are present, so this patch assumes those existing files remain in the repository.

## Verification boundary

This exact runtime identifier error is repaired and covered by a regression test. The offline merged source passed all 463 `.mjs` tests, 217 JavaScript syntax checks and 13 release-structure checks. The Vite production build, post-fix browser startup on desktop/mobile, and live deployment remain unverified. The hotfix is not deployed automatically.
