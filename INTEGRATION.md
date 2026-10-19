# Integration guide — Kano Cinematic Camera Director

This is an additive camera polish module. It does not replace vehicle physics, collision detection, controls, or the existing renderer.

## 1. Add the file

Copy `js/KanoCinematicCameraDirector.js` into the game's `js` folder. It imports Three.js using the same bare import convention used by a Vite/Three.js project.

## 2. Create the director

In the existing 3D renderer/game initialization code, after the Three.js camera and the player's loaded Keke root are available:

```js
import { KanoCinematicCameraDirector } from './KanoCinematicCameraDirector.js';

const cameraDirector = new KanoCinematicCameraDirector(camera, {
  mobile: window.matchMedia('(max-width: 760px)').matches,
});
cameraDirector.setTarget(playerKekeRoot);
```

Use the real loaded Keke root variable; do not create a placeholder vehicle just for this module.

## 3. Update it once per frame

Call this after the existing vehicle physics update and before `renderer.render(scene, camera)`:

```js
cameraDirector.update(deltaSeconds, {
  speed: normalizedSpeed,       // 0..1 recommended
  steering: normalizedSteering // -1..1
});
```

Map `normalizedSpeed` and `normalizedSteering` to the project's existing state. Do not feed raw speed in km/h without normalizing it.

## 4. Collision feedback (optional)

When the existing collision system reports an impact, call:

```js
cameraDirector.impact(0.3, 0.18);
```

Only call this from the existing collision event; do not add a second collision detector.

## 5. Opening reveal (optional)

After setting the target and before driving starts:

```js
cameraDirector.playIntro(2.0);
```

Avoid triggering the intro on every respawn or every frame.

## 6. Cleanup

When disposing the 3D scene:

```js
cameraDirector.dispose();
```

## Notes

- The director smooths camera position and uses speed-responsive look-ahead/FOV.
- Motion is reduced when `prefers-reduced-motion` is enabled.
- The camera director must be the sole owner of camera positioning while active. If the existing renderer also moves the camera every frame, integrate this call into that existing camera-follow section rather than running two competing camera controllers.
- The module was syntax-checked, but has not been run against the production game's camera/model variables. Verify the follow offset and camera ownership in the actual game before deployment.
