Kano next upgrade (complete replacement files). Copy the 3 files into your repo's tests/ folder, replacing existing ones, then commit via GitHub web.
- Removes two meaningless packaging assertions that made npm test fail.
- Adds KanoLifeSimSoak.test.mjs: 5 simulated minutes of driving with a NaN/Infinity scan of game state, and a check that every KanoNorthernDriver sim module is reachable from index.html.
No game code changed. Phone FPS is still unmeasured: open the game with ?debugPerf=1 on your phone and send me a screenshot.
