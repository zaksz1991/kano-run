KANO LIFE / KANO RUN — STEP 47
PASSENGER TRUST, REPEAT CUSTOMERS & SERVICE REPUTATION
================================================================

PURPOSE
This upgrade deepens the persistent life simulation for a young Northern Nigerian keke NAPEP driver. Completed gameplay trips now shape the driver's relationships with recurring named passenger characters and the existing passenger-respect meter in LIFE & CAREER.

WHAT CHANGES IN GAMEPLAY
- The integration hooks the existing Game.pickup() and Game.drop() methods without replacing game.js or its fare logic.
- Only a real successful boarding is recorded. Failed pickups and full-keke rejection do not create passenger records.
- Only a successful drop-off that increments the game's drop counter settles a passenger trip.
- Correct, incident-free trips grow that passenger's trust and the driver's overall service reputation.
- Rough journeys or dropping at the wrong stop reduce trust and reputation.
- The existing passenger-respect meter is updated from actual trips: +3 for correct and safe, -2 for a trip that is either correct or safe but not both, and -5 when both the destination and safety outcome are poor. Values remain clamped from 0 to 100.
- A returning passenger with trust of 75 or more can offer a fare 3% above the base fare. A returning passenger with trust of 25 or less can negotiate a fare 3% lower. Other repeat encounters use the normal fare. This adjustment changes the ordinary in-game trip fare only; it does not mint cash or add a second wallet.
- LIFE & CAREER gains a passenger relationship section showing service reputation, completed trips, safe journeys, correct stops, repeat rides, familiar passengers and recent trip history.
- The system is persistent across refreshes using a dedicated local-storage record. It does not alter the keke renderer, collision physics, scene models, world-clock or mobile performance systems.

The game's existing name pool is used to represent recurring NPC passengers. Relationship and fare percentages are gameplay mechanics, not claims about real-world fares in Kano. No real market-price data is introduced.

INSTALLATION
1. Extract the ZIP into the existing Kano Run project root — the folder containing index.html, package.json, and the js/ and tests/ folders.
2. Replace these complete files:
   - js/KanoModelAssetVisualUpgrade.js
   - js/KanoNorthernDriverRealLife.js
   - js/KanoNorthernDriverRealLifeUpgrade.js
3. Add these new files:
   - js/KanoNorthernDriverPassengerRelationships.js
   - js/KanoNorthernDriverPassengerRelationshipsUpgrade.js
4. The ZIP includes unchanged copies of the Step 45 career modules as dependencies. Keep the same modules if they are already installed:
   - js/KanoNorthernDriverLifeSimulation.js
   - js/KanoNorthernDriverLifeSimulationUpgrade.js
5. Copy the three included new *.test.mjs files into the existing tests/ folder.

Do not replace main.js, game.js, ui.js, index.html, CSS, renderer3d.js, model assets or saved game data. The complete replacement files supplied here preserve the prior Step 45/46 hooks and add the passenger relationship integration to the existing visual-upgrade bootstrap.

DIAGNOSTICS / API
The browser exposes window.kanoNorthernDriverPassengerRelationships with snapshot(), getPassenger(name), exportReport(), and refresh() helpers. It also emits kano:passenger-relationship-updated after boarding and completed trips.

VALIDATION
- Step 47 focused tests: 21/21 passed.
- JavaScript syntax checks for seven included runtime modules: 7/7 passed.
- Full existing test suite after this change: 97 passed, 3 failed. The remaining failures are unrelated existing test/source mismatches in glb-catalog-sync.test.mjs (missing named export), the HTML world-performance module-order assertion (the base index.html does not register that script), and root-cause-repair.test.mjs (an outdated model-fitting source expectation). Step 47 does not change those files.
- ZIP integrity: passed.
- Vite production build, live browser behavior, WebGL rendering and physical-phone performance were not verified in this environment.
