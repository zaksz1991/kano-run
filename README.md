# Kano Run — AI Traffic Junction Turn (Next 9)

## New in Next 9
- Connected `KanoTrafficRoadNetworkBridge` to `KanoRoadNavigationUpgrade.js`, so loading the navigation upgrade now installs the road-network movement hook on the existing `Game` class.
- Removed the bridge module's implicit direct dependency on `game.js`; navigation supplies the real `Game` class explicitly. This also makes the bridge independently testable with a mock game class.
- Added an integration test that registers connected road paths, assigns a live traffic object to a route, runs the original `moveTraffic` method, and verifies that the vehicle advances along the registered geometry while its collision X coordinate remains aligned.
- Exposed the instantiated bridge as `kanoTrafficRoadNetworkBridge` from the navigation module, alongside the browser audit global already published by the bridge.

## Verification
`node --test tests/*.test.mjs` — **26/26 focused tests passed**. This includes a new test of the bridge's Game hook and routed vehicle movement.

## Important boundary
This fixes a missing integration connection, but it does not by itself create surveyed road anchors or assign arbitrary live traffic automatically. The network still needs explicit scene-space paths registered through `window.kanoTrafficRoadNetwork` before traffic can take real branch turns. Full repository `npm test` and browser/mobile gameplay remain unverified.

## Additive scope
This package contains additive navigation/traffic modules and focused tests. It does not modify protected game/rendering source files or assets. Merge these files into the current project without replacing protected files with the snapshots used for analysis.
