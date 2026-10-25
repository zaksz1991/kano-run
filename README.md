# Kano Run — AI Traffic Junction Turn (Next 16)

## New in Next 16
- Automatic traffic assignment checks the vehicle's current scene-space X/Z position against the requested starting pose.
- Vehicles too far from that authored path are left on their existing trajectory instead of being snapped/teleported to the path.
- The default spawn alignment tolerance is 8 scene units and can be set through `spawnAlignmentTolerance` when creating the bridge (allowed range: 0–100).
- The audit now reports the active spawn alignment tolerance.
- Manual `assignVehicleRoute` remains an explicit caller-directed operation; this spawn guard applies to automatic assignment.

## Verification
Run `node --test tests/*.test.mjs` from this package. Focused tests do not establish full-repository or browser gameplay correctness.

## Important boundary
This add-on still requires real scene-space road paths, connected nodes, and a spawn integration that tags vehicles with correct entry and exit nodes. It does not register actual Kano junction geometry or prove live gameplay turns. Full repository tests and browser gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
