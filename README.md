# Kano Run — AI Traffic Junction Turn (Next 11)

## New in Next 11
- Added a mobile-instancing bridge for explicitly routed traffic vehicles.
- After the renderer's normal traffic placement, routed fallback instances receive the road-network sampled XYZ position and heading, including elevation on ramps or overpasses.
- Ordinary, non-routed traffic instances are left untouched by this adapter.
- Added focused tests for elevated mobile instance transforms and for preserving ordinary traffic instances.

## Verification
Run `node --test tests/*.test.mjs` from this package to execute the focused test suite. These tests do not establish full-repository or browser gameplay correctness.

## Important boundary
This adapter only affects traffic vehicles explicitly assigned to a registered road path. Real scene-space paths still must be registered and routes assigned; the package does not invent junction coordinates or automatically route all spawned traffic. Full repository tests and live browser gameplay remain unverified.

## Additive scope
This ZIP contains the navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
