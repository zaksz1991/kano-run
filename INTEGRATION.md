# Integration Guide — Vehicle Lifecycle

This package is additive and is not connected to the live game. Integrate it in small steps.

## 1. Import and initialize

```js
import { KanoVehicleLifecycleDirector } from './js/KanoVehicleLifecycleDirector.js';

const vehicleLifecycle = new KanoVehicleLifecycleDirector({
  callbacks: {
    onEvent(event) {
      // Connect to existing HUD/audio/mission systems as needed.
    },
    onOverheating(event) {
      // Show a warning; do not move the 3D vehicle here.
    },
    onBreakdown(event) {
      // Tell the existing driving controller to safely restrict driving.
    }
  }
});
```

## 2. Register the player's vehicle

Create one record when a vehicle is acquired or a new career begins:

```js
vehicleLifecycle.createVehicle({
  id: 'player-keke',
  type: 'keke',
  name: 'Adaidaita Sahu',
  odometerKm: 0
});
```

Use a stable ID and avoid creating a duplicate record on every scene reload. If a record already exists, call `getVehicle(id)` first.

## 3. Update from the existing game loop

Call `recordDriving()` with distance travelled during that frame or trip, not total odometer distance. Keep delta values bounded and do not update from multiple loops.

```js
vehicleLifecycle.recordDriving({
  vehicleId: 'player-keke',
  distanceKm: frameDistanceKm,
  speedKmh: currentSpeedKmh,
  harshBraking: hardBrakeThisFrame,
  sharpTurning: sharpTurnThisFrame,
  roughRoad: onRoughRoad,
  heavyLoad: passengerCount >= 3,
  deltaSeconds: deltaSeconds,
  ambientC: worldTemperatureC
});
```

Call `recordImpact()` once per impact event, not every frame while two collision boxes overlap. Your current physics engine remains responsible for movement and collision detection.

## 4. Repair flow and wallet safety

Use `calculateRepair()` to show the quote. Have the existing authoritative wallet validate and deduct the amount. Only after that succeeds, call `repair({ ..., paymentConfirmed: true })`. This module deliberately does not deduct cash or create another wallet.

```js
const quote = vehicleLifecycle.calculateRepair('player-keke', {
  parts: ['engine', 'tyres', 'brakes'],
  workshop: true,
  includeService: true
});
// Existing wallet confirms and deducts quote.total here.
vehicleLifecycle.repair({
  vehicleId: 'player-keke',
  parts: ['engine', 'tyres', 'brakes'],
  workshop: true,
  includeService: true,
  paymentConfirmed: true
});
```

The caller should prevent duplicate deductions and repeated repair actions while a payment is pending.

## 5. Hire-purchase

`createHirePurchase()` checks the configured deposit amount against `depositPaid`. The caller must deduct the deposit through the authoritative wallet first. Each `makeInstallment()` call requires `paymentConfirmed: true` after the wallet confirms payment. Call `assessOverduePayments({ at: gameTime })` from the game's in-world calendar, not from every animation frame.

The example defaults are fictional balancing values. Tune deposit, total price, installment amount, and intervals to your economy. The module tracks a contract; it does not implement legal contracts, banking, or actual payments.

## 6. UI hooks

Use `getMaintenanceAdvice(id)` for the vehicle-condition panel and `calculateRepair(id)` for a mechanic quote. Render temperature, wear, warnings, and workshop UI through your existing interface.

## 7. Important integration notes

- This module is not yet deployed or integrated into `kano-run.vercel.app`.
- It does not create 3D smoke, dashboard gauges, breakdown animations, or mechanic shops; those require scene/UI integration.
- It does not own the wallet. Never treat `paymentConfirmed: true` as payment processing; it is an explicit signal from your trusted game flow.
- If `autoSave` is enabled, browser `localStorage` is used when available. For server-backed saves, disable auto-save and connect `exportState()`/`importState()` to your existing save system.
- Hire-purchase is a local gameplay simulation; validate all state if the game becomes multiplayer or server-authoritative.
