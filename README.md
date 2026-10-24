# Kano Life — Simulation Systems Bundle

This bundle consolidates the passenger fare negotiation, in-game daily rhythm, and fuel queue directors behind one facade so a host game can coordinate their state.

## Files
- `js/KanoLifeSimulationSystems.js` — shared facade and observable event surface.
- `js/KanoFareHagglingDirector.js` — fare quotes, counteroffers, Hausa dialogue, and wallet-safe settlement.
- `js/KanoDailyRhythmDirector.js` — configurable market/prayer/Jumu’ah rhythm driven only by the in-game weekday/time supplied by the host.
- `js/KanoFuelQueueDirector.js` — FIFO fuel queue, pumps, inventory, service timing, and payment-confirmed receipts.
- `tests/` — focused tests for the facade and each component.

## Host integration boundary
The facade is a cohesive simulation layer, but it is **not wired into the live Kano Run game** because this bundle does not include the current game's source files. The host must call `updateWorld()` with the in-game clock, render the returned state/events, connect passenger pickup/trip completion to the fare API, and connect station queue position/service completion to actual vehicle movement, wallet, and fuel-meter updates. Do not mark fuel as added until payment succeeds. Do not replace protected game files to install this bundle.

## Test command
Use the project's existing test setup. These tests were run in isolation with Node's test runner; they do not constitute a full Kano Run regression run.
