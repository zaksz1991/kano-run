KANO RUN — COMPLETE GAME.JS REPLACEMENT

File included:
- game.js — replace the existing js/game.js in the Kano Run project.

Changes in this build:
- Gas and brake controls are hidden on the title/start screen and shown during active gameplay.
- Traffic moves relative to the player's speed instead of every vehicle automatically moving toward the player.
- Traffic spawns farther ahead with a larger initial gap.
- Same-lane traffic is separated to reduce vehicles overlapping and driving through each other.

Installation:
1. Back up the current js/game.js.
2. Extract this ZIP.
3. Replace the project's js/game.js with the included game.js.
4. Do not modify index.html.
5. Test locally, then deploy to Vercel.

Verification status:
- JavaScript syntax check passed with Node.js.
- Browser gameplay and Vercel deployment have not been tested here. The fixes therefore are not claimed as fully verified.
