# Kano Life — Step 71: Seasonal Living & Work Resilience

This additive release brings the Step 69/70 long-term driver/family modules together with a new research-informed seasonal planning layer. The merged `index.html` preserves the current public main entrypoint's six original upgrade scripts and PWA links, adds a seasonal environment bridge before those scripts, and registers the relationship/family modules plus the new panel.

## Package contents

- `index.html` — merged entrypoint based on the currently published GitHub `main` file inspected on 23 October 2026. Existing markup, game canvas/HUD, stylesheet, icon, manifest, and six startup modules are retained.
- `js/KanoNorthernDriverAureJourney.js` and `js/KanoNorthernDriverAureJourneyUpgrade.js` — Step 69 model/panel.
- `js/KanoNorthernDriverLefeNegotiation.js` and `js/KanoNorthernDriverLefeNegotiationUpgrade.js` — Step 70 relationship/list/wealth-pressure model/panel.
- `js/KanoNorthernDriverParenthood.js` and `js/KanoNorthernDriverParenthoodUpgrade.js` — Step 70 parenthood/family-growth model/panel.
- `js/KanoNorthernDriverSeasonalResilience.js` — pure seasonal-calendar and planning state model.
- `js/KanoNorthernDriverSeasonalBridgeCore.js` and `js/KanoNorthernDriverSeasonalEnvironmentBridge.js` — opt-in bridge into existing game/weather classes.
- `js/KanoNorthernDriverSeasonalResilienceUpgrade.js` — mobile-friendly Seasonal Living panel, action history, and user-triggered JSON export.
- `tests/` — Step 69/70 regression tests plus Step 71 seasonal model, integration-order, and bridge tests.
- `docs/Kano-Life-Research-2026-10-23.md` — source review, design implications, confidence limits, safety/data requirements, and roadmap.

## Integration assumptions

This is a **patch pack, not a full repository clone**. It does not contain or replace `main.js`, `game.js`, `renderer3d.js`, `storage.js`, core CSS, assets, or other public assets. It expects the current project to retain its existing modules (including `KanoAtmosphere.js`, `KanoNorthernDriverAureAndCultureUpgrade.js`, `KanoNorthernDriverFamilyResponsibilitiesUpgrade.js`, `KanoNorthernDriverCareerProgressionUpgrade.js`, and its normal storage/game dependencies). Do not replace the complete repository with this ZIP.

Add the packaged JavaScript files to the project's existing `js/` folder, merge/replace `index.html` with this pack's merged entrypoint, and add the tests/docs. The original game files are intentionally not included because this milestone does not require replacing them.

## Behaviour and safeguards

- Seasonal automation is **off by default**. With it off, the existing manual atmosphere season control remains available and the added bridge does not change clear-road zone generation.
- When enabled, the current simulated day controls the existing atmosphere's seasonal profile. On rainy-season days, one in five otherwise-clear eligible zone spawns is sampled into the game's existing rainy-road hazard generation; the original environment state is restored immediately afterward.
- The calendar uses approximate authored bands: days 1–59 and 305–365 Harmattan/cool dry; 60–134 hot dry; 135–288 rainy; 289–304 seasonal transition. These are gameplay windows, not official forecast boundaries.
- All seasonal risk values are illustrative game-design indices. They are not medical scores, measured local risk data, or live weather.
- Planning actions do not spend money, alter the existing wallet/fuel system, claim a transaction, or store partner/health/address data.
- The research brief recommends future live integrations only after source freshness, geography, units, and provenance are recorded.

## Validation status

See `TEST-STATUS-Step71.txt`. The pure seasonal model and bridge tests can be run with Node's test runner. A successful local module test does **not** establish that a Vite production build, current external imports, WebGL rendering, mobile performance, or the live Vercel deployment has been verified. The pack was not pushed to GitHub and no live deployment was performed.
