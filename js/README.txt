KANO RUN — 3D SCENE + UI COMPATIBILITY REPAIR

Why the game can show only a dark screen:
The current js/main.js animation loop calls game.update(delta) but does not call renderer.render(...). The 3D renderer builds the road, city environment and player keke, but the scene will not appear unless its render method is called every frame.

Apply these two small edits on GitHub (main branch):

1) Open js/main.js.
Find the loop near the bottom:

  function loop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = Math.min(32, Math.max(0, timestamp - lastFrameTime));
    lastFrameTime = timestamp;

    game.update(delta);
    syncDrivingControls();
    requestAnimationFrame(loop);
  }

Replace it with the complete corrected loop in main-loop-replacement.txt.

2) Open js/ui.js.
Inside `export class UI`, add the two compatibility methods from ui-methods.txt anywhere inside the class, for example immediately after showToast(). The methods must be inside the class braces.

3) Commit both files to main and wait for the Vercel deployment to finish. Then hard-refresh the game with Ctrl+Shift+R.

Expected result:
- The renderer draws every animation frame.
- The 3D road/map, Kano roadside environment and player keke become visible.
- The start button no longer crashes because of missing setMission/showMissionToast methods.

This package contains targeted code changes, not a full repository snapshot. It does not modify index.html. The live deployment has not been tested from this environment.
