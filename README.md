# Kano Run — AI Traffic Junction Turn, Next 19

## Fix in this update
Traffic that has already started approaching a junction now keeps using that junction's saved world position until its turn completes. The navigation system advances `nextJunctionAt` when the player selects a branch; previously, that global target change could make an AI vehicle's approach jump to the next junction and prematurely complete its turn.

## Regression coverage
- Confirms the original `Game.moveTraffic` hook still runs.
- Confirms GLB actor and mobile-instanced yaw integration.
- Confirms sideways branch progress and collision-aligned lateral offset.
- Adds a regression test that advances the navigation target mid-approach and verifies the AI vehicle remains committed to its original junction.

## Verification boundary
These are focused module/integration-fixture tests, not the full repository suite. No browser or live deployment test was performed. This update does not register surveyed Kano street geometry and cannot prove live gameplay is fixed.

## Installation
Replace the existing `js/KanoTrafficJunctionTurnUpgrade.js` with the complete included file. Keep the existing `KanoRoadNavigationUpgrade.js` and all protected files unchanged.
