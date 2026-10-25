# Kano Run — AI Traffic Junction Turn, Next 20

## Fix in this update
AI traffic could miss its turn window when a large frame-time step moved a vehicle from before the junction to beyond the entire approach/exit interval. The turn hook only checked the current position, so no turn was assigned after that jump.

The update tracks each vehicle's previous junction-relative depth for the current junction key. If a vehicle crosses the whole turn window between updates, it is assigned the deterministic turn and transitions into the branch rather than silently continuing past the junction. Tracking resets when the junction key changes.

## Regression coverage
- Adds an integration fixture that records a vehicle before the turn envelope, advances it past the entire envelope in one large step, then verifies it enters the branch on the next update.
- Retains existing tests for original movement calls, collision-aligned offsets, sideways branch travel, GLB/mobile yaw, junction commitment, route-network behavior, and renderer integration.

## Verification boundary
- Focused tests: 40/40 passed (`node --test tests/*.test.mjs`).
- ZIP integrity: checked after packaging.
- Full production repository tests and live browser gameplay were not run. This update does not register surveyed Kano road geometry and does not prove the deployed game is fixed.

## Installation
Replace the existing `js/KanoTrafficJunctionTurnUpgrade.js` with the complete included file. Keep `KanoRoadNavigationUpgrade.js`, protected core files, and model assets unchanged.
