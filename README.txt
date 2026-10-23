KANO LIFE — STEP 46: NORTHERN DRIVER DAILY LIFE & SOCIAL CHOICES
================================================================

PURPOSE
This additive update expands the Step 45 Life & Career layer with persistent daily decisions that reflect the balancing act of a young Northern Nigerian keke driver. Choices affect a single existing spendable wallet, relationship and readiness meters, and a social-life ledger. The driving renderer and keke asset pipeline are not replaced by this update.

DAILY SITUATIONS
One choice situation is offered per in-game world day. The deck cycles through:
- family support and household responsibility;
- keke-park contributions and standing;
- passenger fare negotiation and repeat-customer respect;
- a mechanic's inspection or service advice;
- helping a neighbour or community member;
- balancing evening work with family time and rest;
- preparing for a change in road/weather conditions.

Choices have different costs and relationship effects. The wallet cannot be driven below zero, unaffordable choices are rejected without changing state, and a resolved daily situation cannot be replayed to farm cash or reputation. All prices and positive fare amounts are intentionally simplified game-balance values, not claims about current Nigerian prices.

PERSISTENT METERS
- Family trust
- Park standing
- Passenger respect
- Community trust
- Vehicle-care readiness (a roleplay readiness meter, not a direct repair of the underlying keke condition)
- Wellbeing

ROUTINE PREFERENCES
The player can select Islamic prayer-time prompts, personal quiet-break reminders, or turn prompts off. The windows are fixed in-game roleplay windows; they are not location/date-based prayer-time calculations or authoritative real-world prayer times. Recording a routine updates the social-life ledger and wellbeing meter but does not force-jump the core game clock while paused.

INSTALLATION
1. Extract this ZIP into the root of the existing kano-run project (the folder containing index.html and package.json).
2. Replace js/KanoModelAssetVisualUpgrade.js with the complete file included here. It imports the social-life integration after the Step 45 Life & Career module and before the existing gameplay-presentation bootstrap.
3. Add js/KanoNorthernDriverRealLife.js and js/KanoNorthernDriverRealLifeUpgrade.js.
4. The ZIP also includes complete unchanged copies of js/KanoNorthernDriverLifeSimulation.js and js/KanoNorthernDriverLifeSimulationUpgrade.js from Step 45, plus Step 45 tests. Keep/retain these exact dependencies if they are already installed.
5. Copy the included tests/*.test.mjs files into the existing tests folder.
6. Keep main.js, game.js, ui.js, storage.js, index.html, CSS, renderer3d.js, model assets, mobile-performance updates, traffic and day-cycle upgrades, and keke diagnostics unchanged.

IN-GAME USE
Open LIFE & CAREER from the start screen or menu. The new Daily Life & Social Reputation section displays the meters, routine selector, today's situation, choices and recent social ledger. The daily situation follows the in-game world day; it is not based on the device's real-world date.

PERSISTENCE
Social relationships, routine preferences, daily choices and the social ledger are stored in browser storage under a separate key. Money changes are written to the game's existing save.money wallet and persisted with the existing storage module. Clearing site data clears browser-persisted social state.

VALIDATION
See TEST-STATUS.txt. Unit, integration-contract and syntax checks are reported there. Vite production build, live browser rendering and physical-phone behavior have not been verified in this environment.
