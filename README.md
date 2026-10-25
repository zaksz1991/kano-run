# Kano Run — AI Traffic Junction Turn (Next 13)

## New in Next 13
- Added connected route continuation for vehicles that reach the end of an assigned route.
- The bridge selects a reachable configured exit from the route's current terminal node; it never invents nodes or path geometry.
- Added `continueCompletedRoutes(traffic)` for explicit use and a `continueRoutes` option in `configureAutoRouting` (enabled by default when auto-routing is configured).
- Continuation only occurs when the final path is complete and a connected configured destination is reachable. If no continuation exists, the vehicle remains on its existing completed route.

## Verification
Run `node --test tests/*.test.mjs` from this package for focused tests. Passing focused tests do not establish full-repository or browser gameplay correctness.

## Important boundary
The bridge still requires real scene-space road paths, connected nodes, and configured entry/exit nodes. This ZIP does not register actual Kano junction geometry. Full repository tests and live browser gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
