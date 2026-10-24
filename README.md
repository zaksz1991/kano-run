# Kano Life — Fuel Queue Director

An additive, host-agnostic module for realistic station queues in Kano Life.

## Included
- FIFO vehicle queue with queue positions and rough wait estimates.
- Configurable number of pumps, service speed, station stock, and fuel price.
- Per-vehicle fuel requests, partial fills when stock is low, and service timing.
- Queue exit and duplicate-entry protection.
- Payment callback before a completed receipt is marked paid; the module does not mutate the player wallet or vehicle fuel itself.
- Focused automated tests.

## Important integration boundary
This ZIP is not wired into the live Kano Run UI, station collision/parking logic, wallet, vehicle fuel meter, or existing refuelling animation. The host game must call `joinQueue`, `startNext`, `tick`, and `settle` from its actual station lifecycle and apply fuel to the vehicle only after successful settlement. Do not replace existing protected files to install this module.

## Test
Run the included `tests/KanoFuelQueueDirector.test.mjs` using the project's supported Node test setup. The included tests were also run standalone in this build environment.
