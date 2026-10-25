# Kano Run — AI Traffic Junction Turn (Next 14)

## New in Next 14
- Hardened automatic route assignment so it does not take over every ordinary traffic vehicle by default.
- Vehicles must carry explicit `kanoRoadEntryNode` and `kanoRoadExitNode` tags, typically set by a traffic-spawn integration, before automatic assignment will route them.
- Added optional `kanoRoadInitialProgress` (0–1) for spawners that can accurately place a vehicle along its registered road path. The value is consumed when assignment succeeds.
- `assignAllUnrouted: true` remains available as an explicit opt-in for controlled tests or scenes where every traffic vehicle is already aligned with a registered path.
- Added a regression test confirming untagged traffic remains untouched.

## Verification
Run `node --test tests/*.test.mjs` from this package for focused tests. Passing focused tests do not establish full-repository or browser gameplay correctness.

## Important boundary
This add-on still requires real scene-space road paths, connected nodes, and a spawn integration that tags vehicles with the correct entry and exit nodes. It does not register actual Kano junction geometry or prove live gameplay turns. Full repository tests and browser gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
