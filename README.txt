KANO LIFE — STEP 31
Day-Cycle and Shared World-Clock Restore

PURPOSE
This update restores the in-game clock/HUD, hunger and fatigue runtime integration while using the existing Kano world clock as the authority. It avoids running a second independent time-of-day clock beside KanoPersistentDailySchedule and KanoAtmosphere.

FULL FILES INCLUDED
  js/main.js
  js/game.js
  js/productionSystems.js
  js/KanoDayCycle.js
  js/KanoDayHud.js
  tests/KanoDayCycle.test.mjs
  tests/KanoDayCycleIntegration.test.mjs

WHAT CHANGES
- Registers the clock and clock HUD in the real application startup loop.
- Starts breakfast state at null when the morning routine has not recorded an answer; true/false remain the actual ate/skipped values.
- Synchronizes the clock chip and day number with Game's existing gameClockMinutes and persistent world-day schedule, which also drive the sky/environment.
- Matches hunger/fatigue pacing to the existing world-clock speed.
- Connects hunger/fatigue warnings to existing roadside meal and rest events.
- Applies the existing optional rush-hour fare and fatigue steering modifiers.
- Makes rest advance the existing world-clock offset and save the new clock/day rather than allowing the clock display to jump backwards on the next frame.
- Buying roadside water also relieves a small amount of hunger after the purchase succeeds.
- Keeps defensive event handling and disposal for the HUD and clock.

INSTALLATION
1. Extract this ZIP into the root of your existing Kano Run project — the same folder containing package.json and index.html.
2. Allow the five files under js/ to be overwritten with the complete replacements supplied here.
3. Add tests/KanoDayCycleIntegration.test.mjs. The existing tests/KanoDayCycle.test.mjs is included as a reference copy.
4. Do not replace index.html, renderer3d.js, KanoGameplayPresentationRepair.js, KanoTrafficMix.js, CSS, assets, package.json, or other files for this step. Keep the previously installed traffic and roadside upgrades in place.

The ZIP contains complete files, not partial code snippets. It is an incremental update, not a replacement for the entire project.
