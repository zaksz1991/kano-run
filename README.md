# Kano Run — AI Traffic Junction Turn (Next 15)

## New in Next 15
- Automatic routing now validates the physical scene-space endpoints of registered paths before it can be enabled.
- If paths share a graph node but their endpoints are farther apart than the configured connection tolerance, activation is rejected with `road-path-connections-invalid`.
- The error includes a bounded list of endpoint mismatch details to help diagnose incorrect junction anchors.
- Existing safe defaults remain: routing is disabled until explicitly configured, and untagged traffic is not taken over unless `assignAllUnrouted` is enabled.

## Verification
Run `node --test tests/*.test.mjs` from this package for focused tests. Passing focused tests do not establish full-repository or browser gameplay correctness.

## Important boundary
This add-on still requires real scene-space road paths, connected nodes, and a spawn integration that tags vehicles with correct entry and exit nodes. It does not register actual Kano junction geometry or prove live gameplay turns. Full repository tests and browser gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
