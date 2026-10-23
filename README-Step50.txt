KANO LIFE — STEP 50: PASSENGER DEMAND & FARE RHYTHM

PURPOSE
This additive upgrade connects the existing in-game day cycle to passenger fares and the availability of useful pickup opportunities. Morning and evening rush periods receive higher fare multipliers from KanoDayCycle when available. During stronger demand, an otherwise-useless drop marker may become a pickup only when the driver has no passengers aboard. The simplified Friday Jumu'ah window remains quieter and does not convert drop markers.

FILES IN THIS ZIP
- js/KanoPassengerDemandRhythm.js — pure demand/fare rules.
- js/KanoPassengerDemandRhythmUpgrade.js — additive Game prototype integration.
- js/KanoStreetRhythmUpgrade.js — complete Step 49 module with one additive import at the end to load Step 50.
- tests/KanoPassengerDemandRhythm.test.mjs — focused pure and runtime tests.
- README-Step50.txt — this guide.
- TEST-STATUS-Step50.txt — validation summary.

INSTALLATION
1. Extract into the existing Kano Run project root, the folder containing index.html and package.json.
2. Replace js/KanoStreetRhythmUpgrade.js with the full file in this ZIP.
3. Add js/KanoPassengerDemandRhythm.js and js/KanoPassengerDemandRhythmUpgrade.js.
4. Copy tests/KanoPassengerDemandRhythm.test.mjs into the existing tests folder.

REQUIREMENT
Step 49 must already be installed because its js/KanoStreetRhythm.js helper and the existing visual-upgrade import chain load the street-rhythm integration. This ZIP intentionally does not include replacements for main.js, game.js, renderer3d.js, index.html, the service worker, manifest, CSS, or any 3D assets. Keep the Claude repair changes and Steps 45–49 intact.

BEHAVIOR
- Uses KanoDayCycle.modifiers().fareMultiplier when available; otherwise derives a bounded default from the in-game clock.
- Applies the time-of-day fare adjustment once when a passenger boards, after the existing pickup/relationship layers have created the passenger record.
- Avoids double-counting the original game's night fare premium.
- Stores small diagnostic metadata on each passenger record; the existing game wallet remains authoritative and no money is added at boarding.
- At higher-demand times only, a drop marker that cannot serve any onboard passenger may be converted to a single-seat pickup. Fuel-queue scenes and trips with passengers aboard are left unchanged.
- Timing and Friday Jumu'ah are simplified game rules, not current fares, a real prayer timetable, or a requirement for players to stop working.

ROLLBACK
To disable Step 50, remove the import of KanoPassengerDemandRhythmUpgrade.js from the end of js/KanoStreetRhythmUpgrade.js and remove the two Step 50 module files. Avoid reverting main.js, game.js, renderer3d.js or the Claude repair files.
