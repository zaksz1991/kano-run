# Kano Life Step 65 — Community Skills and Career Pathways

## Source baseline

This update was prepared against the public `main` source checked directly during this build, not by starting from one of the previous Step ZIPs. The current entrypoint was reviewed at:

- https://raw.githubusercontent.com/zaksz1991/kano-run/main/index.html
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoModelAssetVisualUpgrade.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverLifeSimulationUpgrade.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverDigitalLifeUpgrade.js

The public `main` digital-life module still contains the invalid single-quoted `Today's` message from the supplied Vercel error. This package includes a complete corrected copy of that module, changing only the problematic string quoting. The ZIP also replaces the current-main `index.html` to add one Step 65 script while preserving existing PWA links and startup modules, and adds the two new Step 65 modules and tests. `main.js`, `game.js`, `renderer3d.js`, `storage.js`, service-worker, manifest, CSS, GLB assets, and the current model/traffic repair files are not included as replacements.

## Feature

The LIFE & CAREER panel gains **Skills, Certificates & Career Pathways**. It offers free, fictional community learning tracks in keke safety, market bookkeeping, digital sales, customer care, and workplace readiness. Enrollment and attendance are blocked during active driving. A course may have at most two active enrollments; one session can be attended per in-game day, beginning no earlier than the day after enrollment. Completing a course creates a persistent certificate. Certificates can qualify the driver for simulated career pathways and the player can save/remove personal career interests.

This is a career-planning simulation, not a claim of real qualifications or real job offers. It does not award wages, deduct money, change driving physics, or replace the existing wallet. State is saved under `kano-life-skills-pathways-v1` in browser storage and can be exported as JSON from the panel.

## Installation

Extract at the project root (the folder containing `index.html` and `package.json`). Replace `index.html` with the supplied complete file; add both new files under `js/`; copy the two `KanoNorthernDriverSkillsPathways*.test.mjs` files into the existing `tests/` folder. Keep all other files unchanged.

## Checks performed here

- Focused skills-pathways unit tests: 14/14 passed.
- Entrypoint/integration checks: 2/2 passed.
- Step 64 build-hotfix regression tests: 2/2 passed.
- JavaScript syntax checks: passed for all three shipped modules (skills logic, skills UI, corrected Step 64 UI).
- Full Vite build and visual/browser testing: not run against the full current checkout in this environment.
