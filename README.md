# Kano Run — AI Traffic Junction Turn, Next 23

## Change in this update

This update corrects the junction-relative depth sign. In the renderer, forward road depth maps to `z = -depth * 88`; therefore a vehicle before a junction has a smaller depth than the junction, and relative depth must be `junctionDepth - vehicleDepth`. The previous subtraction inverted before/after and could start or finish turns on the wrong side of the junction. It retains the Next 22 branch-lifetime protection.

Previously, a turning vehicle was cleared as soon as the junction passed the game's normal traffic despawn plane (`depth < -0.12`). The same frame then removed it from the traffic list, so the vehicle could begin a turn and disappear before travelling along the crossroad. The adapter now keeps a committed branch vehicle alive while the junction moves behind the player, skips the ordinary collision/despawn pass for that already-behind vehicle, and releases it once the junction leaves the visible depth range or the vehicle reaches the branch exit distance.

The original `Game.moveTraffic` and `Renderer3D.syncTraffic` implementations remain in place and are still called. No protected core files or model assets are included for replacement.

## Installation

From this ZIP, use only the complete replacement file:

- `js/KanoTrafficJunctionTurnMath.js` and `js/KanoTrafficJunctionTurnUpgrade.js`

Replace the existing file at that exact path in the project. Do not replace `game.js`, `renderer3d.js`, `main.js`, `index.html`, `KanoModelAssetVisualUpgrade.js`, `KanoDeviceTier.js`, `KanoPhoneComfortUpgrade.js`, `ModelManager.js`, `KanoGameplayPresentationRepair.js`, `tests/KanoRegressionGuard.test.mjs`, or anything under `public/`.

The existing `KanoRoadNavigationUpgrade.js` must already import `KanoTrafficJunctionTurnUpgrade.js` for this adapter to load. This package does not alter startup files. Full production integration and live gameplay remain unverified.

## Verification

- Focused package tests: **43/43 passed** with Node's test runner.
- Added regression coverage simulates the base game's `depth < -0.12` traffic despawn and checks that a committed turning vehicle remains until it leaves the junction view.
- ZIP integrity checked.
- The full production repository suite and live browser gameplay were not run. These tests do not prove the deployed game is fixed.
