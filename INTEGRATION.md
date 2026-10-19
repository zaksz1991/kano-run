# Integration guide — Kano World Animation Director

This is an additive module for animating **existing** market and roadside assets. It does not create pedestrians, stalls, goats, or models, and is not wired into the live game automatically.

## 1. Import

```js
import { KanoWorldAnimationDirector } from './KanoWorldAnimationDirector.js';
```

Adjust the import path to the actual location of the module in your project.

## 2. Create once after your Three.js scene exists

```js
const worldAnimator = new KanoWorldAnimationDirector({
  scene,
  isMobile: window.matchMedia('(max-width: 760px)').matches,
});
```

## 3. Register existing loaded objects

Call these after your own model loader has added the objects to the scene. Replace the example object names with references from your game.

```js
worldAnimator.register(pedestrianRoot, {
  id: 'market-pedestrian-01', type: 'pedestrian', wander: true,
  radius: 1.4, speed: 0.5,
  bounds: { minX: -12, maxX: 12, minZ: -40, maxZ: 20 },
});
worldAnimator.register(goatRoot, { id: 'roadside-goat-01', type: 'goat', wander: true, radius: 2.2 });
worldAnimator.register(flagRoot, { id: 'market-flag-01', type: 'flag', amplitude: 0.2, speed: 1.7 });
worldAnimator.register(treeRoot, { id: 'roadside-tree-01', type: 'tree' });
worldAnimator.register(signRoot, { id: 'stall-sign-01', type: 'sign' });
```

Register a *root/group* for each actor, not each mesh inside one model. Do not register the player vehicle with this director; use the vehicle animator for that.

## 4. Update in your existing animation loop

```js
worldAnimator.update(deltaSeconds, {
  playerPosition: playerKeke.position,
  maxDistance: isMobile ? 55 : 95,
});
```

`deltaSeconds` must be seconds, not milliseconds. Reuse the same game-loop delta you already calculate. Do not create a second requestAnimationFrame loop.

## Notes

- Desktop actor cap defaults to 60; mobile cap defaults to 24. Increase only after profiling on real devices.
- Wandering is intentionally small and should be constrained to walkable sidewalk/market bounds. Do not set bounds across the active road unless road crossing is intentional.
- The director does not dispose registered geometry or materials, because GLB assets may share cached resources.
- Reduced-motion preference disables ambient motion. The module skips distant actors and pauses when the browser tab is hidden.
- This module passed a JavaScript syntax check; it has not been connected to or tested against the production game.
