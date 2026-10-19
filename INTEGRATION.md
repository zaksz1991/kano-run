# Integration guide — Workshop & Recovery

## Files
- `js/KanoWorkshopRecoveryDirector.js` — complete ES module.

## Important boundary
This module does **not** deduct currency, move 3D meshes, spawn workshop buildings, or tow a vehicle. The host game remains authoritative for wallet transactions, vehicle physics, world placement, and animations.

## 1. Create the director

```js
import { KanoWorkshopRecoveryDirector } from './js/KanoWorkshopRecoveryDirector.js';

const workshopRecovery = new KanoWorkshopRecoveryDirector({
  onEvent: ({ type, detail }) => {
    // Connect to your existing HUD, sound, scene and notification systems.
    // Do not charge money in this callback without a confirmed player action.
  },
});
```

## 2. Quote and book a repair

```js
const quote = workshopRecovery.quoteRepair({
  workshopId: 'kano-central',
  vehicleId: playerVehicleId,
  component: 'tyre',
  severity: 0.65,
});

// Display quote.totalCost and quote.durationMinutes in your repair UI.
// On explicit player confirmation, charge using the existing authoritative wallet.
// Only after that wallet transaction succeeds:
const booking = workshopRecovery.bookRepair(quote, { paymentConfirmed: true, paymentReference: walletTransactionId });
```

If you prefer a two-step payment flow, call `bookRepair(quote)` and after the wallet confirms success call `confirmRepairPayment(booking.job.id, walletTransactionId)`. Do not call the confirmation method before the wallet succeeds.

## 3. Advance time and collect repaired vehicle

Call `advanceWorkshopTime(elapsedInGameMinutes)` when game time advances. When the job becomes `ready_for_pickup`, show a notification. After the player collects the vehicle, call `completeRepair(jobId)`, then apply `result.qualityGain` to the matching component in your existing vehicle lifecycle model. The returned maintenance record is for history; it does not charge the wallet.

## 4. Recovery

Call `requestRecovery({ vehicleId, location, severity, distanceKm, timeOfDay })` after the player chooses recovery. Show the fee and ETA and request confirmation. Charge through the existing wallet, then call `confirmRecoveryPayment(call.id, walletTransactionId)`. Advance `advanceRecoveryTime(elapsedInGameMinutes)` as the game clock advances. On `recovery_arrived`, animate your existing tow/recovery vehicle and move the broken vehicle using your existing scene/physics implementation.

## 5. Workshop placement

The module registers four logical workshop locations (`kano-central`, `sabon-gari`, `kumbotso`, `naibawa`). These are data records, not 3D buildings. Place them at appropriate route/world coordinates in your existing world builder. Additional locations can be registered with `registerWorkshop`.

## 6. Browser storage

By default, state uses `localStorage` under `kano-life-workshop-recovery-v1`. Supply a different `storageKey` to isolate a test save. If the game already has a unified save system, set `autoLoad: false`, then use `exportState`/`importState` to connect it.
