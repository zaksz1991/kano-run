# Integration guide — KanoAnimationDirector

This module coordinates the two additive animation modules:
- `KanoCharacterAnimation.js`
- `KanoVehicleVisualAnimator.js`

It does not replace the game loop, vehicle physics, collision detection, model loader, or scene management.

## 1. Copy the files

Place `KanoAnimationDirector.js` beside the other animation modules in the project's `js/` directory. Keep the two existing modules in the same directory, or adjust import paths to match your project.

## 2. Create one director

After your existing character and vehicle animators are initialized, create one director and pass those instances to it. Do not create a second Three.js renderer or a second game loop.

```js
import { KanoAnimationDirector } from './KanoAnimationDirector.js';

const animationDirector = new KanoAnimationDirector({
  characterAnimator,
  vehicleAnimator,
  camera: renderer3D.camera,
});
```

Use the actual variable names from your game; the names above are illustrative.

## 3. Register the loaded Keke

Only call this after the real Keke GLB has loaded and been added to the existing scene. Pass the model root, not the scene. If wheel meshes are known, pass references to those actual meshes with their approximate radii. Do not invent mesh names; inspect the loaded GLB hierarchy first.

```js
animationDirector.registerPlayerVehicle('player-keke', kekeRoot, {
  body: kekeBodyMeshOrGroup,
  wheels: [
    { object: actualFrontWheel, axle: 'front', radius: 0.28, steering: true },
    { object: actualRearWheel, axle: 'rear', radius: 0.28, steering: false },
  ],
  steeringPivot: actualHandlebarPivot,
});
```

If the model has no separate body/wheel meshes, pass only `kekeRoot` and omit unknown mesh references. Body animation will still work, but wheel spin requires actual wheel objects and correctly oriented axes.

## 4. Link the driver

After registering the driver with `KanoCharacterAnimation`, link its ID to the player Keke:

```js
animationDirector.linkDriver('player-driver', 'player-keke');
```

The driver model must already be positioned and scaled correctly in the Keke seat. This module does not reposition an incorrectly authored driver model.

## 5. Update from the existing game loop

Call `update` once per frame using real measurements from the existing physics/game state. Do not create a separate `requestAnimationFrame` loop.

```js
animationDirector.update(dt, {
  speed: currentSpeed,
  steering: steeringInput,       // -1 to 1
  acceleration: accelerationInput, // -1 to 1
  braking: brakeAmount,          // 0 to 1
  roadRoughness: roadRoughness,  // 0 to 1
  distanceDelta: travelledDistanceThisFrame,
});
```

Use the project's actual variable names and units. `distanceDelta` should be the distance travelled during that frame in the same units as the wheel radius. If unavailable, omit it; the animator uses its existing fallback.

## 6. Pedestrians and lifecycle

Register pedestrians only after each GLB loads. Supply its animation clips when available. Use `setPedestrianRoute(id, points, { speed, loop: true })` for routes in the existing world coordinate system. Remove characters through the character animator when despawning them. Keep crowd counts within the character animator's configured cap on mobile.

On game teardown call `animationDirector.dispose()`. Set `{ disposeSystems: true }` only if the director owns those animation systems; otherwise dispose them separately according to existing lifecycle ownership.

## Validation checklist

- Confirm imported file paths and module capitalization match the repository.
- Confirm `dt` is seconds, not milliseconds.
- Confirm the player's speed and distance use consistent units.
- Check wheel rotation axis and sign against the real GLB.
- Confirm steering values are normalized to -1..1.
- Confirm character seat position, model scale, and facing direction in-game.
- Test browser tab switching, desktop, and mobile.
- Verify no duplicate animation update calls are running.
