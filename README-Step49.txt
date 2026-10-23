KANO LIFE — STEP 49: STREET RHYTHM

Purpose
-------
Connect background traffic density to the existing KanoDayCycle clock. Rush
periods can carry more traffic, Fajr and late night are quieter, and the
in-game Friday Jumu'ah window is very quiet. The hour before the window has a
modest travel surge.

Changed files only
------------------
js/KanoStreetRhythm.js
  Pure density and target-pool helpers.

js/KanoStreetRhythmUpgrade.js
  Additive wrappers around Game.spawnInitial and Game.moveTraffic. The
  existing game movement, collision, traffic selection/mix and renderer stay
  authoritative. Changes to pool size are gradual during an active run.

js/KanoModelAssetVisualUpgrade.js
  Complete replacement based on the existing Step 48 entry module, with one
  additional import to activate KanoStreetRhythmUpgrade before the existing
  gameplay bootstrap. The Step 45–48 life-simulation imports remain present.

 tests/KanoStreetRhythm.test.mjs
  Focused helper and runtime integration regression tests.

Installation
------------
1. Extract this ZIP into the existing Kano Run project root.
2. Copy the two new JavaScript files into js/.
3. Replace js/KanoModelAssetVisualUpgrade.js with the included complete file.
4. Copy tests/KanoStreetRhythm.test.mjs into tests/.
5. Keep all other files from the current repaired project unchanged.

Do NOT replace main.js, game.js, renderer3d.js, index.html, CSS, assets, the
service worker, web manifest, or other existing Step 24–48 repairs. This ZIP
intentionally contains no copies of those files.

Behavior notes
--------------
- The existing KanoDayCycle.modifiers().trafficDensity value drives density.
- Baseline pools remain 5 vehicles on mobile and 8 on desktop at density 1.
- Mobile target pool is capped at 6; desktop at 12.
- A small minimum traffic pool is kept during Friday Jumu'ah, so the driving
  scene does not become completely empty.
- The simulated calendar treats days 5, 12, 19, ... as Fridays. The 13:00–14:15
  Jumu'ah window is a simplified gameplay approximation, not a real calendar
  calculation or religious timetable.
- This feature changes background traffic pool size only. It does not modify
  fare, fuel, collision, steering, speed, renderer, or model asset logic.

Validation
----------
Focused tests: 13/13 passed.
JavaScript syntax checks: 3/3 passed.
ZIP integrity: checked after creation.
Full repaired-project suite, production build, browser rendering and real-phone
performance were not run in this validation environment.
