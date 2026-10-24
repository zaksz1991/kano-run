# Kano Life — Passenger Fare Haggling (additive module)

## Included
- Distance/route/demand-aware fare suggestions with bounded pricing.
- Passenger personalities (trader, student, worker, elder, family, visitor, regular, hurried).
- Hausa dialogue strings and a small negotiation state machine.
- Driver counteroffers, accepting the passenger's offer, refusal, and negotiation history.
- A strict settlement boundary: this module never changes the game wallet. `settle()` only marks a fare paid after the host wallet callback explicitly returns `true` or `{ ok: true }`.

## Host integration contract
Import `KanoFareHagglingDirector` from `js/KanoFareHagglingDirector.js`. Instantiate it once in the existing game lifecycle. When a passenger is selected for pickup, call `startNegotiation()` with a stable passenger ID, route endpoints, distance and personality. Render the returned dialogue and offer using the existing mobile UI; bind the accept/counter/refuse buttons to the corresponding methods. After a trip completes, call `settle(id, commitFare)` and have `commitFare` use the game's **existing authoritative wallet**. Do not also add the amount separately in another handler. If wallet commit fails, keep the session unpaid and display an error.

Example transaction boundary:

```js
const result = await fares.settle(passengerId, async ({ amount, source }) => {
  // Call the existing game's wallet transaction here; do not implement a second wallet.
  return existingWalletCommit(amount, source);
});
```

The names `existingWalletCommit` and `fares` above are illustrative placeholders, not existing project APIs. Do not paste this example into the game without mapping it to the real wallet and UI methods in the latest main branch.

## Test
The included Node test file covers fare bounds, negotiation setup, wallet rejection, confirmed settlement, refusal and invalid actions. It is standalone and has not been added to the game's existing test suite.

## Integration status
This package is an additive, tested module. It is **not yet wired into the live game**, because the current full repository ZIP / current `main` source was not available in the working files. Do not treat the gameplay UI as integrated until the module is connected to the actual passenger pickup, trip-completion and wallet flows and the complete regression suite passes.
