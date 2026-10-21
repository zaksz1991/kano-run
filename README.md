# Kano Keke Life — Screenshot Root-Cause Repair

This package repairs two confirmed blockers seen in the current repository and the provided gameplay screenshot.

## Confirmed causes

1. **The model catalogue could classify a woman as the player's keke.** The old scanner matched the word `keke` across every GLB path. Because `characters/pedestrians/keke female.glb` exists in the current catalogue, that pedestrian path could enter the `keke` candidate list. The model manager selects the first successfully loaded candidate, so a character could replace the vehicle. The replacement scanner only accepts a player keke from the `vehicles/` tree and explicitly excludes human/character terms.
2. **The Vercel build is missing Vite.** The current `package.json` only declares the test script and does not declare `vite` or `three`. That matches the logged `vite: command not found` failure. The replacement package declares both runtime/build dependencies and restores `dev`, `build`, `preview`, and test scripts.
3. **The earlier manual mapping file was not consumed by the scanner.** The replacement scanner reads `scripts/glb-catalog-overrides.json`, validates paths against discovered files, and prevents a character asset from being assigned as the player keke.
4. **The old `uniqueSorted` assumed all items were strings.** The replacement supports both paths and GLB records, fixing `a.localeCompare is not a function` when records are passed.

## Files in this ZIP

- `package.json` — complete replacement. Vite is a normal dependency so `npm run build` can find it in the Vercel build environment.
- `scripts/glb-catalog-sync.mjs` — complete replacement for automatic GLB catalogue discovery, safe category assignment, manual overrides, and audit generation.
- `tests/glb-catalog-sync-regression.test.mjs` — regression tests for category separation, manual mapping, renamed files, and sort safety.

## Installation in GitHub's browser editor

1. Replace the repository-root `package.json` with the included complete file.
2. Replace `scripts/glb-catalog-sync.mjs` with the included complete file.
3. Add `tests/glb-catalog-sync-regression.test.mjs` at the same path. Keep your other tests.
4. **Keep your current `scripts/glb-catalog-overrides.json`**. It is read by the new scanner; it is not overwritten by this ZIP.
5. Keep `vite.config.js`, `js/ModelManager.js`, `index.html`, game code, and all GLB files unchanged for this repair.

## Verify after build

The generated report is published at:

`/assets/models/model-catalog-audit.generated.json`

Inspect `catalog.keke` to confirm it contains paths under `vehicles/`, not `characters/`. Inspect `unsafeKekeMatches` to see excluded non-vehicle files whose names mention keke. `overrideWarnings` reports missing/case-mismatched manual mappings.

## Scope and limitations

This package repairs the immediate wrong-model assignment and missing build dependency. It does not by itself add new animation clips, implement a goat-spawn event, decorate wedding vehicles, or redesign the street art. Those features should be applied only after the active model catalogue and production build are reliable; otherwise updates may be invisible or a human model may be selected as a vehicle again.
