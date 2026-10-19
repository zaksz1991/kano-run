# Integration guide

This module is deliberately engine-agnostic. It does not spawn 3D objects, change physics, or replace the current route/mission system. Connect its events to the game's existing UI, traffic, audio, and life-simulation systems.

## 1. Import and construct

```js
import { KanoSystemicEventDirector, KANO_EVENT_COPY } from './KanoSystemicEventDirector.js';

const eventDirector = new KanoSystemicEventDirector({
  onEvent(event, state) {
    const copy = KANO_EVENT_COPY[event.id];
    if (copy) showGameNotification(copy.title, copy.message, copy.action);
    playEventSound?.(event.id);
    // Trigger existing systems here; do not create a second traffic or physics loop.
  },
});
```

Replace `showGameNotification` and `playEventSound` with functions already present in the project. Remove optional chaining if your build target does not support it.

## 2. Update once per frame

Inside the existing animation loop, call the director exactly once:

```js
eventDirector.update(deltaSeconds, {
  speed: playerSpeed,
  fuel: driverState.fuel,
  money: driverState.money,
  hunger: driverState.hunger,
  fatigue: driverState.fatigue,
  distance: routeDistance,
  routeId: activeRouteId,
  shiftActive: gameState === 'driving',
});
```

Use the actual variable names from the project. Do not add a second `requestAnimationFrame` loop just for this module.

## 3. Event handlers

Use `event.id` to connect existing systems:
- `passenger_demand`: ask the current passenger/pickup system to offer a roadside pickup.
- `fuel_reminder`: show a notification and optionally play the existing warning sound.
- `karota_checkpoint`: activate an existing checkpoint if one is available; otherwise show a warning only.
- `road_hazard`: ask the road-hazard system to place a hazard within the current forward scene window.
- `market_congestion`: raise density in the existing traffic/crowd spawner temporarily.
- `fare_negotiation`: open the existing fare interaction only while safely stopped.
- `rest_opportunity`: show a meal/rest prompt using existing driver-life state.

Do not treat an event notification as proof that a physical object was spawned. Connect to existing world systems for actual scene changes.

## 4. Test controls

`eventDirector.trigger('fuel_reminder', { debug: true })` emits an event immediately for UI testing. `getSnapshot()` provides basic diagnostics. `reset()` clears elapsed time and cooldowns.

## Safety and integration notes
- Scheduler callbacks are isolated so UI/audio errors do not stop the scheduler.
- Event timing uses simulation seconds and pauses naturally if `update()` is not called.
- Event names and UI copy are suggestions; align them with your current game terminology.
- Test event frequency and accessibility on mobile before shipping.
