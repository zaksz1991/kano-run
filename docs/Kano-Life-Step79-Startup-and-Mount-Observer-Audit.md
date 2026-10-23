# Kano Life Step 79 — Startup and Mount-Observer Audit

**Audit date:** 23 October 2026  
**Scope:** latest supplied offline source snapshot, Step 78 hotfix, public `main` source spot-checks, full offline tests, syntax and static release checks.

## Findings

### P0 — Confirmed missing binding in the deployed source revision

The household-water UI refers to `MAX_HOUSEHOLD_WATER_LITRES` to disable water purchases that would exceed the household capacity. The UI file in the publicly accessible `main` revision inspected for this audit uses the name but does not import it. The model file exports it as `500`. This raises a `ReferenceError` when that code path is evaluated. The replacement UI module imports the named export. A regression test imports the model and asserts the exported cap remains `500`.

The live diagnostic reports the resulting exception in the compiled bundle and `gamePresent: false`, `uiBound: false`. The missing binding is a confirmed bug, and it can abort an import graph that depends on that module. Without a post-fix browser trace, it is not possible to assert it is the only startup failure.

### P1 — One-time panel mount observers lived too long

Several sim modules observed `document.documentElement` with `{ childList: true, subtree: true }` to wait for a Life & Career panel host. In the actual static page, `#kano-life-career-screen` and `.klc-panel` are already present before modules run. A panel mounted during initial setup did not need its observer to keep watching every later DOM mutation.

The replacements guard these observers behind the missing-panel condition and disconnect them when mounting succeeds. The social drama menu button is synchronously created in the static start/pause shells; the permanent full-document observer for that control has been removed. Social-network attachment can still wait if its parent panel genuinely appears later, but its observer disconnects after the attachment succeeds.

These are lifecycle/performance fixes based on source inspection. They reduce unnecessary ongoing observation in the normal path but do not prove the exact cause of the recorded long tasks.

### P2 — Long-task diagnostics cannot attribute the stack

The supplied report measured main-thread tasks of 3.543 s and 2.379 s, alongside several shorter tasks. Long Tasks measurements show blocked UI-thread work; without a sampled call stack or a reproducible profile, the timing alone cannot identify a specific offending function. The patch leaves the diagnostic instrumentation intact and explicitly avoids claiming these timings have been eliminated.

## Change summary

- Fixed the household-water constant import.
- Added missing-panel guards and disconnect-on-success to 13 mount-only observers.
- Removed the unnecessary permanent observer for the People & Relationships menu button.
- Kept the static UI hosts, `main.js`, game engine, settings values/IDs, wallet, storage, both renderers and GLB assets unchanged.
- Added regression checks for the import, static host ordering, observer lifecycle and social-network attachment.

## Verification results

- Full offline merged test suite: **468 passed, 0 failed**.
- Syntax: **218 JS/MJS files passed**.
- Release structure and local imports: **13 checks passed, 0 warnings, 0 failures**.
- Browser/production Vite build: **not verified**. A headless Chromium request to the live site did not return a usable DOM before timeout; no live fix claim is made.
- Deployment: **not performed**.

## Required acceptance checks after inclusion in a production build

1. Startup diagnostic shows `uiBound: true` and `gamePresent: true`.
2. No `MAX_HOUSEHOLD_WATER_LITRES` exception appears.
3. `START DRIVING` enters the existing morning routine or game flow.
4. Life & Career opens from start and pause menus; original settings work.
5. Desktop and mobile browser profiles record fresh long-task durations after the import fix. Compare them to the old 3.543 s and 2.379 s readings; do not infer causality solely from time correlation.
