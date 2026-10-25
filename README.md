# Kano Run — AI Traffic Junction Turn (Next 12)

## New in Next 12
- Added opt-in automatic route assignment for newly spawned and existing traffic vehicles, using only registered road-network nodes and paths.
- Added `configureAutoRouting({ enabled, entryNodes, exitNodes, seed })`; the configuration is rejected if nodes are missing or no entry-to-exit route exists.
- Added `assignUnroutedTraffic(traffic)` for explicit batch assignment and exposed auto-routing configuration in the network audit.
- Automatic assignment remains disabled until the caller supplies real, registered entry and exit nodes.

## Verification
Run `node --test tests/*.test.mjs` from this package for focused tests. These do not establish full-repository or browser gameplay correctness.

## Important boundary
The bridge does not invent road coordinates or register real Kano junction paths. Automatic assignment only works after valid scene-space paths and connected nodes have been registered and auto-routing has been configured. Full repository tests and live browser gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
