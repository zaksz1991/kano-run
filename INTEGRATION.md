# Integration guide — Dynamic Passenger & Street-Life AI

This is an **additive standalone module**. It is not wired into the live Kano Life deployment. Integrate it with the game's existing passenger spawner, trip events, UI and world/traffic systems.

## 1. Create the director

```js
import { KanoStreetLifeDirector } from './js/KanoStreetLifeDirector.js';

const streetLife = new KanoStreetLifeDirector({
  onEvent: ({ type, detail }) => {
    // Route these events to your existing HUD, animation and sound systems.
    // Examples: passenger_spawned, passenger_boarded, trip_completed,
    // street_event_started, complaint_filed, word_of_mouth.
    console.debug('[Kano Life]', type, detail);
  },
});
```

## 2. Connect the game loop

Call `streetLife.tick(deltaSeconds, { dayPhase })` from the existing simulation loop. Do not create a second animation loop. Use `getWorldModifiers()` to adjust existing traffic, pedestrian, road-risk and demand systems; it does not spawn 3D models by itself.

## 3. Passenger pickup flow

1. Call `createPassenger({ personality, destination })` when your existing world spawner creates a passenger. Avoid double-spawning by choosing one system as authoritative.
2. Use `getQueue()` to populate a passenger list or pickup interaction.
3. Call `getFareQuote(passenger.id, { baseFare, distanceFactor, rain, dayPhase })` to show fare guidance.
4. Call `negotiateFare(passenger.id, offeredFare, context)`. Only proceed if `accepted` is true.
5. Play the existing boarding animation, then call `boardPassenger(passenger.id)`.
6. Send collision, hard-braking, delay and distance metrics to `updateTrip()`.
7. On arrival, play the existing drop-off animation and call `completeTrip({ fairFare, polite, helpedPassenger })`.

## 4. Market, school, rain and celebration events

`spawnStreetEvent({ type })` supports `market_surge`, `school_closing`, `rain_shower`, `roadside_trade`, `event_convoy`, and `quiet_period`. The returned modifiers are intended for existing world systems. Do not use them to overwrite your own traffic composition target (about 40% keke, 30% motorcycles, 30% cars); apply them as density/risk multipliers while preserving that ratio where feasible.

## 5. Important integration notes

- This module uses `localStorage` when available and emits `storage_error` if saving fails.
- It does not replace your career wallet, passenger relationship module, route logic, physics, rendering, or traffic manager.
- Avoid duplicate persistence keys and select one authoritative source for cash and trip completion.
- The passenger list and event outputs are plain data; your current Three.js scene must render/animate the characters and props.
- If passenger relationships are already managed by `KanoPassengerRelationshipDirector`, connect its trust/loyalty results to this module rather than keeping conflicting duplicate relationship values.
- Module syntax is ES module syntax; your Vite project should already support this.
