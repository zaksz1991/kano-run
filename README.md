# Kano Run — AI Traffic Junction Turn (Next 6)

## New in Next 6
- Adds `KanoTrafficRoadNetwork.js`, an explicit road graph for traffic routing over authored world-space road paths.
- Supports connected junction branches marked left / straight / right, deterministic route selection, destination reachability, and pose sampling along a selected path.
- Validates branch endpoint continuity using the coordinates supplied by the road geometry; it does not invent road anchors or conceal disconnected roads.
- Includes the Task 32 `KanoDriveableRoadGeometry.js` core required to build and sample road paths.

## Important scope boundary
This is the route-network foundation, **not a completed live-game traffic integration**. The existing game uses traffic `lane` and `depth` coordinates and the renderer positions actors in its scrolling-road coordinate system. The live app has not yet supplied authoritative junction entry/exit anchors or converted the traffic loop, collision logic, and renderer to consume this graph. No guessed coordinates were wired into the game. Therefore this package does not claim that traffic now takes real branch turns in the live build.

## Files
- `js/KanoDriveableRoadGeometry.js` — cubic Bezier road path geometry and sampling.
- `js/KanoTrafficRoadNetwork.js` — graph registration, connectivity validation, route planning, and route pose sampling.
- `js/KanoTrafficJunctionTurnMath.js`, `js/KanoTrafficJunctionTurnUpgrade.js`, `js/KanoRoadNavigationUpgrade.js` — previous additive junction-turn adapter package.
- `tests/` — focused unit and mocked adapter tests. Keep `.mjs` files in `tests/`, never in `js/`.

## Verification
The included Node test suite checks route graph registration, connected branch selection, unreachable routes, deterministic choices, connection validation, and sampled poses, alongside the prior focused adapter tests. It is not a substitute for the full repository `npm test` or browser/mobile gameplay verification.

## Protected files
No changes are made to `game.js`, `renderer3d.js`, `main.js`, `ui.js`, `index.html`, `ModelManager.js`, the regression guard, or any `public/` asset. The navigation module is copied unchanged from the Next 5 package.
