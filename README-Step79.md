# Kano Life — Step 79: Startup Error & Mount-Observer Performance Fix

This is a cumulative overlay for the existing `kano-run` repository. It contains **complete replacements** for 15 JavaScript modules, one regression test, and audit evidence. It does not replace the application entry point or game engine.

## Why this update exists

The supplied production diagnostic identified `ReferenceError: MAX_HOUSEHOLD_WATER_LITRES is not defined`. The current public `main` version inspected during this audit still used the constant in the household-water UI without importing it. This update imports it from `KanoNorthernDriverHouseholdWater.js`, the authoritative model that exports the 500-litre cap.

The same audit found a class of lifecycle issues: multiple sim-panel modules attach `MutationObserver`s to the entire document and retain them even after the panel has mounted. The Life & Career host is already present in the static `index.html`, before module scripts execute. Mount observers now are created only when their panel is still missing and disconnect as soon as mounting succeeds. The People & Relationships menu control is static, so its redundant permanent document observer was removed. The social-network observer disconnects immediately after the social panel is attached.

This follows the browser API's intended lifecycle: `MutationObserver.disconnect()` stops receiving further mutation notifications. A long-task measurement shows that work blocked the main thread, but by itself does not identify which script caused it; this update therefore does not claim to have eliminated the previously reported 3.543 s or 2.379 s tasks.

## Files supplied

- `js/KanoNorthernDriverHouseholdWaterUpgrade.js` — confirmed missing-import fix.
- `js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js`
- `js/KanoNorthernDriverUtilitiesUpgrade.js`
- `js/KanoNorthernDriverCivicProjectsUpgrade.js`
- `js/KanoNorthernDriverLefeNegotiationUpgrade.js`
- `js/KanoNorthernDriverAureJourneyUpgrade.js`
- `js/KanoNorthernDriverKanoSocietyMarketsUpgrade.js`
- `js/KanoNorthernDriverPhoneAndCommunicationUpgrade.js`
- `js/KanoNorthernDriverAdashiSupportUpgrade.js`
- `js/KanoNorthernDriverAureAndCultureUpgrade.js`
- `js/KanoNorthernDriverFestivalEconomyUpgrade.js`
- `js/KanoNorthernDriverParenthoodUpgrade.js`
- `js/KanoNorthernDriverDigitalLifeUpgrade.js`
- `js/KanoNorthernDriverSocialDramaUpgrade.js`
- `js/KanoNorthernDriverSocialNetworkUpgrade.js`
- `tests/KanoSimulationBootPerformanceRegression.test.mjs`
- `docs/Kano-Life-Step79-Startup-and-Mount-Observer-Audit.md`
- Test, syntax and release-check outputs.

## Install with File Explorer / GitHub GUI

1. Extract this ZIP.
2. Merge its `js` and `tests` folders into the existing `kano-run` project folder.
3. Replace the complete files with matching names. Do not copy code fragments.
4. Do not replace `index.html`, `js/main.js`, `js/game.js`, `js/ui.js`, `js/storage.js`, the renderers, package files, original GLBs, or user data.

The current static `index.html` does not need to change for this patch. Its Life & Career host and direct `/js/main.js` entry already exist. Preserve the user's newer `index.html` and unrelated work.

## Verification

On the merged offline snapshot:
- 468 Node tests passed, 0 failed.
- 218 JavaScript files passed syntax checks.
- 13 release structure/import checks passed, 0 failed.
- ZIP integrity checked after packaging.

The Vite production build and live desktop/mobile interactions have not been verified. Dependency installation/network access was unavailable in this run. No GitHub commit or Vercel deployment was performed.
