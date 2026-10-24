# Kano Run — Task 31: Junction Approach Coordinator

## Purpose
Tasks 28–30 established turn paths, animation, and validated dispatch, but the game's traffic loop still needs an explicit hand-off. Task 31 provides a registration/trigger coordinator so the traffic controller can dispatch a turn once a vehicle enters a configurable radius around a real junction.

## Files
- `js/KanoJunctionApproachCoordinator.js` — explicit route registration, trigger-distance check, dispatch-once protection, cancellation and audit.
- `tests/KanoJunctionApproachCoordinator.test.mjs` — focused tests.
- `integration/IMPORT-ORDER.txt` — wiring requirements.

## Installation
Copy the JavaScript file into the existing `js` folder. Keep the Task 29 and Task 30 modules. Add the import shown in `integration/IMPORT-ORDER.txt` after the Task 30 dispatch helper and before the game entry point. Do not replace the project's activation bridge wholesale.

## Required live connection
The actual traffic controller must call `registerKanoJunctionApproach` with coordinates from the real scene, then call `updateKanoJunctionApproach(vehicle)` during its normal update loop. This package deliberately does not guess road coordinates or intercept protected traffic files. Until that hand-off is made, vehicles will not turn automatically.

## Verification limits
Focused tests exercise registration and trigger validation only. Full repository tests, browser boot, actual junction turns, and phone performance have not been verified. No protected engine files or `public/` assets are included.
