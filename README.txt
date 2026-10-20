KANO LIFE — HISBAH COMMUNITY PATROL UPGRADE

Package files
- index.html: complete replacement matching the current public app shell, with the Hisbah module loaded before main.js.
- js/KanoHisbahDirector.js: new side-effect module that integrates with Game and Renderer3D using existing public methods.
- package.json: build dependencies to use if the repository still has the original minimal package.json and Vercel says "vite: command not found".

Features
- Adds Hisbah community patrol encounters to Career and Free Roam. First encounter becomes eligible after the run has been active for about 28 seconds and progressed at least 0.22 km; the actual trigger waits for a safe-enough approach speed and the game's normal event cooldown.
- Uses the existing event card, pauses the keke at a safe standstill, and provides three outcomes: cooperate/clear the entrance, ask for guidance, or ignore the request.
- Uses the existing police vehicle model asset for a roadside patrol. If that GLB is unavailable, the renderer's existing police fallback is used. The patrol is tagged so it is non-colliding and staged on the shoulder.
- Adds restrained green/white patrol markings to the existing actor, not a brand-new vehicle model.
- Adds a Hisbah status panel and lifetime records to the pause menu. Patrol encounters are enabled by default and can be paused in the menu.
- Saves stop/cooperation/guidance/warning counts into the existing local save object via storage.js persist().
- Adds brief localized guidance text for Hausa, Yoruba, and Igbo selections.
- Leaves game.js, renderer3d.js, and existing driver controls untouched.

Installation
1. Add js/KanoHisbahDirector.js to the js folder.
2. Replace the complete index.html with the included copy. The Hisbah script must load before /js/main.js so its Game and Renderer3D hooks install before the game starts.
3. The original repository package.json contained only {"type":"module","private":true}. If you have not already fixed the Vercel error "vite: command not found", replace the root package.json with the included version. It declares Vite and Three.js and defines the build command.

Important integration details
- The renderer's existing `police` model is reused rather than inventing a Hisbah GLB path. For a clearly branded, model-perfect patrol vehicle, a dedicated Hisbah GLB and an explicit ModelManager catalog entry would still be needed.
- Encounters run only in Career and Free Roam, not timed challenge modes.
- Local Hisbah history is browser-local. It does not create a cloud account or modify banked funds.

Validation
- JavaScript syntax checks: run for the new module.
- HTML parser checks: confirm required IDs and that KanoHisbahDirector.js is ordered before main.js.
- Static assertions: confirm hook coverage for resetRun/tick/beginEvent/resolveEvent and Renderer3D.syncTraffic.
- ZIP integrity: checked.
- A live Vercel build and in-browser 3D visual test have not been run from this environment.
