KANO LIFE — STEP 45: NORTHERN DRIVER LIFE SIMULATION
====================================================

PURPOSE
This update begins an additive, persistent life-and-career simulation layer for a young northern Nigerian keke driver. It is built around existing morning-routine scenes, world-day state, career payouts, the existing wallet and driver presets. It does not replace the driving renderer or existing gameplay systems.

PLAYER PROFILE
- Choose a young man or young woman (ages 18–35) and set the driver's name.
- Choose a family compound, single room, shared flat or married household.
- Choose whether the driver is mostly self-supporting, contributes to family, or is the primary provider.
- Choose owned keke, daily hire, or hire-purchase.
- Select a long-term goal: keke ownership, education, a small business, or home improvement.

PERSISTENT SIMULATION
- Records completed Career and Free roam shifts using the game's existing banked transaction.
- Tracks paid income, fuel, wear/maintenance, vehicle fees, household contributions, meals, passenger drops, distance and shift count.
- Maintains personal savings separately from spendable cash, with explicit wallet-to-savings deposits and arrears repayment.
- Charges daily hire and household contributions once per in-game world day, not on every completed run.
- Uses the existing banked wallet as the sole spendable wallet. It does not create a second spendable-money balance.
- Adds a life ledger and persistent goal progress. Costs are deliberately game-scaled for playability and are not claims about current Nigerian market prices.
- Does not apply the new shift-cost accounting to Time Attack, Fuel Gauge Challenge, Match Drop or Potholes Challenge.

INSTALLATION
1. Extract this ZIP into the root of the existing kano-run project (the folder containing index.html and package.json).
2. Replace js/KanoModelAssetVisualUpgrade.js with the full version in this ZIP. The only entry change is that it imports the life-simulation integration before the existing gameplay-presentation bootstrap.
3. Add js/KanoNorthernDriverLifeSimulation.js and js/KanoNorthernDriverLifeSimulationUpgrade.js.
4. Copy the included tests/*.test.mjs files into the existing tests folder.
5. Keep all other files and previous updates, especially renderer3d.js, game.js, ui.js, index.html, CSS, models, traffic updates, day-cycle updates and keke diagnostics.

IN-GAME USE
A LIFE & CAREER button is added to the start screen and menu. Save the profile, then use Career or Free roam. At the end of a banked shift, the ledger calculates game-scaled fuel, maintenance, vehicle and household costs. The profile and ledger persist in this browser. Driver identity text is shown in the HUD; gender selection chooses the existing Mama or RuffNeck gameplay preset by default, and the existing driver selector can still be used afterward.

PERSISTENCE NOTE
The life ledger uses browser storage. Clearing this browser's site data clears that profile/ledger. The game's banked wallet remains managed by the existing game storage module.

VALIDATION
See TEST-STATUS.txt. Focused unit tests and static integration tests are included. Production build, browser rendering and physical-phone behavior have not been verified in this environment.
