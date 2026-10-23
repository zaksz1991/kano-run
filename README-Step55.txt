KANO LIFE — STEP 55: FUEL ECONOMY & DRIVING STYLE

Purpose
- Connects fuel consumption to the driver's selected working style (smooth, balanced, or fast/aggressive).
- Adds modest fuel-use penalties for harsh acceleration/braking and worn engine/body/tyres.
- Preserves the base game fuel model: speed, throttle and passenger-seat load already affect baseline fuel consumption. This module deliberately does not duplicate that passenger-load term.
- Produces an end-of-shift economy report showing baseline fuel use, adjusted fuel use, passenger load, harsh inputs and estimated replacement-cost difference.
- Uses the existing s.fuel gauge and fuel-market/LIFE & CAREER settlement chain. It creates no second wallet, does not debit money itself, and does not replace core game logic.
- Driving style is selected before a shift and locked while a Career/Free roam shift is active.
- Estimates in this screen use fuel-gauge percentage points, not litres. Replacement-cost differences are non-binding estimates based on the current simulated fuel price; they are not added to or deducted from the wallet.

INSTALLATION
Prerequisite: the Step 54 Fuel Market & Price Pressure module is installed, alongside existing Steps 45–53 life-simulation modules.

1. Extract this ZIP into the Kano Run project root (folder containing index.html and package.json).
2. Replace ONLY this complete existing file:
   - js/KanoNorthernDriverFuelMarketUpgrade.js
3. Add these new files:
   - js/KanoNorthernDriverFuelEconomy.js
   - js/KanoNorthernDriverFuelEconomyUpgrade.js
4. Copy both Step 55 tests into the existing tests folder.

The only existing file replaced is FuelMarketUpgrade, with one additive import that loads FuelEconomyUpgrade. The ZIP intentionally does not contain main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS or 3D assets, preserving Claude's repaired core files.

BEHAVIOUR
- Smooth style applies a modest economy multiplier. Balanced uses the baseline; fast/aggressive applies a modest consumption multiplier.
- Actual raw fuel usage is measured around the existing Game.tick call. The multiplier is then applied to that already-calculated fuel use, preserving the existing speed/throttle/passenger-load rate instead of introducing a competing fuel drain loop.
- Vehicle engine, condition and tyre values influence the multiplier. Harsh acceleration/braking are detected from observed speed changes and current controls.
- Fuel-market shift-start and shift-end events delimit the summary; no report is finalized for an unfinished shift.
- The report's estimated replacement cost is informational and does not change the wallet. The regular LIFE settlement remains authoritative for any fuel billing.

VALIDATION
- Step 55 unit tests: 8 tests
- Integration guards: 3 tests
- Browser/WebGL rendering, production build and real-phone performance were not verified in this package.
