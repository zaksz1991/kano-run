# Kano Run — AI Traffic Junction Turn Update (Next 5)

## Included files
- `js/KanoRoadNavigationUpgrade.js`: the supplied Step 95 navigation module with an additive import for the traffic-turn adapter.
- `js/KanoTrafficJunctionTurnUpgrade.js`: additive hooks around `Game.moveTraffic` and `Renderer3D.syncTraffic`.
- `js/KanoTrafficJunctionTurnMath.js`: deterministic turn choice and turn-curve math.
- `tests/KanoTrafficJunctionTurnUpgrade.test.mjs`: focused math regression tests.
- `tests/KanoTrafficJunctionTurnIntegration.test.mjs`: runtime-hook tests using isolated mock Game and Renderer3D classes.

## What Next 5 adds
- Integration tests now execute the actual adapter against mock Game and Renderer3D classes, rather than testing only the math helpers.
- Verifies the original movement and renderer methods are still called.
- Verifies the turn offset survives the movement method's normal visual-offset reset, so collision reads and rendering share the same lateral position.
- Verifies direction-aware yaw is applied to both GLB actors and mobile fallback instances.

## Integration instructions
Copy the included JS files into the existing project `js` folder. Replace only the existing `KanoRoadNavigationUpgrade.js` with the supplied version and add the two `KanoTrafficJunctionTurn*` modules. Keep tests in `tests/`; do not copy `.mjs` files into `js/`. Do not replace `game.js`, `renderer3d.js`, `main.js`, `index.html`, model assets, or the regression guard.

## Scope and verification
The adapter currently creates a curved adjacent-lane transition around the active junction and animates yaw. It does not create full 3D side-road paths or a complete road-network path planner. The focused tests exercise math and hook behavior against mocks; they do not replace the full repository test suite or browser testing.
