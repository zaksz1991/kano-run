KANO LIFE — STEP 53: KEKE ROADWORTHINESS & MECHANIC WORKSHOP

Purpose
- Persists the game's existing condition, engine and tyre values between Career/Free roam shifts.
- Adds a pre-shift inspection checklist for brakes, steering, lights/indicators and horn.
- Records inspection results, service history and shifts started with critical mechanical warnings.
- Adds four game-balanced workshop services. Purchases debit the existing LIFE & CAREER wallet, not savings.
- Applies repaired condition/engine/tyre values at the start of the next Career/Free roam shift and synchronizes the existing settlement baseline so it charges only actual wear.
- Does not claim to simulate separate brake, steering, light or horn physics; those remain roleplay/manual checks.

Files in this ZIP
- js/KanoNorthernDriverVehicleMaintenance.js (new persistent model)
- js/KanoNorthernDriverVehicleMaintenanceUpgrade.js (new UI and game lifecycle integration)
- js/KanoNorthernDriverLifeSimulationUpgrade.js (complete replacement; exposes guarded maintenance payment and shift-baseline sync using existing wallet/ledger)
- js/KanoNorthernDriverHouseholdBudgetUpgrade.js (complete replacement; loads the new maintenance module after existing UI and wallet integration)
- tests/KanoNorthernDriverVehicleMaintenance.test.mjs
- tests/KanoVehicleMaintenanceIntegration.test.mjs

Installation
1. Extract into the Kano Run project root containing index.html and package.json.
2. Replace only js/KanoNorthernDriverLifeSimulationUpgrade.js and js/KanoNorthernDriverHouseholdBudgetUpgrade.js with the complete versions in this ZIP.
3. Add js/KanoNorthernDriverVehicleMaintenance.js and js/KanoNorthernDriverVehicleMaintenanceUpgrade.js.
4. Add both test files to the existing tests folder.
5. Keep the current repaired main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS, models and all other upgrades unchanged.

Workshop amounts are gameplay-balancing values (₦450 tyres, ₦650 engine service, ₦500 general condition service, ₦1,250 full package), not claims about real Kano mechanic prices. Services require a sufficient wallet balance and cannot be purchased while a LIFE career shift is active. The module records maintenance separately from operating wear; normal existing end-of-shift settlement remains authoritative.

Validation
Run:
node --test tests/KanoNorthernDriverVehicleMaintenance.test.mjs tests/KanoVehicleMaintenanceIntegration.test.mjs

Tests included here passed in the isolated module validation environment. No production build, in-browser visual rendering or physical-phone performance test was run.
