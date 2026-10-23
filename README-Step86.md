# Kano Life — Step 86: Runtime Warning Details in the Game UI

## Purpose

Step 86 makes the existing runtime audit's individual warnings, errors, long main-thread tasks, and Long Animation Frame script attributions visible inside the game's existing **Life & Career** screen. It removes the need for a separate `harness` folder, `boot.py`, or console snippet to inspect warnings.

The existing runtime audit exposes a local `snapshot()` object containing `issues`, `longTasks`, and `longAnimationFrames`. The Career screen previously showed only aggregate counts. This update renders the existing records as text in a collapsible, accessible details panel directly beneath the runtime summary.

## Changed files

- `js/KanoLifeCareerSettingsHub.js` — complete replacement file; displays up to the 30 most recent warning/error records and associated performance attribution.
- `tests/KanoLifeCareerRuntimeWarningDetails.test.mjs` — five regression checks for warning display, performance attribution and safe text rendering.

No game-engine, renderer, storage, settings IDs, save data, models, or other assets are replaced. The diagnostic remains local to the browser and does not add network calls or storage access.

## Apply with File Explorer

1. Extract this ZIP.
2. Copy `js/KanoLifeCareerSettingsHub.js` into the existing project's `js` folder, replacing the file with the same name.
3. The `tests` folder and the reports are optional for gameplay; they are included for regression verification.
4. Open the game and open **LIFE & CAREER · SIMS & SETTINGS**. Under the existing runtime summary, expand **WARNING & ERROR DETAILS** to inspect the individual messages and files.

Do not create a `harness` folder. No `boot.py` file is needed.

## Verification

- Full automated suite: **506 passed, 0 failed**.
- JavaScript syntax: **222 files passed**.
- Release-structure checks: **13 passed, 0 warnings, 0 failures**.
- ZIP integrity: checked after packaging.

## Limits

A Vite production build and interactive browser run were not completed in this environment. This step improves warning visibility; it does **not** claim to have fixed the six currently recorded warnings. Their specific message/file/attribution records must be inspected before applying targeted performance changes.
