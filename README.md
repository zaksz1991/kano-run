# Kano Run — AI Traffic Junction Turn (Next 10)

## New in Next 10
- Added an optional `Renderer3D.syncTraffic` bridge alongside the existing `Game.moveTraffic` bridge.
- After the normal renderer placement, explicitly routed GLB actors now receive the same sampled road-path XYZ position and yaw used by the road-network runtime.
- Added a focused integration test for elevated road paths, checking actor X/Y/Z and heading against the runtime's sampled pose.
- Added `rendererInstalled` to the bridge audit so the caller can see whether the renderer hook was installed.

## Verification
`node --test tests/*.test.mjs` is the focused test suite for this package. Its results do not establish full-repository or browser gameplay correctness.

## Important boundary
The bridge remains opt-in for traffic routes: real scene-space paths must be registered and assigned. This update aligns GLB actor poses with registered route geometry, but does not invent road coordinates, auto-route every vehicle, or independently verify the full game. The mobile instanced renderer continues to use the existing traffic-turn adapter; this new actor-pose hook is for `trafficActors` GLB actors.

## Additive scope
Only the navigation/traffic add-on modules and focused tests in this package are included. Protected game/rendering files and assets are not replaced.
