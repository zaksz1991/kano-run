KANO LIFE — STEP 54: FUEL MARKET & PRICE PRESSURE

Purpose
- Adds a persistent in-game fuel market to the Northern Nigerian keke-driver LIFE & CAREER simulation.
- Lets the player select a major filling station, independent station or roadside seller, then purchase fuel before a Career/Free roam shift.
- Carries the fuel gauge and any unused prepaid fuel credit between shifts.
- Applies a deterministic in-game day price multiplier to uncredited fuel used during a shift.
- Records one fuel-price complaint per simulated day and exports the fuel ledger.
- Uses the existing wallet and career ledger. Savings are not spendable; no second wallet is created.
- Prevents prepaid fuel from being charged again at shift settlement.

IMPORTANT PRICE AND QUANTITY NOTE
- Fuel points are fuel-gauge percentage points, not litres.
- All Naira amounts and station differences are fictional game-balancing values, not live Kano station prices or market-price claims.
- Fuel complaints record the player's experience; they do not award free money or reputation.
- The existing in-world arcade refuel pickups are left unchanged.

INSTALLATION
Prerequisite: Steps 45–53 and the existing Household Budget, Vehicle Maintenance, Street Rhythm, Passenger Demand and Day Settlement modules are installed.

1. Extract this ZIP into the Kano Run project root (the folder containing index.html and package.json).
2. Replace these COMPLETE existing files:
   - js/KanoNorthernDriverLifeSimulation.js
   - js/KanoNorthernDriverLifeSimulationUpgrade.js
   - js/KanoNorthernDriverHouseholdBudgetUpgrade.js
   - js/KanoNorthernDriverDaySettlementUpgrade.js
3. Add these new files:
   - js/KanoNorthernDriverFuelMarket.js
   - js/KanoNorthernDriverFuelMarketUpgrade.js
4. Copy the two Step 54 test files into the existing tests folder.

Why the day-settlement file is included
- It retains the existing day-settlement implementation and adds a final dynamic import of the household-budget layer.
- This ensures the current chain loads LIFE & CAREER first, then Household Budget, Vehicle Maintenance, and finally Fuel Market.
- It does not change the daily settlement's accounting or advance the game clock.

PRESERVE THESE FILES
Do NOT replace main.js, game.js, renderer3d.js, index.html, the service worker, web manifest, CSS, 3D assets, traffic selection, collisions, or the Claude repair changes.
No new script tag is required; the existing dynamic-import chain loads the fuel market.

BEHAVIOUR
- Fuel is persisted from Career/Free roam shift to shift.
- Fuel may only be bought when no Career/Free roam shift is active.
- Purchases are prepared in browser storage before the authoritative wallet transaction; if payment fails the prepared market state is rolled back.
- Bought fuel credits reduce the shift's billable fuel baseline. Any uncredited fuel use is charged by the existing LIFE ledger using the day's simulated market multiplier.
- The fuel-price complaint can be filed only once per in-game day.

VALIDATION
- Focused Step 54 tests: 13/13 passed.
- Cross-check regression subset covering the existing life-simulation and maintenance models plus Step 54: 43/43 passed in the isolated validation workspace.
- JavaScript syntax checks on all six changed JavaScript files: passed.
- ZIP integrity: checked.
- The complete Claude-repaired project test suite, Vite production build, browser/WebGL rendering, and physical-phone performance were not run in this environment.
