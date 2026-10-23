# Kano Life — Step 69: Aure Journey & Shared Household Progression

## Source baseline

This update was prepared from the current public GitHub `main` entrypoint and current public Aure / family / career modules inspected at build time, not by modifying an older Step ZIP:

- https://raw.githubusercontent.com/zaksz1991/kano-run/main/index.html
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverAureAndCultureUpgrade.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverCareerProgressionUpgrade.js

`index.html` retains its six existing startup scripts, manifest link, Apple touch icon, canvas, HUD, PWA setup and screen markup, with one additive script reference for Step 69.

## What it adds

- A long-term relationship-journaling panel under the existing LIFE & CAREER panel.
- Life-stage-aware decisions for single, dating, engaged, married, separated and divorced profiles, read from the existing Aure profile.
- One relationship-development action per in-game day, with bounded communication, family-understanding, shared-planning, wellbeing and autonomy indicators.
- Non-punitive social-pressure context for older single characters. Being unmarried is never a failure state and does not itself reduce scores.
- Optional Aure-budget and shared-household-budget planning forms. Values are plans only; saving them does not debit, credit or reserve money.
- A bounded, persistent local history and JSON export that intentionally excludes partner names, private health information and actual message content.
- Status-specific actions for respectful family conversations, boundaries, future expectations, engaged-family discussions, household planning, protected time, safe separation, support networks and rebuilding goals after divorce.

The feature does not change the existing relationship status, pregnancy tracking, health records, phone messages, career employment, payroll, wallet, driving physics, renderer or asset catalogue. The status configured in the existing Aure panel remains authoritative.

## Install

Extract this ZIP into the Kano Run project root (the folder containing `index.html` and `package.json`). Replace only `index.html` with the included file and add the two new JavaScript files under `js/`. Copy the two test files under `tests/` if you keep tests in the repository.

Do not replace `main.js`, `game.js`, `renderer3d.js`, storage, service-worker, manifest, CSS, model assets or other repaired files.

The added runtime module imports the current Aure-and-culture, family-responsibilities and career-progression modules to ensure its related profile and life panel exist. Existing module imports are deduplicated by the browser module system.

## Validation performed here

- Pure model tests: 15 passed.
- Entry-point and integration-structure tests: 3 passed.
- JavaScript syntax checks: passed for both new modules and both tests.
- ZIP integrity: checked after packaging.

A full Vite production build and browser / phone rendering were not run against the user's complete current checkout. Isolated checks do not prove that the full deployed app builds or renders correctly.
