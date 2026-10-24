# Integration notes

1. Import `KanoFuelQueueDirector` from `js/KanoFuelQueueDirector.js` in the existing station controller.
2. Create one director per station, with pump count, stock, and price taken from the existing station configuration.
3. When a vehicle enters the station's queue zone, call `joinQueue` once for its stable vehicle ID. Render the returned queue position and wait estimate using the existing UI.
4. When a pump becomes free, call `startNext`; play the existing pump/refuelling animation for that service.
5. Advance the service clock from the game's existing update loop with bounded elapsed simulation minutes.
6. On completion, call `settle(vehicleId, payCallback)`. The callback must use the real wallet/payment API and return `true` or `{ ok: true }` only after payment succeeds. Add fuel to the vehicle only after settlement returns `{ ok: true }`.
7. Connect stock delivery, station opening hours, queue positioning, and pump collision/parking to existing systems rather than creating parallel UI or vehicle state.

The current repository source was not available during this additive module build, so no live integration points or filenames beyond this new module are assumed. Full project regression tests remain required after integration.
