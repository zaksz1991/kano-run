KANO LIFE — STEP 110 DELIVERY

Cumulative package: Step 109 + Step 110.

The Step 109 files are included so the paired Performance Lab and improved character LOD diagnostics are present alongside this step's simulation-side optimisation.

Apply the three complete replacement files and add the three new files listed in APPLY-STEP110.txt. Do not replace protected entrypoints or any public asset.

After the site deploys, verify the Performance Lab first: open the game with ?lab=1 and keep the browser tab visible for the complete run. The newer report should show paired baseline stability, p95 frame interval, slow-frame percentage, render-submission timing, and either asynchronous GPU timing or an explicit unavailable status.

Then compare a phone run on the Mali-G52 MC2 using the same route, traffic condition, game mode, device brightness, and approximate thermal state. Record at least two runs before and after. The source tests do not establish a physical-device FPS improvement.
