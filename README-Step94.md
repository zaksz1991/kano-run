# Kano Life — Step 94: Kwankwasiyya Flyover & Roundabout Visuals

## Purpose

Step 94 is the next focused infrastructure pass after the street-motion and fuel/checkpoint upgrades. It makes the existing procedural flyovers read as Kano / Kwankwasiyya infrastructure and adds two lightweight roadside roundabout scenes with connected-looking approach arms and direction signage.

## Changes included

- `js/KanoFlyoverRoundaboutUpgrade.js` — new additive Three.js renderer layer. It decorates the renderer's existing looping flyovers with a prominent `KWANKWASIYYA · FLYOVER · KANO STATE` sign and red/white bands, while keeping the sign aligned when a model loader swaps the underlying flyover object. It adds two landscaped roundabout scenes with asphalt rings, entry/exit road arms, alternating red/white curbs, plants, lane marks, `KANO ROUNDABOUT` signs, and direction boards.
- `js/KanoModelAssetVisualUpgrade.js` — complete replacement carrying forward the Step 92/93 visual bootstrap and loading the new Step 94 layer after `KanoWorldInfrastructureUpgrade.js` and before the production gameplay bootstrap.
- `js/KanoStreetLifeMotionUpgrade.js` — complete Step 92 replacement carried forward, preserving articulated pedestrians and the checkpoint queue.
- `js/KanoWorldInfrastructureUpgrade.js` — complete Step 93 replacement carried forward, preserving the redesigned fuel forecourt and parked checkpoint keke.
- `tests/KanoFlyoverRoundaboutUpgrade.test.mjs` — six source-level regression checks.
- `docs/INSTANTMESH-ASSET-PIPELINE-Step94.md` — InstantMesh asset pipeline and scope notes.

## Installation with File Explorer

1. Download and extract the ZIP.
2. Open the extracted `kano-step94-package/js` folder.
3. Copy all four `.js` files into the existing project's `js` folder, choosing **Replace the files in the destination** when prompted.
4. No `index.html`, `main.js`, `game.js`, `renderer3d.js`, storage, settings, model catalogue, game-save data, or package configuration is replaced.

The package assumes the current working static-site setup already has the Three.js import map that fixed the earlier bare-module startup failure. Keep that import map in `index.html`.

## Important functional boundary

This is an appearance and road-landmark stage. It adds a clear Kwankwasiyya flyover sign and visible roundabout geometry; it does not yet change road topology. The core simulation still models a mostly linear recycled road, so the new roundabout boards do not provide actual turns. It also does not yet route the player over the flyover deck. A later stage must implement the driving path, steering choices, collision/path alignment, U-turn handling, and reverse controls together instead of faking them with scenery-only changes.

InstantMesh remains part of the higher-detail asset plan. InstantMesh inference was **not run** for this update, and the new meshes are native Three.js procedural geometry, not claimed InstantMesh outputs.

## Verification

- `node --test tests/*.test.mjs`: **529 passed, 0 failed** on the merged source snapshot.
- `node scripts/check-syntax.mjs`: **230 JavaScript files passed**.
- `node scripts/verify-release.mjs`: **13 checks passed, 0 warnings, 0 failures**; 149 local module imports checked.
- ZIP integrity was checked after packaging.
- A Vite production build and live browser visual test were not completed in this environment. The deployment appearance and mobile performance remain to be verified after applying the files.
