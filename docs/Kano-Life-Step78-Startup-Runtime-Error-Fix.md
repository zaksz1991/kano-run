# Kano Life Step 78 — Startup Runtime Error: Audit & Repair

**Diagnostic source:** user-exported local browser report for `https://kano-run.vercel.app/`, generated 23 October 2026 at 16:24:01Z.

## Confirmed error

The report records `Uncaught ReferenceError: MAX_HOUSEHOLD_WATER_LITRES is not defined` in the built application. Review of the supplied Step 77 overlay found the matching source defect in `js/KanoNorthernDriverHouseholdWaterUpgrade.js`: the purchase-button render logic compares household reserve capacity with `MAX_HOUSEHOLD_WATER_LITRES`, while its import list omitted the symbol. The existing `js/KanoNorthernDriverHouseholdWater.js` exports it as `500`.

## Fix applied

Added `MAX_HOUSEHOLD_WATER_LITRES` to the named import from `./KanoNorthernDriverHouseholdWater.js`. This preserves the established 500-litre gameplay limit and does not change purchases, pricing, wallet accounting, or simulation state. A focused regression test checks both the source export and the UI binding, then smoke-imports the UI dependency graph with no browser globals.

## Other observations from the diagnostic

- `uiBound: false`, `gamePresent: false`, and `gameState: NOT_CREATED` confirm that the app had not completed creation/binding at the time of export.
- The launch selects and settings controls existed and were populated. This evidence does not point to a missing selector or missing settings element as the immediate defect.
- Seven long tasks were reported, including 3.543 s and 2.379 s tasks. They indicate expensive main-thread work but do not identify their exact source. This focused patch does not claim to have resolved those performance events; post-fix performance profiling remains necessary.
- The diagnostic lists a single loaded bundle and one runtime error. It does not include a full stack, source map or pre-fix heap/profile trace, so it cannot establish that the missing binding is the only cause of the startup failure. The repair addresses the specific observed uncaught exception first.

## Test evidence

- `node --test tests/*.test.mjs`: 463 passed, 0 failed, 0 skipped in the merged offline source snapshot.
- `node scripts/check-syntax.mjs`: 217 JavaScript files passed.
- `node scripts/verify-release.mjs`: 13 checks passed, 0 warnings, 0 failures; 145 JavaScript modules had their local relative imports checked.
- Vite build not run: dependencies were not installed in the offline working tree.
- Real desktop/mobile browser startup not verified after this source fix; no live site mutation or deployment performed.

## Next required runtime check

After the hotfix is present in a preview build, reload on desktop and phone, export a fresh diagnostic, and check: `uiBound: true`, `gamePresent: true`, no `MAX_HOUSEHOLD_WATER_LITRES` runtime error, Start Driving advances, Life & Career opens and closes, and each original settings control still responds. Profile long tasks separately after startup is confirmed.
