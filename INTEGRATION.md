# Integration Guide — Traffic Intelligence

This is an additive, standalone JavaScript module. It does not import Three.js and does not replace the game's existing physics, rendering, spawning, or collision detection.

## 1. Import and create

```js
import { KanoTrafficIntelligenceDirector } from './js/KanoTrafficIntelligenceDirector.js';

const trafficAI = new KanoTrafficIntelligenceDirector({
  laneCount: 3,
  targetMix: { keke: 0.4, motorcycle: 0.3, car: 0.3 },
  onEvent: ({ type, detail }) => {
    // Connect selected events to your existing UI/audio/economy systems.
  },
});
```

## 2. Spawn traffic

```js
trafficAI.spawnWave(8, { startDistance: 30, spacing: 14 });
const trafficVehicle = trafficAI.spawnVehicle({ type: 'keke', lane: 1 });
```

The returned objects are simulation data only. Use your existing model catalog/GLTF loader to create the corresponding 3D models and maintain a mapping from the returned `id` to each rendered vehicle.

## 3. Update from the existing game loop

Call once per frame with delta time in seconds. Feed obstacle distances measured in the same world-distance convention as the module, and translate returned decisions into your current physics/movement code.

```js
const decisions = trafficAI.update(deltaSeconds, {
  obstacles: [
    { type: 'pothole', lane: 1, distance: 9 },
    { type: 'pedestrian', lane: 2, distance: 14 },
    { type: 'goat', lane: 0, distance: 11 },
  ],
  player: { lane: playerLane, speed: playerSpeed, distanceAhead: 10 },
});

for (const decision of decisions) {
  // Find the existing 3D vehicle by decision.id.
  // Apply lane/targetLane, speed, indicator and state through your own physics.
}
trafficAI.tickCooldowns(deltaSeconds);
```

## 4. World conditions

```js
trafficAI.setConditions({
  trafficPressure: 0.7, // 0..1
  weather: 'rain',     // 'clear', 'rain', or 'dust'
  event: 'celebration_convoy',
});
```

Use `getTrafficMix()` to inspect the actual spawned distribution. The 40/30/30 target is a weighted spawn target, not a guarantee for every finite sample. Buses and trucks are available profiles but have zero default spawn weight; add weights explicitly if desired.

## 5. Collision consequences

Your game engine must detect actual collisions. When it does, call `recordCollision(vehicleId, severity, context)` to track simulated damage and emit an event. Do not use this module as a substitute for collision geometry or physical response.

## Important integration notes

- This package has not been integrated into the production site or repository.
- Lane numbers are integers from `0` to `laneCount - 1`; lane centers are available in `laneCenters`.
- `longitudinal` and obstacle `distance` must use a consistent scale. Calibrate the profile speed/gap values against the game's actual world units before release.
- The update method returns AI decisions; it does not move Three.js objects or perform collision detection.
- Connect only one authoritative traffic manager to avoid duplicate vehicles or competing movement systems.
