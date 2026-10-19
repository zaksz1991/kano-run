# Kano Life — Character Animation Upgrade

Adds a reusable Three.js character animation manager for GLB characters, procedural fallback movement, passenger path transitions, and driver rig gestures.

## Files
- `js/KanoCharacterAnimation.js` — complete ES module.

## What it does
- Uses `THREE.AnimationMixer` when the loaded GLB includes animation clips.
- Chooses clips by names such as `walk`, `run`, `idle`, `sit`, or `drive`.
- Animates a registered passenger along world-space points for boarding/alighting.
- Provides subtle procedural movement when no clips are available.
- Offers a driver gesture helper that supports common Mixamo bone names and the Kano procedural rig names.
- Caps registered actors more aggressively on mobile and provides cleanup methods.

## Integration contract
This is an additive module, not a replacement for `game.js`, `Renderer3D.js`, `ModelManager.js`, or `main.js`. Your existing renderer/game must decide when a passenger is picked up or dropped off. Instantiate it only when a Three.js scene is active:

```js
import { KanoCharacterAnimation } from './KanoCharacterAnimation.js';

const characterAnimation = new KanoCharacterAnimation({
  scene: renderer.scene,
  mobile,
});

// When a GLTF has loaded:
const passenger = characterAnimation.registerCharacter(
  gltf.scene,
  gltf.animations,
  { role: 'passenger', scale: 1 },
);

// Each frame, alongside your existing renderer update:
characterAnimation.update(deltaSeconds);

// When the game switches away from WebGL:
characterAnimation.dispose();
```

To animate boarding or alighting, call `boardPassenger(actor, approachPoint, seatPoint)` or `alightPassenger(actor, doorPoint, destinationPoint)`. All points must be `THREE.Vector3` values in world coordinates. Use the `onComplete` callback to update the existing passenger inventory or remove the character; do not update the inventory twice.

For driver gestures, pass the actual driver root, the current game state, and frame delta to `animateDriver(driverRoot, game.s, dt)`. The driver root must be a rig or a parent containing named bones. This method does not reposition a driver model that is incorrectly authored in its GLB; fix its seat transform in `ModelManager` or the asset itself.

## Important limitations
- The module does not automatically discover or load passenger GLBs; connect it to your existing `ModelManager`/GLTF loader.
- Your current scene and game have not been available here for end-to-end testing. Integrate in a branch and run your existing checks before deploying.
- GLB animation clip names and rig bone names vary. The helper uses common names and falls back to subtle procedural motion, but high-quality skeletal animation requires suitable clips and matching rigs.
- Do not dispose shared cached GLB geometry/materials when removing an actor. Use `remove(actor)` for shared assets; use `remove(actor, { disposeMaterials: true })` only when the actor owns its resources exclusively.
