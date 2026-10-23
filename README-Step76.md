# Kano Life — Step 76: Start-Page, Life & Career, Settings and Simulation Audit

## Purpose

This is a cumulative overlay for the existing `kano-run` repository. It fixes a proven source-level render-loop defect in the career integrations and supplies the missing static Life & Career host required by Steps 64–75. It does not replace the game engine, core UI, save system, renderers or original 3D assets.

## Findings addressed

1. The Step 75 HTML referenced skills, employment and career-upgrade modules but did not contain `#kano-life-career-screen .klc-panel`, the host those modules query. It also had no `LIFE & CAREER` start-page or pause-menu button.
2. Four career modules installed `MutationObserver` on `document.documentElement` with `childList: true, subtree: true`, then called `render()` whenever the career host existed. Each render changes child nodes, so those writes retrigger the same observer. Once the host is present, this can create a continuous render/mutation cycle and freeze the browser's main thread.
3. Settings existed only inside the pause-menu markup, while the requested career screen was absent. The update now moves the five original setting rows before `main.js` constructs the UI. It moves the original elements rather than cloning them, so their IDs, saved values and existing UI event handlers remain authoritative.
4. The rendering-quality option wording implied that Auto would always switch between 2D and 3D. The labels are now clearer, while the option values and saved settings are unchanged.

## Changes included

- `index.html`: static Life & Career host with `.klc-panel`; start and pause-menu entry points; a simulation panel status area; a single shared settings container; preserved startup-recovery, Step 71–75 script references, original PWA links and one direct `/js/main.js` entry.
- `js/KanoLifeCareerSettingsHub.js`: moves the original settings nodes, routes entry/close/Escape correctly between start and pause menu, refreshes registered simulation panels on entry, and reports mounted panels without claiming that UI presence proves game-event integration.
- Complete replacement versions of:
  - `js/KanoNorthernDriverSkillsPathwaysUpgrade.js`
  - `js/KanoNorthernDriverEmploymentMarketUpgrade.js`
  - `js/KanoNorthernDriverEmploymentScheduleUpgrade.js`
  - `js/KanoNorthernDriverCareerProgressionUpgrade.js`
- `css/kano-life-step76-integration.css`: responsive Life & Career/settings layout, touch-friendly controls and visible integration status.
- `tests/KanoLifeCareerSettingsHub.test.mjs`: static contract and source regression checks.
- `public/assets/kano-life-keke-hero.webp`: preserved copy of the existing start-page asset, not a new model change.
- Audit, test and update-manifest documentation.

## Installation

1. Extract the ZIP in File Explorer.
2. Merge its `js`, `css`, `tests`, `docs` and `public` folders into the existing `kano-run` project. Replace the root `index.html` with the included complete version.
3. Keep the current `js/main.js`, `js/game.js`, `js/ui.js`, `js/storage.js`, `js/config.js`, both renderers, all career state/model modules, package files and all other existing assets.
4. The four files listed above under “Complete replacement versions” must be replaced in full so their obsolete document-wide observers are removed. No snippets or line-level edits are required.
5. The existing repository must retain the state/model dependencies imported by the four upgrade files, including the Step 65–68 non-UI modules. They are intentionally not duplicated in this targeted overlay.

## Verification boundaries

The 11 Step 76 tests, six JS/MJS syntax checks and static HTML/ID checks pass in the generated overlay. The attempt to run an actual Chromium browser smoke session did not complete in this environment, and the full Vite build was not run because the installed working tree had no `node_modules`. Do not treat the ZIP test suite as proof that the live Vercel site works. The production repo has not been modified or deployed.
