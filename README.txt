KANO LIFE / KANO RUN — STEP 48
KEKE PARK OPERATIONS & DAILY DISPATCH
============================================================

PURPOSE
This step adds a persistent workday layer for a young Northern Nigerian man or woman earning a living with an Adaidaita Sahu keke NAPEP. It connects the selected operating stand and work style to actual Career/Free roam shifts, passenger boarding events, and completed passenger journeys.

WHAT CHANGES
- Adds eight selectable operating bases matching existing in-game route names: Sabon Gari, Farm Centre, Hotoro, Kofar Ruwa, BUK Gate, Kofar Wambai, Kofar Mata, and Yankaba Market.
- Adds three work styles: organised park queue, roadside loading, and independent roaming.
- Records workday entry, opening queue position, shift starts, successful boardings, completed trips, safe trips, correct drops, fare totals, distance, and park standing.
- Park standing rises after safe and correctly matched trips and falls when a trip is both rough and mismatched, or fails one of those service checks.
- Adds an optional daily park token for organised-queue work. The ₦40 amount is a balance-tuned game value, not a statement about real-world Kano park tariffs. The player must explicitly press the payment button; it cannot charge automatically, charge twice on the same simulated day, or spend more than the existing banked wallet contains.
- The selected stand can be explicitly saved as the next start route. This updates the game's existing route selection and does not teleport an active run.
- The new ledger records fare totals as reporting only. It does not pay extra money, create a second wallet, or alter the existing fare calculation.
- Work plans, queue records, standing, and the bounded activity ledger persist in local storage.

INSTALLATION
1. Extract this ZIP into the existing Kano Run project root — the folder containing index.html, package.json, js/, and tests/.
2. Replace js/KanoModelAssetVisualUpgrade.js with the supplied complete file. It now imports js/KanoNorthernDriverParkOperationsUpgrade.js after the existing Step 45–47 life and passenger modules.
3. Add js/KanoNorthernDriverParkOperations.js and js/KanoNorthernDriverParkOperationsUpgrade.js.
4. The ZIP includes unchanged Step 45–47 support copies of the life-simulation, social-life, and passenger-relationship modules. They match the preceding Step 47 bundle. They may remain unchanged if those versions are already installed.
5. Copy all included tests/*.test.mjs files into the existing tests/ folder.

KEEP UNCHANGED
Do not replace main.js, game.js, ui.js, storage.js, index.html, css/, renderer3d.js, GLB assets, the day-cycle code, the keke visibility/diagnostic modules, or KanoGameplayPresentationRepair.js. Those are existing project files and are not part of the Step 48 edit.

HOW IT WORKS
- Open LIFE & CAREER from the start screen or paused menu.
- Choose a stand and work style, then select SAVE WORK PLAN.
- Use USE STAND FOR NEXT START only when you want the selected stand to become the game's next route.
- JOIN TODAY'S DUTY records the selected shift plan.
- The optional PAY DAILY PARK TOKEN button only applies to an active organised-queue workday. It debits the existing banked wallet and records a once-per-day token.
- Career and Free roam shift starts are recorded automatically. Successful boardings and completed journeys feed the work ledger from the existing passenger-relationship event system.

EXPOSED DIAGNOSTIC API
window.kanoNorthernDriverParkOperations.snapshot()
window.kanoNorthernDriverParkOperations.setWorkPlan({ standId, workStyle })
window.kanoNorthernDriverParkOperations.startWorkday()
window.kanoNorthernDriverParkOperations.payDailyToken()
window.kanoNorthernDriverParkOperations.exportReport()

VALIDATION
- Combined included regression suite: 45/45 passed.
- JavaScript syntax checks for included runtime modules: passed.
- ZIP integrity: passed.
- Vite production build, browser interaction, WebGL rendering, and physical-phone performance were not verified in this environment.
