# Kano Run — AI Traffic Junction Turn (Next 7)

## New in Next 7
- Route plans retain per-path traversal direction (`pathSteps`), not only path IDs.
- Bidirectional routes can start by travelling along a path in reverse; sampling starts at the correct endpoint and reverses the tangent and heading.
- The route planner avoids an immediate reversal over the same path after a vehicle has entered the network, without incorrectly rejecting a valid reverse-direction route at the start node.
- Runtime progress now carries travelled scene distance across connected paths using each path's actual length. This supports branches of different lengths and frames that cross multiple short paths.
- Added focused runtime tests for reverse traversal, progress carry, and agreement between sampled road X and the existing collision-position formula.

## Verification
`node --test tests/*.test.mjs` — **24/24 focused tests passed**.

This is not a full repository test run and does not verify live browser/mobile gameplay.

## Scope boundary
This is an additive road-network/runtime increment, not proof of live-game junction turns. The live scene has not supplied authoritative junction entry/exit coordinates, so this package does not fabricate road anchors. The live application loop and renderer are not modified, and the road-network bridge still requires real authored paths to be registered before traffic can follow them.

## Protected files
No changes to `game.js`, `renderer3d.js`, `main.js`, `ui.js`, `index.html`, `ModelManager.js`, the regression guard, or any `public/` asset. Test files remain in `tests/`.
