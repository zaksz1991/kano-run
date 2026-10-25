# Kano Run — AI Traffic Junction Turn, Next 21

## Fix in this update
The available turn math set the approach yaw to zero at both ends of its curve, while the branch phase immediately set the vehicle heading to 90 degrees. That caused a heading snap exactly when an AI vehicle entered the crossroad.

The approach curve now eases the vehicle heading from straight ahead to the final ±90-degree branch heading. The branch phase uses that same final heading, so orientation is continuous at the transition. This is a targeted correction to the existing additive traffic-turn module; it does not create or register missing road geometry.

## Regression coverage
- Replaced the old lane-change-style expectation of zero yaw at turn completion with the correct branch heading.
- Added a monotonic heading test from approach start through completion.
- Added an adapter-level regression test for the approach-to-branch transition.
- Retained the existing route-network, traffic movement, renderer, and mobile-instance tests.

## Verification boundary
- Focused tests: **41/41 passed** with `node --test tests/*.test.mjs`.
- ZIP integrity: checked after packaging.
- Full production repository tests and live browser gameplay were not run. This does not prove that the deployed game is fixed.

## Installation
Replace `js/KanoTrafficJunctionTurnUpgrade.js` and `js/KanoTrafficJunctionTurnMath.js` with the complete included files. Keep protected core files and model assets unchanged. This package is based on the previously supplied additive module set, not a fresh checkout of the latest GitHub main branch.
