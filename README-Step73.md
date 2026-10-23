# Kano Life — Step 73 Civic Projects & Neighbourhood Services

This cumulative overlay extends the Step 72 Adashi/neighbourhood-support package with a civic-project layer. It is designed for the existing Vite/Three.js Kano Life project, not as a standalone site.

## Included

- `js/KanoNorthernDriverCivicProjects.js` — deterministic, storage-independent civic project and issue-board state transitions.
- `js/KanoNorthernDriverCivicProjectsUpgrade.js` — UI adapter using the existing save object and wallet.
- `tests/KanoNorthernDriverCivicProjects.test.mjs` — state-transition, contribution, bounds and export tests.
- `tests/KanoNorthernDriverCivicProjectsIntegration.test.mjs` — HTML registration, local module path and import smoke checks.
- Updated `tests/glb-catalog-sync.test.mjs` and `tests/root-cause-repair.test.mjs` — remove obsolete transformer/source-pattern expectations and check the current implementations instead.
- `docs/Kano-Life-Research-Step73-Civic-Projects-and-Neighbourhood-Services.md` — research, design rationale and browser test plan.
- `index.html` — cumulative Step 72 entry page updated for Step 73 and corrected so it no longer references two upgrade scripts that are absent from the available project snapshot.

The ZIP also carries forward the Step 69–72 life-simulation overlay files. Core game files and original assets are not included or replaced, except for the supplied cumulative `index.html`.

## Features

- Six fictional community initiatives: drain clearing/flood preparation, road-edge/pothole response, street lighting, shared water point maintenance, market clean-up and shade/rest-stop access.
- Existing-wallet contributions with allowlisted amounts and save verification.
- Non-cash volunteer effort and simulated neighbour progress.
- Seven in-game issue categories, local report throttling and staged review/referral.
- Neighbourhood service indicators, history and downloadable JSON activity report.
- Accessibility-oriented responsive layouts for the added panel.

## Financial and reporting boundaries

This is a fictional life simulation. Project targets are game-balancing assumptions, not real construction cost data. Simulated neighbour funding and volunteer value are not player cash. Player donations are the only operations in this feature that deduct money, and they use the existing `save.money` wallet. Issue reports remain local game records and are never sent to authorities.

## Install using the project GUI

1. Extract this ZIP into the existing `kano-run` repository folder, merging `js/`, `tests/` and `docs/`.
2. Replace the root `index.html` with the included cumulative version.
3. Keep the existing `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/renderer2d.js`, `js/storage.js`, `package.json`, `package-lock.json`, styles and asset folders unchanged.
4. Verify that the existing project contains `js/storage.js` and the older bootstrap files referenced by `index.html`; these belong to the original repository and are intentionally not duplicated into this overlay.
5. Check the report’s status matrix before treating the upgrade as release-ready.

## Known limitations

- The new indicator panel is a persistent simulation layer, not a live municipal data integration.
- Project completion changes the abstract indicators but does not yet change Three.js road geometry, drainage meshes, lighting meshes or traffic collision logic.
- Issue responses are fictional game states, not actual government acknowledgements.
- Timelines depend on the existing life modules’ in-game day value advancing.
- Unit tests cannot prove that the career panel is visible and usable in desktop/mobile browsers.

## Verification scope

The merged offline source-tree regression run passed **196 tests with 0 failures** on Node.js v22.16.0. The tests include the civic model and UI-import smoke checks, a catalog-only rewrite of two stale test files, and all tests supplied in the original snapshot and Step 72 overlay. The provided older source ZIP predates two runtime modules referenced by the current public main entrypoint; those references are retained and the integration test accounts for their newer-mainline provenance. Run the integration suite from the complete latest repository as well. The full Vite production build, browser visual checks and deployed-site verification remain untested.
