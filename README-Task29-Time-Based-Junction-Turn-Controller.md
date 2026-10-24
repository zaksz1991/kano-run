# Kano Life — Task 29: Time-Based Junction Turn Controller

## What changed
- Replaces Task 28's one-event/one-position runtime with a time-based animation controller.
- Uses smoothstep easing and tangent-based vehicle yaw while moving along the cubic Bézier turn path.
- Supports cancellation and safely replaces a vehicle's prior active turn.
- Clamps duration to 250–10,000 ms and rejects malformed vehicle/end-point input.
- Keeps the named Kano junction catalogue as labels only; no fake scene coordinates are supplied.

## Installation
Follow `integration/IMPORT-ORDER.txt`. Keep the existing Claude activation bridge and its other feature imports intact. Put the `.mjs` regression test in `tests/`, not `js/`.

## Verification
Focused tests cover path endpoints, distinct left/right paths, invalid input, normalized tangent, duration limits and easing. Full repository `npm test`, browser rendering, actual traffic-loop integration, mapped road locations and phone performance have not been verified. Existing traffic will not turn until its movement loop dispatches the documented start event with correct scene-space endpoints.
