# Integration Guide — Market Day + Driver Society + Ownership

These modules are additive ES modules. They are **not automatically connected** to the deployed Kano Life game.

## 1. Import and initialize

```js
import { KanoMarketDayDirector } from './js/KanoMarketDayDirector.js';
import { KanoDriverSociety } from './js/KanoDriverSociety.js';
import { KanoVehicleOwnership } from './js/KanoVehicleOwnership.js';

const marketDirector = new KanoMarketDayDirector({
  onEvent: event => {
    // Connect passenger_demand_pulse to your EXISTING passenger spawn/pickup system.
    // Do not create a second traffic or animation loop here.
    gameEvents?.emit?.(event.type, event);
  }
});
const driverSociety = new KanoDriverSociety();
const ownership = new KanoVehicleOwnership({
  onEvent: event => gameEvents?.emit?.(event.type, event)
});
```

The optional `gameEvents` symbol above is a placeholder for your existing event bus; replace it with the actual API in your project.

## 2. Update once per existing frame

```js
// In the existing animation/update loop, not a new requestAnimationFrame loop:
marketDirector.update(deltaSeconds, {
  day: gameState.day,
  minuteOfDay: gameState.minuteOfDay
});
```

Use `marketDirector.snapshot()` to update your existing HUD. Use `getFareMultiplier()` only where the current fare calculation is made, and clamp the final fare using your existing rules.

## 3. Driver NPCs

```js
const npc = driverSociety.createDriver({ id: 'npc-driver-001', trait: 'professional' });
const decisions = driverSociety.behaviourFor(npc.id, { crowded: true, rushing: false });
// Pass decisions to the existing traffic AI. These values do not move models by themselves.
driverSociety.recordOutcome(npc.id, { trip: true, cashDelta: 1800, reputationDelta: 1, fatigueDelta: 5 });
driverSociety.save();
```

Traits are behaviour inputs, not assumptions based on a character's appearance, education, or background.

## 4. Ownership contracts

```js
const contract = ownership.createContract({
  vehicleId: 'keke-001', driverId: npc.id, ownerId: 'owner-001',
  type: 'hire_purchase', purchasePrice: 900000, deposit: 150000,
  paymentAmount: 12000, period: 'weekly'
});
ownership.recordEarnings(contract.id, 18000, 5000);
ownership.makePayment(contract.id, 12000, gameState.day);
```

All prices are example tuning values, not claims about current market prices. Connect payment results to the existing wallet/save system to avoid maintaining two competing balances.

For a shared vehicle, use `type: 'shared_shift'` and `setSharedShifts()` to assign driver IDs and time ranges.

## 5. Integration safeguards

- Keep the existing Three.js renderer, physics, traffic system, model manager, and animation loop authoritative.
- Use the market director as a demand modifier and event source; don't spawn duplicate traffic.
- The society module supplies data/decision hints; existing AI must apply them to actual models.
- The ownership module keeps its own contract records. Before production, connect it to the canonical player save/profile store and add schema migration/versioning.
- Add UI, localisation, save migration, and balancing after wiring callbacks.
- Verify that the game's local-day numbering matches this module's day convention before relying on market-day schedules.
