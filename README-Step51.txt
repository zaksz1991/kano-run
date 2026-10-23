KANO LIFE — STEP 51: PERSISTENT END-OF-DAY SETTLEMENT

PURPOSE
Adds a persistent daily closing statement to the existing LIFE & CAREER panel. It records park/trip outcomes and the driver's available financial position. It does not debit the wallet, add income, advance the game clock, or replace the existing per-shift settlement logic.

FILES IN THIS ZIP
- js/KanoPassengerDemandRhythmUpgrade.js — the existing Step 50 integration module with one additive import for Step 51.
- js/KanoNorthernDriverDaySettlement.js — report construction, persistence, idempotent close, and export methods.
- js/KanoNorthernDriverDaySettlementUpgrade.js — adds the UI panel and day-rollover integration.
- tests/KanoNorthernDriverDaySettlement.test.mjs — focused test coverage.
- README-Step51.txt and TEST-STATUS-Step51.txt — this guide and validation notes.

INSTALLATION
1. Extract into the existing Kano Run project root (the folder containing index.html and package.json).
2. Replace js/KanoPassengerDemandRhythmUpgrade.js with the complete file in this ZIP.
3. Add js/KanoNorthernDriverDaySettlement.js and js/KanoNorthernDriverDaySettlementUpgrade.js into js/.
4. Copy tests/KanoNorthernDriverDaySettlement.test.mjs into your existing tests folder.

IMPORTANT PRESERVATION NOTE
This ZIP intentionally contains no replacement for main.js, game.js, renderer3d.js, index.html, the PWA service worker, manifest, CSS, or 3D assets. Keep the current Claude repair changes, Steps 24–50, and all other project files intact. The changed Step 50 integration file retains its existing demand and fare hooks, then imports the new Step 51 add-on.

BEHAVIOR
- Adds a CLOSE TODAY'S BOOKS action to LIFE & CAREER.
- Blocks manual close while a run is active.
- Builds a statement from the requested day in the existing park ledger and the current career snapshot.
- A day can only be closed once; repeat requests return the existing report and do not create additional financial effects.
- On world-day rollover, the previous day is automatically recorded when no run is active. If the driver is mid-run, the previous-day statement is queued until the current run ends.
- Stores up to 60 daily statements in browser localStorage and exposes a JSON export action.
- A statement contains daily trip/fare stats, park standing/token, wallet/savings/arrears, vehicle outstanding, lifetime totals for context, and the last settled run only when its report day matches.
- The report is bookkeeping only. The existing per-shift career settlement remains the sole authority that applies game expenses.

VALIDATION LIMITS
Unit tests verify report contents, persistence, idempotency and storage failures. The live current-repair project build, browser rendering and real-phone behavior were not verified in this environment.
