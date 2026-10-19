# Integration guide — Road Physics & Collision Response

## Important
This is an additive simulation module. It does not replace the game's current physics engine, Three.js scene, collision detection, wallet, or vehicle controller. Use it to calculate handling and consequences, then apply its returned values through existing systems.

## 1. Import and create

```js
import { KanoRoadPhysicsDirector } from './js/KanoRoadPhysicsDirector.js';

const roadPhysics = new KanoRoadPhysicsDirector({
  emit: (eventName, payload) => {
    // Route to your existing HUD, sound, haptics, or event bus.
    console.debug('[RoadPhysics]', eventName, payload);
  },
});

roadPhysics.registerVehicle('player-keke', 'keke');
```

Register AI vehicles too if you want vehicle-specific handling or collision records. Use stable IDs and unregister vehicles when they are removed from the scene.

## 2. Evaluate grip and braking each physics tick

```js
const handling = roadPhysics.evaluateRoad('player-keke', {
  speed: playerSpeed,
  dt,
  road: { wetness: rainIntensity, dust: dustIntensity, surface: isPotholeRoad ? 'rough' : 'asphalt' },
  controls: { brake: brakeInput, throttle: throttleInput, steering: steeringInput },
});

// Adapt these to your existing controller; don't create a second movement system.
// Example: cap desired speed and use handling.brakingDeceleration in your brake model.
```

`recommendedSpeed`, `brakingDistance`, `grip`, and `slide` are guidance values. Your current controller should remain authoritative for actual velocity and position.

## 3. Pothole impacts and body animation

Call `hitPothole()` only when the current collision/road system confirms the player crossed a pothole. Apply `speedPenalty` through the current speed controller, animate body bounce using `shake`, and use `updateSuspension()` each tick to obtain `offset` and `bodyPitch` for the rendered vehicle body. Do not move the whole world or chassis twice.

## 4. Collision consequences

When existing collision detection fires, call `resolveCollision()` with relative speed, angle, obstacle type, and approximate other mass. Apply returned `speedLoss` and damage to your existing systems. For pedestrian collisions, pause or stop the vehicle and trigger the game's appropriate safety response; `injuryRisk` is a gameplay signal, not a medical prediction.

## 5. Repairs and wallet

`getRepairEstimate()` returns a configurable in-game estimate, not a real-world quote. Connect it to the game's single authoritative wallet. `repair(id, amount)` updates this module's vehicle condition only; deduct currency in your wallet layer and ensure the player can afford the payment before calling it.

## 6. Persistence

Use `getSnapshot()` and `restoreSnapshot()` with your existing save system. Avoid a second independent save slot if the game already owns vehicle state; merge only the fields your existing save schema does not already store.

## 7. Mobile performance

The module is lightweight and has no rendering dependencies. Call it from the existing fixed-step physics loop, clamp `dt`, and avoid registering transient particles or visual effects as vehicles.
