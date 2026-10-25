# Kano Run — AI Traffic Junction Turn (Next 17)

## Critical runtime correction
- Road-route progress now advances using each routed vehicle's travel speed and frame delta, rather than relying exclusively on Z/depth movement.
- This fixes a concrete stall condition: on a curved or lateral road segment, a vehicle could move along X while Z barely changed, causing the depth-based route progress to stop.
- The bridge marks a route as advanced at most once per game frame, even if the existing movement method writes depth more than once.
- Frames without a depth write still advance the road pose by the frame's travel distance.
- Existing direct-depth runtime calls retain their compatibility behavior for callers/tests that do not provide a frame delta.

## Verification
Run `node --test tests/*.test.mjs` from this package. The focused tests include a regression test for a lateral route whose Z coordinate stays constant while the vehicle must continue moving along X.

## Important boundary
This repairs a confirmed route-runtime progression defect in the add-on. It does not supply surveyed Kano road coordinates, register live junction geometry, or prove the current deployed application loads this add-on. Full repository tests and browser/mobile gameplay remain unverified.

## Additive scope
This ZIP contains navigation/traffic add-on modules and focused tests only. It does not replace protected game/rendering files or anything under `public/`.
