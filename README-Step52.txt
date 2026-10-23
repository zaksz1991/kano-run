KANO LIFE — STEP 52: HOUSEHOLD BUDGET & RAINY-DAY PLAN

Purpose
- Adds a persistent, editable weekly budget-planning panel to LIFE & CAREER.
- Helps a young Kano keke driver plan working capital, repairs/maintenance, vehicle hire or repayment, extra family support, an emergency contribution, and long-term goal savings.
- Seeds estimates from the last recorded shift where available.
- Warns when planned weekly set-asides exceed projected take-home.
- Saves the plan in browser storage and exports a JSON copy.

Files in this ZIP
- js/KanoNorthernDriverHouseholdBudget.js (new pure planner and persistence helpers)
- js/KanoNorthernDriverHouseholdBudgetUpgrade.js (new accessible UI integration)
- js/KanoNorthernDriverDaySettlementUpgrade.js (complete replacement; adds one dynamic import for the new panel)
- tests/KanoNorthernDriverHouseholdBudget.test.mjs (new tests)

Installation
1. Extract at the project root containing index.html and package.json.
2. Replace only js/KanoNorthernDriverDaySettlementUpgrade.js.
3. Add both new js/KanoNorthernDriverHouseholdBudget*.js files.
4. Add tests/KanoNorthernDriverHouseholdBudget.test.mjs to the existing tests folder.
5. Keep all other files, especially main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS, model assets, and previous upgrades, unchanged.

Important financial boundary
This feature is a planner, not an account. Its calculations and save action do not deduct wallet cash, move money into savings, pay arrears, charge the driver, or modify the existing end-of-day statement. The “emergency cash already set aside” field is a manual planning estimate and is not linked to game wallet or savings. Use the existing LIFE & CAREER transaction controls for real game-money changes.

Validation
Run: node --test tests/KanoNorthernDriverHouseholdBudget.test.mjs
This ZIP does not replace main.js/game.js/renderer3d.js and must be installed alongside Step 51.
