# Kano Run — Task 30: Turn Dispatch Integration Helper

## Purpose
Task 29 provides a turn animation runtime, but the existing traffic controller must tell it when a vehicle reaches a junction. Task 30 adds a small validated dispatch helper to prevent malformed events and inconsistent durations.

## Included
- `js/KanoTrafficTurnDispatch.js` — validated start/cancel event helpers and runtime audit.
- `tests/KanoTrafficTurnDispatch.test.mjs` — focused regression tests.
- `integration/IMPORT-ORDER.txt` — activation instructions.

## Install with File Explorer
1. Copy `js/KanoTrafficTurnDispatch.js` into your project's existing `js` folder.
2. In the existing activation bridge, add `import './KanoTrafficTurnDispatch.js';` after `import './KanoJunctionTurnRuntime.js';`.
3. Preserve all other imports and features. Do not replace the bridge with this package.

## Required live integration
The real traffic loop must call `dispatchKanoTrafficTurn({ vehicle, start, end, turn, junction, durationMs })` once when a vehicle enters a junction. `vehicle` must be the scene object whose position the renderer displays. `start` and `end` must be actual scene-space coordinates. The helper does not infer coordinates, locate a vehicle in a lane, or patch the traffic loop automatically. Therefore this ZIP alone does not make existing traffic turn.

## Verification
Run the included focused test with your existing Node test setup. This package's tests are isolated and do not constitute a full repository test. Browser rendering and phone performance have not been verified. No protected engine files or `public/` assets are included or changed.
