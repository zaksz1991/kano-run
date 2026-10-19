# Integration guide — existing Kano Life project

## 1. Add the module

Copy `js/KanoCharacterAnimation.js` into the game's existing `js/` folder. It imports Three.js using the project's existing Vite dependency: `import * as THREE from 'three';`.

## 2. Create one manager

In the existing game entry module, add this import:

```js
import { KanoCharacterAnimation } from './KanoCharacterAnimation.js';
```

Create one instance during game initialization, not once per character:

```js
const characterAnimation = new KanoCharacterAnimation({
  mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  maxActors: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 18 : 40,
});
```

## 3. Register a loaded character

At the existing GLTF loader success callback, after the character root has been scaled/oriented and added to the scene:

```js
characterAnimation.registerCharacter('pedestrian-unique-id', gltf.scene, gltf.animations, {
  crowd: true,
  important: false,
  scale: 1,
});
```

Use a unique ID for every actor. Do not register the same root repeatedly. Do not multiply `scale` if the loader has already applied the intended model scale; leave `scale: 1` in that case. The clip names should include recognizable words (e.g. `Idle`, `Walk`, `Run`, `Sit`, `Board`, `Alight`, `Talk`, `Wave`) for automatic mapping.

## 4. Update it in the existing frame loop

After computing the frame delta, call once per frame:

```js
characterAnimation.update(dt);
```

Do not create a second animation loop. If the game pauses, pass `0` or skip updates while paused.

## 5. Pedestrian route

```js
characterAnimation.moveAlongPath('pedestrian-unique-id', [
  { x: 3, y: 0, z: 5 },
  { x: 6, y: 0, z: 2 },
  { x: 4, y: 0, z: -2 },
], { speed: 1.1, loop: true });
```

Route coordinates are world coordinates. Set `y` to the actual ground height for uneven terrain. Use the game's existing pedestrian/collision system to prevent pedestrians from entering the road; this animation module does not replace collision or navigation.

## 6. Driver pose

Call from the existing vehicle update, using the driver's registered ID:

```js
characterAnimation.drivePose('player-driver', {
  steering: steeringInput,       // -1 to +1
  acceleration: accelerationInput, // -1 to +1
  speed: currentSpeed,
});
```

The driver model must be placed in the existing Keke seat. This module adds only subtle lean; it does not reposition the driver or change vehicle physics.

## 7. Passenger transitions

Resolve the seat/exit positions from the existing Keke model and game logic:

```js
characterAnimation.boardPassenger('passenger-id', seatWorldPosition, {
  duration: 0.85,
  onComplete: () => { /* existing game: attach passenger to seat / update fare state */ },
});

characterAnimation.alightPassenger('passenger-id', roadsideWorldPosition, {
  duration: 0.8,
  onComplete: () => { /* existing game: resume pedestrian route */ },
});
```

The callback must handle the game's current parenting and passenger state. The module deliberately does not guess seat offsets or rewrite fare logic.

## 8. Cleanup

When a character is permanently removed:

```js
characterAnimation.removeCharacter('pedestrian-unique-id');
```

On game teardown:

```js
characterAnimation.dispose();
```

## QA checklist

- Confirm the GLB contains a rig and animation clips before expecting full-body motion.
- Confirm driver feet/hands and seat alignment visually; correct the model's seat transform in the existing vehicle code, not in this animation manager.
- Test boarding/alighting on both sides of the Keke, and ensure the existing game logic changes passenger state only once.
- Test 15–20 animated actors on a mid-range phone; lower `maxActors` if frame rate drops.
- Test pause/resume, scene restart, and actor removal for duplicate mixers or orphaned objects.
- Check Vercel build before publishing. This package has not been connected to or deployed to the live repository.
