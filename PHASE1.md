# Phase 1 — Critical fixes

## A. Architecture assessment
- Main.js called `game.start()` right after `initialize()`, which emitted `game:started`.
- Traffic, passengers, HUD, radio, missions all arm on `game:started` → world runs before lobby START RUN.
- MenuSystem already emits `game:request-start` on START RUN; Game listens and can call start — but Main already started.
- Mobile: desktop HUD + mobile dock + radio + daily missions all visible → overlap.
- Checkpoint gaps ~420–620m too frequent; panel was minimal.
- Fuel consumption 0.12/s drained tank in minutes.

## B. Files affected
- js/core/Main.js
- js/core/Game.js (audio mute on init)
- js/systems/MenuSystem.js
- js/systems/CheckpointSystem.js
- js/systems/PlayerVehicleSystem.js
- js/systems/DrivingSystem.js
- js/systems/MobileUISystem.js
- css/mobile-hud.css

## C. Risks
- If MenuSystem fails to open, player stuck after load (mitigate: menu:open + auto-open on initialized).
- Systems that only listen to game:started stay idle until START RUN (desired).

## D. Plan executed
1. Main no longer calls game.start() after init.
2. Lobby opens; simulation starts only on START RUN → game:request-start → Game.start().
3. KAROTA UI fullscreen official panel; spawn gaps 900–1400m, start 550m.
4. Fuel ~4× lower.
5. Mobile CSS hides desktop HUD stacks; body.kano-lobby hides dock during menu.

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-phase1\js\core\Main.js js\core\
copy /Y path\to\kano-phase1\js\core\Game.js js\core\
copy /Y path\to\kano-phase1\js\systems\*.js js\systems\
if not exist css mkdir css
copy /Y path\to\kano-phase1\css\mobile-hud.css css\
npm.cmd run build
git push
```

Then close mobile tab fully and reopen.
