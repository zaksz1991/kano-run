# Kano Life — Task 27: KAROTA, Roadside Wildlife and Pothole Redesign

## What this adds

- A clearer KAROTA officer appearance during the existing KAROTA event: reflective vest strips, shoulder tabs, a badge plate and a traffic wand that follows the officer's raised arm.
- Three additional animated goats to build on the existing two-goat crossing.
- Two animated dogs walking along the sandy shoulder; their lateral positions stay outside the driving lanes.
- An irregular beveled pothole rim, a darker recessed-looking floor, a depth shadow and scattered gravel, replacing the old evenly spaced chip layout while retaining the outer warning ring.
- A small runtime audit at `window.kanoKAROTAWildlifePotholeAudit()`.

## Installation

1. Extract this ZIP using File Explorer.
2. Copy `js/KanoKAROTAWildlifePotholeUpgrade.js` and `js/KanoKAROTAWildlifePotholeRules.js` into the existing project's `js` folder.
3. Copy `tests/KanoKAROTAWildlifePotholeRules.test.mjs` into the existing `tests` folder. Do not place the `.mjs` test file in `js`.
4. Open `integration/IMPORT-ORDER.txt` and add the single import line to the **current Claude activation-pack version** of `js/KanoWorldPerformanceInstancingUpgrade.js`. Do not replace that bridge with the public GitHub version, because it could remove Claude's feature imports and fuel-station integration.
5. Preserve all existing imports in the activation bridge and keep the new import before the presentation module that dynamically imports `main.js`.

## Safety and scope

- This is a presentation-only layer. It does not change speed, collision, route generation, fare handling or event odds.
- Potholes remain visually enhanced existing zone actors; underlying collision ownership stays in the game engine.
- The adapter creates low-poly animal and officer detail geometry; it does not claim that dedicated dog/goat/officer GLB assets already exist.
- No files under `public/` are added, replaced or renamed.
- `KanoGameplayPresentationRepair.js`, `renderer3d.js`, `game.js`, `main.js`, `ui.js`, `ModelManager.js`, `index.html` and the regression guard are not modified by this package.

## Verification performed here

- Focused tests: see `TEST-STATUS-Task27.txt`.
- Syntax checks: see `SYNTAX-STATUS-Task27.txt`.
- ZIP integrity: see `ZIP-STATUS-Task27.txt`.
- This package was not run against Claude's activation ZIP because that ZIP was described in the message but was not attached in this conversation. Full-repository test results and live browser/phone appearance therefore remain unverified for the combined project.

## Runtime audit

After the game boots and the relevant events have occurred, run:

```js
window.kanoKAROTAWildlifePotholeAudit()
```

Expected fields include the renderer and pothole hooks, number of redesigned potholes, the extra goat/dog counts once the goat event appears, and officer enhancement count once the KAROTA event appears.
