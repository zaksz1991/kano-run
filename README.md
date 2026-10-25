# Kano Run — Integrated AI Traffic Junction Turn Update

## Files
- `js/KanoRoadNavigationUpgrade.js` — current Step 95 navigation module copied from the source supplied for this repair, with one additive import to register the traffic-turn adapter. Existing navigation behavior is otherwise retained.
- `js/KanoTrafficJunctionTurnUpgrade.js` — hooks the existing `Game.moveTraffic` and `Renderer3D.syncTraffic` methods without replacing either protected file.
- `js/KanoTrafficJunctionTurnMath.js` — smooth lateral/yaw curve calculation helper.
- `tests/KanoTrafficJunctionTurnUpgrade.test.mjs` — focused math regression tests. Keep test files in `tests/`, not `js/`.

## Integration
Place the included `js` files in the project's existing `js` folder, replacing only the existing `KanoRoadNavigationUpgrade.js` with the included version and adding the two new JS modules. Do not replace `game.js`, `renderer3d.js`, `main.js`, `index.html`, model assets, or the regression guard. The navigation module already imports `Game` and `Renderer3D`; its new adapter import registers traffic turning against those existing classes.

## Repair in this revision
- Corrected the junction-relative depth sign so traffic begins its curve before the junction and completes after crossing it, rather than animating backward through the turn window.
- Corrected yaw sign to match Three.js vehicle orientation while keeping lateral offsets and lane completion aligned.
- Added a regression test for turn progress before versus after the junction.

## Scope and limitations
AI traffic near the active navigation junction can smoothly change to an adjacent lane, animate yaw during the curve, and update the lane at turn completion. The lateral offset is exposed through the existing `visualOffsetX` property so the existing collision calculation sees the same lateral position as rendering. The renderer hook applies the yaw to both GLB traffic actors and mobile instanced fallback traffic.

This is an arcade-style visual lane-turn adapter, not a surveyed road-network path planner. Full repository tests and browser gameplay were not available in this package, so no claim is made that the full game has been verified.
