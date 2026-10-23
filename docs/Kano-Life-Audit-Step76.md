# Kano Life — Source Audit and Repair Notes, Step 76

**Audit target:** the current `kano-run` repository's Step 75 startup markup and Step 64–70 career integration pattern.  
**Prepared:** 23 October 2026.  
**Production site:** https://kano-run.vercel.app/  
**Change type:** targeted source overlay; no GitHub edit or Vercel deployment was performed.

## Executive findings

### P0 — Unbounded render/mutation cycle in career integration

The skills-pathways, employment-market, employment-schedule and career-progression upgrades observe `document.documentElement` for all descendant child-list mutations. Their observer callbacks call `render()` whenever `#kano-life-career-screen .klc-panel` exists. Their render paths create or replace content inside the same descendant tree, so each render generates another observed mutation and another render. This is a self-triggering asynchronous mutation loop. It is a credible direct cause of a frozen browser main thread when the career host is mounted. This mechanism is confirmed by source inspection; a production DevTools stack trace was not captured here.

**Repair:** remove the four document-wide observers. Each module already renders during `install()` and subscribes to its domain events. Employment schedule and career progression retain their existing bounded 15-second refresh while the Life & Career screen is visible. The screen is static in `index.html` before the ES modules execute, so retries watching all document changes are unnecessary.

The patch deliberately does not globally monkey-patch `MutationObserver`, because that would affect unrelated overlays and renderer systems.

### P1 — Integration host and navigation missing from the supplied start page

The prior HTML referenced the Skills Pathways and Career Progression upgrades, but had no `#kano-life-career-screen` host. These modules therefore returned without rendering the sections the player was meant to use. The start page also lacked the `life-career-btn` and pause-menu `life-career-menu-btn` selectors used by the social-story code to open the Life & Career journey.

**Repair:** add one permanent host with the required `.klc-panel`, add one launch control on the start page and one in pause-menu actions, and connect close/Escape behavior so each entry route returns to its original screen. The social story's existing relationship-journey button now finds the expected Life & Career control.

### P1 — Settings need one owner, not duplicated controls

The existing UI looks controls up by their existing IDs and installs the original setting handlers. Cloning those selects into a career page would duplicate IDs and could split state. The new hub physically moves the existing five `.setting-row` elements into the Life & Career settings container before `main.js` constructs its `UI` object. No duplicate select or second settings store is introduced. The pause menu now has a direct Life & Career / Settings button.

Rendering-option labels were also clarified without changing stored values:

- `auto`: `3D first · automatic recovery`
- `3d`: `Prefer 3D renderer`
- `2d`: `Canvas 2D compatibility`

## Simulation wiring model

The new screen is a shared host for the existing modules: Skills / Certificates, Employment Market, Employment Schedule / Payroll, Workplace Wellbeing / Career Progression, Aure Journey, Lefe Negotiation, Parenthood, Seasonal Resilience, Adashi / Neighbourhood Support, Civic Projects, plus any other sections the installed modules mount under `.klc-panel`.

On opening the hub, the adapter calls only refresh methods exported by modules that are actually present, then enumerates mounted child sections. Its status label explicitly describes this as DOM/API detection rather than proof that all gameplay events, money changes or timeline transitions are wired correctly.

No new wallet, cash ledger, game loop or save format is added. The original `storage.js` and career state modules remain authoritative.

## Files replaced or added

| File | Action | Reason |
|---|---|---|
| `index.html` | Complete replacement | Adds career host and entry points; preserves existing direct main entry and prior feature registrations |
| `js/KanoLifeCareerSettingsHub.js` | New | Shares original setting controls and opens/returns from the Life & Career screen |
| `js/KanoNorthernDriverSkillsPathwaysUpgrade.js` | Complete replacement | Removes document-wide self-triggering observer |
| `js/KanoNorthernDriverEmploymentMarketUpgrade.js` | Complete replacement | Removes document-wide render observer |
| `js/KanoNorthernDriverEmploymentScheduleUpgrade.js` | Complete replacement | Removes document-wide render observer, retains bounded visible-screen refresh |
| `js/KanoNorthernDriverCareerProgressionUpgrade.js` | Complete replacement | Removes document-wide render observer, retains bounded visible-screen refresh |
| `css/kano-life-step76-integration.css` | New | Responsive hub, settings layout, status and focus styles |
| `tests/KanoLifeCareerSettingsHub.test.mjs` | New | Static and source regression tests |

No change was made to `main.js`, `game.js`, `ui.js`, `storage.js`, renderer source, model assets, package dependencies or deployment configuration.

## Evidence and verification

### Verified in this offline workspace

- 11 Step 76 tests passed, 0 failed.
- `node --check` passed for the four complete replacement modules, the new hub module and the test module: 6 files total.
- Static HTML checks found one doctype, one `<html>`, one `<body>`, no duplicate IDs, exactly one direct `/js/main.js` script reference, and exactly one each of the five original settings controls.
- Static source checks found no `new MutationObserver(...)` or document-wide `.observe(document.documentElement, ...)` calls in the four repaired modules.
- Each repaired module still retains its install/render path and its event-driven state-update handlers; schedule/career progression keep their existing 15-second visible-panel refreshes.

### Not verified

- Chromium smoke attempt did not complete in this execution environment.
- Full Vite production build was not run because the working source snapshot had no installed `node_modules`.
- No full desktop/mobile in-browser drive, settings change persistence test, GLB/WebGL test, 60-second play session, console/network capture or Android performance session was completed.
- No live Vercel deployment was altered or tested by this ZIP.

The app should therefore be validated against a preview of the target repository before treating the start-page freeze as closed. First confirm that the start screen opens, start routine advances, LIFE & CAREER opens, all five settings remain operational, Escape restores the correct prior screen, and no mutation/render loop appears in DevTools.

## Upstream source locations for review

- `index.html`: https://github.com/zaksz1991/kano-run/blob/main/index.html
- Skills Pathways UI: https://github.com/zaksz1991/kano-run/blob/main/js/KanoNorthernDriverSkillsPathwaysUpgrade.js
- Employment Market UI: https://github.com/zaksz1991/kano-run/blob/main/js/KanoNorthernDriverEmploymentMarketUpgrade.js
- Employment Schedule UI: https://github.com/zaksz1991/kano-run/blob/main/js/KanoNorthernDriverEmploymentScheduleUpgrade.js
- Career Progression UI: https://github.com/zaksz1991/kano-run/blob/main/js/KanoNorthernDriverCareerProgressionUpgrade.js
