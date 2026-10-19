# Integration guide — World Environment Director

This package is additive. It does not replace the existing Three.js scene, physics, traffic spawner, collision system, or UI. Connect it to those existing systems deliberately.

## 1. Import and create the director

```js
import { KanoWorldEnvironmentDirector } from './js/KanoWorldEnvironmentDirector.js';

const worldEnvironment = new KanoWorldEnvironmentDirector({
  maxActors: 90,
  eventChancePerMinute: 0.22,
  persist: true,
});
```

Use one shared instance for the current game session. If another module already owns day phase or weather, synchronize those values rather than creating competing clocks.

## 2. Register route segments

```js
worldEnvironment.registerRoadSegment({
  id: 'kantin-market-road',
  type: 'market-road',
  name: 'Kantin Kwari market road',
  marketDensity: 0.9,
  pedestrianDensity: 0.85,
  potholeRisk: 0.35,
  parkingObstruction: 0.45,
  speedLimit: 30,
});

worldEnvironment.registerRoadSegment({
  id: 'kwankwasiyya-flyover',
  type: 'flyover',
  flyover: true,
  potholeRisk: 0.05,
  speedLimit: 50,
});
```

Segment IDs should match the route/world identifiers your game already uses. These are example IDs, not a claim that those exact segments exist in your current route data.

## 3. Update it from the existing game loop

```js
const worldState = worldEnvironment.update(deltaSeconds);
const segmentState = worldEnvironment.getWorldState(currentSegmentId);

// Pass modifiers into existing systems; don't move Three.js meshes here.
trafficDirector?.setEnvironmentModifiers?.(segmentState.modifiers);
passengerDirector?.setDemandMultiplier?.(segmentState.modifiers.passengerDemand);
```

Adapt method names to your existing modules. The optional calls above are integration examples, not APIs guaranteed to exist in the current game.

## 4. Render actors with existing models

Spawn simulation records and let the existing model catalog / actor manager create their visuals:

```js
const actor = worldEnvironment.spawnActor('pedestrian', {
  segmentId: currentSegmentId,
  lane: 1,
  distance: 22,
  metadata: { activity: 'market-shopping' },
});
```

Supported types: `pedestrian`, `goat`, `roadsideSeller`, `parkedVehicle`, `marketStall`, and `karotaOfficer`. Subscribe to `actorSpawned`, `actorDespawned`, and `actorBehaviourChanged` to keep visual objects in sync. Your scene system must still provide actual 3D models, animation, transforms, and cleanup.

## 5. World events and hazards

```js
worldEnvironment.on('worldEventStarted', ({ event }) => {
  // Display UI/audio and notify existing traffic/passenger systems.
});

worldEnvironment.on('hazardResolved', (result) => {
  // Feed reputation/damage results into your authoritative career/wallet system.
});

worldEnvironment.startEvent('marketRush', { segmentId: currentSegmentId });
const checkpointResult = worldEnvironment.assessCheckpoint({
  speed: playerSpeed,
  speedLimit: 40,
  dangerousDriving: recentDangerousDriving,
});
```

Avoid double-charging fines or duplicating reputation if another game system already owns those outcomes. The director reports results; connect them to one authoritative system.

## Important

- This module is not connected to the production game by this package alone.
- Do not run a second physics simulation; use the current game's physics and collision results.
- Call `update(deltaSeconds)` once per frame (it clamps individual updates to one second); do not call it from multiple render callbacks.
- `localStorage` persistence is browser-only and gracefully disabled in non-browser tests.
- Actor records do not create rendered meshes automatically.
