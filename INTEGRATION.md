# Integration steps

Copy `js/KanoSystemicGameplayBridge.js` into the repository's `js/` directory. It imports four modules already present in the project.

In `main.js`, add:

```js
import { KanoSystemicGameplayBridge } from './KanoSystemicGameplayBridge.js';
```

After `game` is created, initialize once:

```js
let systemicGameplay = null;
try {
  systemicGameplay = new KanoSystemicGameplayBridge({ game, root: container });
} catch (error) {
  console.warn('[Kano Life] systemic gameplay bridge unavailable', error);
}
```

Inside the existing frame loop, after `game.tick(dt)`, add:

```js
systemicGameplay?.update(dt, {
  state: game?.s,
  // Supply these from the game's authoritative clock when available:
  // day: gameClock.day,
  // minuteOfDay: gameClock.minuteOfDay,
});
```

Inside the existing `pagehide` cleanup, add:

```js
systemicGameplay?.dispose();
```

## Connect real gameplay carefully
- Market day multiplier getters are exposed as `getFareMultiplier()` and `getTrafficMultiplier()`. Apply them only at the authoritative fare and traffic calculations, once each.
- Convoy acceptance creates simulation participant records but does not spawn meshes. Connect `convoy_state` events to the existing traffic/vehicle director before representing the other drivers visually.
- Call `reportConvoyIncident()` from the existing collision system when a convoy collision/near miss actually occurs.
- Workshop booking must use the current wallet's payment confirmation; do not call `confirmWorkshopPayment()` before the wallet confirms the charge.
- Vehicle lifecycle state is available from `getVehicle()`. Driving distance, impacts and repairs must be routed from actual game events; this bridge intentionally does not guess the game's distance units.

## Validation status
The bridge is syntax-checked as an ES module. A full Vite build and browser regression test have not been run here. Keep a rollback copy of `main.js` before applying the integration.
