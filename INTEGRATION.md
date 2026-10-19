# Integration guide — Kano Life systemic simulation upgrade

This is an additive module package. It is not wired into the live game because the current game entry point and its scene/vehicle variables were not supplied.

## 1. Add the files

Copy the three JavaScript files into your existing `js/` directory. Keep your existing game files and asset paths.

## 2. Driver-life simulation

```js
import { KanoLifeSimDirector } from './KanoLifeSimDirector.js';

const lifeSim = new KanoLifeSimDirector({
  onChange: (state, reason) => {
    // Update your existing HUD here; do not replace the whole HUD.
    // Example: cashText.textContent = `₦${Math.round(state.cash).toLocaleString()}`;
  },
  onEvent: ({ type, detail }) => {
    // Trigger existing UI/audio feedback for trip_started, refuelled, fine, etc.
  },
});

// Call once per frame with your actual measured frame delta.
lifeSim.update(deltaSeconds, {
  speedKmh: playerSpeedKmh,
  distanceKm: distanceTravelledThisFrame,
  engineRunning: isEngineRunning,
  passengerOnboard: hasPassenger,
});

// Connect existing interaction buttons to lifeSim.startTrip(), completeTrip(),
// refuel(), eat(), and rest(). Dispose on game teardown with lifeSim.dispose().
```

Default fuel price and fare values are game-balance placeholders; tune them to the existing economy before release. Avoid advancing `distanceKm` with total cumulative distance each frame: pass the incremental distance for that frame.

## 3. Procedural traffic

```js
import { KanoProceduralTrafficDirector } from './KanoProceduralTrafficDirector.js';

const traffic = new KanoProceduralTrafficDirector({
  scene,
  lanes: [-3.2, 0, 3.2],
  poolSize: isMobile ? 8 : 18,
  mix: { keke: 0.4, motorcycle: 0.3, car: 0.3 },
  createVehicle: ({ type, laneIndex }) => {
    // Return an existing Three.js Object3D cloned from your model catalog.
    // Do not return a shared scene root. Add type-switching/reloading in your
    // model manager if the GLB geometry differs across vehicle types.
    return modelManager.createTrafficVehicle(type, laneIndex);
  },
  onNearMiss: () => soundDirector.oneShot('near_miss'),
  onCollision: ({ actor }) => { /* feed your existing collision system */ },
});

// In your existing animation loop:
traffic.update(deltaSeconds, {
  playerZ: player.position.z,
  playerX: player.position.x,
  playerSpeed: playerSpeedWorldUnitsPerSecond,
  paused: isPaused,
});
```

**Important:** this director expects traffic to approach along +Z while the player's position is used as the reference. If your current game moves the world in the opposite direction, invert the Z convention before enabling it. It is a separate traffic pool and must not run alongside an existing traffic spawner unless that duplication is intentional. Collision callbacks are hooks, not a replacement for your collision solver.

## 4. Dynamic audio

```js
import { KanoDynamicSoundDirector } from './KanoDynamicSoundDirector.js';

const soundDirector = new KanoDynamicSoundDirector({
  sounds: {
    engine: { src: '/audio/engine.mp3', loop: true, bus: 'sfx', volume: 0.75 },
    road_ambience: { src: '/audio/road-ambience.mp3', loop: true, bus: 'ambience' },
    horn: { src: '/audio/horn.mp3', bus: 'sfx', volume: 0.9 },
    near_miss: { src: '/audio/near-miss.mp3', bus: 'sfx' },
  },
});

// Call from the Start/Play button click (required by browser autoplay policies).
await soundDirector.unlock();
await soundDirector.setAmbience('road_ambience');

// Update engine from your real vehicle telemetry:
await soundDirector.setEngineState({ rpm, throttle, running: isEngineRunning });
// User interactions: await soundDirector.oneShot('horn');
// On teardown: soundDirector.dispose();
```

Use your existing audio asset paths rather than adding duplicate sound files. Avoid calling async `setEngineState` more often than needed if your game has a very high frame rate; a 10–15 Hz audio telemetry update is usually sufficient. Sound playback fails gracefully if a file is absent or audio has not been unlocked.

## Required before production

- Connect these modules to the real entry point and actual variable names.
- Confirm the traffic direction, lane coordinates, player scale, and collision conventions.
- Tune economy, fuel drain, needs decay, and audio levels with playtesting.
- Test mobile touch controls, performance, pause/resume, reload persistence, and audio unlock.
- Run a production build and verify that the existing spawner/camera/UI are not duplicated.
