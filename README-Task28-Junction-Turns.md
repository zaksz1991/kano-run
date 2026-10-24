# Kano Life — Task 28: Junction Turn-Path Foundation

## Included
- `js/KanoJunctionTurnRules.js`: deterministic cubic-Bezier path generation, tangent/yaw data, and named Kano junction labels.
- `js/KanoJunctionTurnRuntime.js`: optional event bridge that places a vehicle Object3D along a left/straight/right turn path when the traffic loop emits `kano:traffic-turn`.
- `tests/KanoJunctionTurnRules.test.mjs`: isolated math/catalog regression tests.
- `integration/IMPORT-ORDER.txt`: GUI installation and required traffic-loop event contract.

## Why this is scoped as a foundation
The Claude activation ZIP and current traffic-loop source were not attached in this conversation. Without those files, safely editing the real traffic update function or assigning scene coordinates to actual intersections is not possible. This package avoids modifying protected engine files or guessing private APIs. Importing the runtime alone will not cause existing traffic to turn: the traffic loop must emit the documented event.

The junction list uses known Kano place names as labels. It does not invent latitude/longitude or claim the locations are precisely mapped to the 3D road network.

## Installation
Extract the ZIP with File Explorer. Copy the two `.js` files into `js/` and the `.mjs` test into `tests/` (not `js/`). Follow `integration/IMPORT-ORDER.txt` and preserve all existing imports in the current activation bridge.

## Verification
Focused tests cover junction lookup, path endpoints, left/right curvature, invalid input, progress clamping and normalized tangents. Full repository tests, actual game traffic integration, browser rendering and phone performance were not verified here.
