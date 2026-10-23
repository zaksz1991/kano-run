# Kano Life — Step 100: Balanced Traffic & Real Vehicle Assets

## What's changed

- Rebalances generated traffic into **40% keke, 30% motorcycle/okada, and 30% cars** in every complete ten-vehicle spawn batch. Each batch is shuffled, so the same vehicle is not spawned in a fixed sequence.
- Adds the bundled authentic keke, okada motorcycle, and sedan GLB files required by the existing model catalogue.
- Starts loading the keke, motorcycle, and car models during renderer startup, before later traffic actors need them.
- Adds `window.kanoTrafficCompositionAudit()` to report assigned traffic counts, current live traffic mix, and whether the actual model paths resolved in the runtime cache.
- Preserves existing lanes, vehicle speeds, depth, collisions, missions, fares, wallet/save data, and route progression.

This does not fabricate high-detail assets. If a bundled GLB fails to load, the existing renderer may still use its established fallback. The audit reports model availability and resolved paths instead of claiming every traffic actor is using a GLB.

## Installation

1. Download and extract `Kano-Life-Step100-Balanced-Traffic-Authentic-Vehicles.zip`.
2. Open `kano-step100-package`.
3. Copy its `js` and `public` folders into the root of the existing Kano Run project.
4. Merge folders and replace matching files when prompted.

The package includes cumulative `js` support files from Steps 92–99 for continuity. Keep `index.html`, `main.js`, `game.js`, `ui.js`, the core renderer, and saved game data unchanged. The only bootstrap replacement is the included complete `js/KanoModelAssetVisualUpgrade.js`, which registers the new additive traffic layer after the existing presentation layer.

## Verify in the game

After a run has started and traffic has spawned, open browser DevTools and run:

```js
window.kanoTrafficCompositionAudit()
```

Inspect `assignedCounts`, `liveCounts`, and `models`. The mix targets are enforced per ten newly spawned vehicles; the currently visible/live vehicles may differ because traffic actors enter and leave the view at different times.

## Verification status

- Cumulative regression tests: 28 passed, 0 failed (including 8 Step 100 tests).
- JavaScript/ES-module syntax checks: 15 files parsed successfully.
- ZIP integrity: checked after packaging.
- Interactive live-browser test and production build: not performed in this environment.
