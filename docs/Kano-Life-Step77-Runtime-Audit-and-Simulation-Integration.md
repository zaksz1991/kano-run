# Kano Life — Step 77 Runtime Audit & Simulation Integration

**Audit date:** 23 October 2026  
**Project:** `kano-run` / Kano Life  
**Scope:** Start-page freeze diagnosis, script/ES-module order, Life & Career panel integration, settings continuity, and browser-visible diagnostics.

## Executive result

Step 77 adds a dependency-free runtime audit before the launch-recovery code. It makes the application report what the player currently cannot see when the start flow gets stuck: failed module entrypoints, uncaught runtime exceptions, unhandled promise rejections, long main-thread tasks, whether the canonical UI bound, whether the game object exists, what screen is visible, and whether the Life & Career settings host is present.

The diagnostic report is generated locally. The module does not create a `Game`, use a second frame loop, mutate game state, change settings, read the wallet or write saved data. Nothing is uploaded.

Step 76's source-level render-loop repair is retained. The full relative-import audit also found that `KanoNorthernDriverFuelEconomyUpgrade.js` referenced the absent local `KanoNorthernDriverFuelEconomy.js`; the expected existing rules/state module has been restored from the prior Step 55 feature package so the source import graph closes cleanly. The Skills Pathways, Employment Market, Employment Schedule and Career Progression modules use bounded/event-driven refresh rather than observing the entire document and recursively rendering their own mutations.

## Findings and modifications

### 1. Start-page failure is now observable

The previous recovery UI displayed a retry message, but gave the player no portable evidence to distinguish a script-fetch error, an uncaught JavaScript exception, a rejected async module, a long-running main-thread task or a game that simply did not leave the start screen.

`js/KanoLifeRuntimeAudit.js` is now the first module entrypoint. It records module load states and captures:

- global JavaScript errors and resource-load errors;
- unhandled promise rejections;
- main-thread tasks of at least 250 ms when the browser exposes the optional Long Tasks API;
- the result of checking the start flow 2.2 seconds after `START DRIVING` is clicked.

The existing launch-recovery message now has an **EXPORT DIAGNOSTICS** button. If the Life & Career screen opens, its **CHECK STARTUP & SIMS** and **EXPORT DIAGNOSTIC REPORT** controls give the same audit from the integration screen.

The module tracks only a bounded in-memory event history. The JSON export contains a page path without query parameters, screen/UI state, module entrypoint status, recent errors and long-task timings. It expressly omits localStorage, saved wallet balances, personal profile fields, cookies and URL query values.

### 2. Simulation and settings registration are explicit

The current `index.html` has a single direct `/js/main.js` entry. The new audit and launch recovery precede it. The Employment Market, Employment Schedule, Digital Life and Career Progression modules now also appear as explicit entrypoints. This isolates their installation from failures in a neighboring panel's top-level module; ES module caching prevents a duplicate module URL from executing twice.

The existing five settings fields remain the same DOM elements and IDs: `dialect-select`, `camera-select`, `road-select`, `mute-select` and `quality-select`. They are moved to the shared Life & Career screen instead of cloned, so the core UI retains its original controls and saved values.

The Life & Career summary separates counts of visible panels from detected simulation APIs and from runtime errors. A mounted panel is not represented as proof that its every game-event hook has passed browser testing.

### 3. Test-suite failures were stale integration contracts

The merged test collection contained historical tests that assumed `main.js` was absent from the project root, or expected the Aure cultural-life panel to be coupled to a driver-compliance module. Those expectations do not match the current full-app architecture. The affected tests now check module reachability through the current relationship journey, the unique canonical `main.js` entry, and the fact that add-on panels extend the existing engine rather than defining a replacement engine.

## Verification performed

### Verified locally

| Check | Result |
|---|---:|
| `node --test tests/*.test.mjs` | **461 passed, 0 failed** |
| `node --check` on JavaScript/MJS files under `js/`, `api/`, `scripts/` and `tests/` | **216 files passed** |
| Direct HTML module roots | 22 |
| Reachable local files in the entrypoint import graph | 86 |
| Full local import audit across `js/` | **145 modules checked; 0 missing relative imports** |
| Duplicate HTML element IDs | 0 |
| HTML doctype / root / body | 1 / 1 / 1 |
| Direct `/js/main.js` entrypoint | Exactly 1 |

### Not verified

- The full Vite production build was not completed. `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-timeout=12000` timed out in the execution environment, and dependencies were not available for a production build.
- The local Chromium headless fixture did not complete before timeout. No desktop or phone-browser result is claimed.
- The real deployed Vercel page was not modified or verified. The attempted headless Chromium run exited before page-level interaction results could be captured.
- The game's full visual state, WebGL assets, setting effects, and live `START DRIVING` interaction still need to be checked in a normal desktop browser and a mobile browser after installing the overlay.

The static results prove the script graph resolves in the assembled source snapshot; they do **not** prove the deployed runtime is free of errors. The new diagnostic report is intended to provide the missing runtime evidence if the freeze persists.

## Research references

The diagnostic design uses the browser's global `error` event for uncaught errors and certain resource failures, and `unhandledrejection` for rejected promises without a rejection handler. These events cover different error classes, so the audit records both. The optional Long Tasks API is guarded because its availability is limited and browser-dependent. Its high threshold here (250 ms) is a practical noise-control decision for an in-game diagnostic, not the browser specification's definition of a long task.

- MDN, [Window: error event](https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event)
- MDN, [Window: unhandledrejection event](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event)
- MDN, [PerformanceLongTaskTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)

## Release checklist

1. Merge the overlay and keep the original `main.js`, `game.js`, `ui.js`, `storage.js`, `config.js`, both renderers, package files and models.
2. Open the game on desktop and verify that the launch card shows usable Route, Driver and Mode selectors.
3. Click `START DRIVING`. If it remains on the start screen, export the diagnostic JSON from the recovery alert.
4. Open `LIFE & CAREER` from the start screen and pause menu. Confirm both return paths work.
5. Change and save each existing settings control; reopen the screen and verify the chosen values persist.
6. Confirm that Skills, Employment Market, Employment Schedule, Digital Life, Career Progression, Aure Journey, Parenthood, seasonal resilience, Adashi, civic projects, Social Drama and Social Network panels mount without a main-thread freeze.
7. Run a full Vite build and a 60-second drive test in Chrome desktop and a real phone browser. Review module failures, console errors, failed requests, long tasks and frame rate before calling the fix verified.
