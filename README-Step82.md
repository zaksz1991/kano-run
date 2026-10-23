# Kano Life — Step 82
## Household-water reference elimination + Aure & Culture startup guard

Step 82 carries forward the Step 81 complete JavaScript replacements and regression tests, then hardens two known failure points in the life-simulation module set.

### Changes

1. `js/KanoNorthernDriverHouseholdWaterUpgrade.js` no longer references `MAX_HOUSEHOLD_WATER_LITRES` directly. It reads the authoritative capacity from `householdWaterReport(...).maxLitres`, with a defensive 500-litre fallback if a malformed report is returned. This removes the UI's free-variable dependency that was associated with the recorded `ReferenceError`.
2. `js/KanoNorthernDriverAureAndCultureUpgrade.js` includes the declared `SECTION_ID` used by its mount observer and disconnects that observer after the section attaches. This keeps observer startup from failing on an undeclared identifier.
3. The existing household-water startup regression test is updated to verify the new report-based capacity path. The Step 82 regression test covers both the capacity-reference change and the Aure & Culture declaration.
4. The cumulative Step 81 runtime audit, LoAF attribution support, and mount-observer fixes are included unchanged.

### Apply with File Explorer

1. Extract this ZIP.
2. Copy its `js` and `tests` folders into the root of your existing Kano Run project.
3. Merge folders and replace files with the same names when prompted.

All supplied JavaScript files are complete replacement files. The ZIP does not replace `index.html`, `js/main.js`, `js/game.js`, `js/ui.js`, renderers, storage, package files, or game assets.

### Verification

- `node --test tests/*.test.mjs`: **474 passed, 0 failed**.
- JavaScript syntax: **220 files passed**.
- Release structure: **13 checks passed, 0 warnings, 0 failures**.
- Local imports: **145 JavaScript modules checked, no missing local imports reported**.
- ZIP integrity: verified separately after packaging.

### Limits

A Vite production build and interactive browser run were not completed because this workspace has no `node_modules` installation and network installation was unavailable. These checks do not establish that the live site is now booting correctly. The update addresses the two source-level failure points and adds regression coverage; the live result still requires browser verification after these files are applied to the project.
