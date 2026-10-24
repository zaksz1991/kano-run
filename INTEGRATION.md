# Integration notes

The facade provides one entry point:

- `updateWorld({ weekday, time, location, demand })`
- `quotePassengerFare(input)` / `startPassengerNegotiation(input)`
- `fares.counterOffer(id, amount)`, `fares.acceptPassengerOffer(id)`, `fares.refusePassenger(id)`
- `settlePassengerFare(id, walletCommit)`
- `joinFuelQueue(vehicle)`, `leaveFuelQueue(vehicleId)`, `startFuelService()`, `tickFuelStation(minutes)`, `settleFuel(vehicleId, walletPayment)`
- `onChange(listener)` and `snapshot()`

All wallet callbacks must use the game's existing authoritative wallet. `settlePassengerFare` and `settleFuel` treat only `true` or `{ ok: true }` as successful. The facade intentionally does not modify protected files, game state, HUD, vehicle fuel, animation, or collision/parking logic itself. It is an integration-ready service layer, not a claim that the live game's UI has been changed.
