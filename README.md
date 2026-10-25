# Kano Run — AI Traffic Junction Turn, Next 22

## Change in this update

This update fixes the branch-lifetime defect in `js/KanoTrafficJunctionTurnUpgrade.js`.

Previously, a turning vehicle was cleared as soon as the junction passed the game's normal traffic despawn plane (`depth < -0.12`). The same frame then removed it from the traffic list, so the vehicle could begin a turn and disappear before travelling along the crossroad. The adapter now keeps a committed branch vehicle alive while the junction moves behind the player, skips the ordinary collision/despawn pass for that already-behind vehicle, and releases it once the junction leaves the visible depth range or the vehicle reaches the branch exit distance.

The original `Game.moveTraffic` and `Renderer3D.syncTraffic` implementations remain in place and are still called. No protected core files or model assets are included for replacement.

## Installation

From this ZIP, use only the complete replacement file:

- `js/KanoTrafficJunctionTurnUpgrade.js`

Replace the existing file at that exact path in the project. Do not replace `game.js`, `renderer3d.js`, `main.js`, `index.html`, `KanoModelAssetVisualUpgrade.js`, `KanoDeviceTier.js`, `KanoPhoneComfortUpgrade.js`, `ModelManager.js`, `KanoGameplayPresentationRepair.js`, `tests/KanoRegressionGuard.test.mjs`, or anything under `public/`.

The existing `KanoRoadNavigationUpgrade.js` must already import `KanoTrafficJunctionTurnUpgrade.js` for this adapter to load. This package does not alter startup files.

## Verification

- Focused package tests: **42/42 passed** with Node's test runner.
- Added regression coverage simulates the base game's `depth < -0.12` traffic despawn and checks that a committed turning vehicle remains until it leaves the junction view.
- ZIP integrity checked.
- The full production repository suite and live browser gameplay were not run. These tests do not prove the deployed game is fixed.
