# Integration — existing Kano Life project

Copy `js/KanoVehicleVisualAnimator.js` into the game's existing `js/` directory. It uses the project's existing `three` dependency.

## 1. Import and create one manager

```js
import { KanoVehicleVisualAnimator } from './KanoVehicleVisualAnimator.js';

const vehicleVisuals = new KanoVehicleVisualAnimator({
  suspensionTravel: 0.075,
  vibration: true,
});
```

Create the manager once during game initialization, not inside the animation loop.

## 2. Register the existing player Keke

After the current GLB loader has added the Keke model to the scene, identify the actual wheel meshes from that model and register them. Do not invent node names; use the model's real mesh references.

```js
vehicleVisuals.register('player-keke', kekeRoot, {
  wheels: [
    { object: frontLeftWheel, axle: 'front', radius: 0.28, steering: true },
    { object: frontRightWheel, axle: 'front', radius: 0.28, steering: true },
    { object: rearLeftWheel, axle: 'rear', radius: 0.28 },
    { object: rearRightWheel, axle: 'rear', radius: 0.28 },
  ],
  // Optional, only if there is no other active camera controller:
  // camera: rendererCamera,
  // followCamera: true,
  // cameraOffset: new THREE.Vector3(0, 2.8, 6.5),
});
```

If a wheel mesh is not available or the asset has a single combined mesh, pass `wheels: []`. The chassis motion still works. The `body` option can point to a child mesh if the root transform is controlled by gameplay; use `{ body: visualBody }` and ensure its baseline is correct.

## 3. Feed real motion from the existing game loop

After the existing game/physics update calculates current values, call:

```js
vehicleVisuals.setMotion('player-keke', {
  speed: currentSpeed,
  steering: steeringInput,
  acceleration: accelerationInput,
  braking: brakeAmount,
  roadRoughness: 0.25,
  distanceDelta: signedDistanceTravelledThisFrame,
});
vehicleVisuals.update(dt);
```

`distanceDelta` is the signed world-distance moved during this frame. If omitted, the module estimates a small increment from speed; supplying real distance is preferable. Keep this call in the existing render loop—do not create a second loop.

## 4. Cleanup

On vehicle removal call `vehicleVisuals.unregister('player-keke')`. On full game teardown call `vehicleVisuals.dispose()`.

## QA
- Check each wheel's local spin axis; some GLBs use Z rather than X.
- Confirm the visual body is not the same root that the physics system continually overwrites. If it is, use a dedicated visual child.
- Do not enable camera follow while the existing camera follow system is active.
- Tune suspension travel conservatively for the Keke model scale.
- Test on mobile and desktop before deployment.

This is a standalone module and has not been wired into the live repository or browser-tested against the current deployed assets.
