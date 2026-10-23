KANO LIFE — STEP 56: DRIVER PAPERS & KAROTA CHECKPOINT READINESS

Purpose
- Adds an in-game compliance/roadside-papers simulation to LIFE & CAREER.
- Tracks an operating permit, vehicle inspection record, third-party cover, and driver badge/identification.
- Papers expire according to the simulated in-game day; renewal fees and validity periods are fictional gameplay values, not verified Kano tariffs or legal advice.
- Uses the existing `kanoNorthernDriverLifeSimulation.chargeExpense` wallet transaction for paid renewals; no second wallet is created.
- Hooks the existing Game.resolveEvent only to detect a successfully resolved KAROTA event. Core game.js, main.js, renderer3d.js, index.html, service worker, manifest, CSS and assets are not included or replaced.
- At a KAROTA checkpoint, current documents reduce enforcement heat slightly; missing/expired records increase it. Running does not receive a paperwork bonus and does not have the base game's escape penalty stacked by this add-on.
- Panel is added to `#kano-life-career-screen .klc-panel`.

INSTALLATION
Prerequisite: existing Steps 45–55 life, settlement, fuel-market and fuel-economy modules installed.

1. Extract this ZIP into the Kano Run project root.
2. Replace ONLY this complete add-on file:
   - js/KanoNorthernDriverFuelEconomyUpgrade.js
   The replacement differs from Step 55 by one additive import that loads `KanoNorthernDriverRoadComplianceUpgrade.js`.
3. Add:
   - js/KanoNorthernDriverRoadCompliance.js
   - js/KanoNorthernDriverRoadComplianceUpgrade.js
4. Copy both `KanoNorthernDriverRoadCompliance*.test.mjs` files into the existing tests folder.

Do NOT replace game.js, main.js, index.html, renderer3d.js, PWA files, CSS or models. No core game logic files are supplied in this ZIP.

SIMULATED DOCUMENTS
- Keke operating permit: ₦650, 30 in-game days
- Vehicle inspection record: ₦450, 14 in-game days
- Third-party cover: ₦900, 30 in-game days
- Driver badge / identification: ₦350, 30 in-game days
New saves begin with starter records that expire normally. Renewal is only allowed when the game is not in PLAY, EVENT or GAME_OVER state, and requires the existing wallet API. If storage or the wallet hook is unavailable, no renewal is accepted.

CHECKPOINT EFFECT
- The wrapper calls the original `resolveEvent()` first.
- It applies an adjustment only if a KAROTA event resolved and `s.checkpoints` increased.
- Current papers: small heat reduction for pay/talk choices.
- Missing/expired papers: bounded heat increase for pay/talk choices.
- The `run` choice receives neither extra paperwork adjustment nor an extra stacked escape penalty.

VALIDATION
- Run `node --test tests/KanoNorthernDriverRoadCompliance*.test.mjs` in the repo.
- Full Claude-repaired project suite and browser rendering were not available in this package environment. No claim is made about passing the full project test suite or visual correctness.
