# Integration Guide — Driver Model Audit & Alignment

This is an **additive helper**, not a replacement for the game's model catalog, scene, controls, camera controller, or physics. Do not integrate it by creating a second player vehicle or a second render loop.

## 1. Import the helper

```js
import { KanoDriverModelAudit, renderKano3DStatus } from './KanoDriverModelAudit.js';
```

Use the correct relative path for your project structure.

## 2. Audit the real models after loading

Call `audit()` on the existing loaded GLB scene roots:

```js
const modelAudit = new KanoDriverModelAudit({
  onDiagnostic: (event) => {
    // Route to your existing debug logger or UI if desired.
    // Avoid logging every frame; these events are lifecycle events.
  },
});

modelAudit.audit(existingKekeModel, 'vehicle', 'player-keke');
modelAudit.audit(existingDriverModel, 'driver', 'player-driver');
const report = modelAudit.getReport();
```

Do not pass a URL or loader result wrapper. Pass the actual `gltf.scene` (or the game's existing clone of it).

## 3. Seat the driver relative to the keke

The default anchor coordinates are examples only. Different GLB assets use different origins, scales, and orientations. Adjust them after inspecting the model in-game.

```js
const seat = modelAudit.createSeatAnchor(existingKekeModel, {
  position: { x: 0, y: 0.82, z: -0.18 },
  rotation: { x: 0, y: 0, z: 0 },
});
modelAudit.attachDriver(existingDriverModel, seat, {
  x: 0, y: 0, z: 0,
  scale: 1,
  rotationY: 0,
});
```

Important:
- Ensure the driver is not also separately added to the scene or attached to a second parent.
- Keep the vehicle physics root authoritative. Do not move the driver independently every frame; parenting makes it follow the vehicle.
- Check the model's forward axis and seat pivot. GLB assets may face `+Z`, `-Z`, or another direction.
- If the model uses a skeleton, keep its animation mixer updates in the existing animation loop.
- Avoid sharing one mutable driver object between traffic vehicles. Clone the model for each independent actor.

## 4. Camera framing

Use `getVehicleCameraTarget(vehicleRoot)` as a suggested target for the existing camera controller. Do not create another camera loop or overwrite camera smoothing already in the game.

```js
const framing = modelAudit.getVehicleCameraTarget(existingKekeModel, {
  targetHeightOffset: 0.35,
  distance: 5,
});
// Feed framing.target into the existing camera target/smoothing system.
```

Tune distance and target height for the actual camera angle and mobile viewport.

## 5. 3D/WebGL status badge

Create or reuse an existing status element, then call this helper after rendering or at a low update frequency (e.g. 2–4 times per second):

```js
renderKano3DStatus(statusElement, renderer, scene, camera, {
  assetStatus: 'ready',
});
```

Do not call `renderer.render()` from this helper. It only reads status and writes text to the supplied element.

## 6. Placeholder detection limitations

The audit flags suspicious patterns such as unnamed meshes with one material, but it cannot reliably prove that a model is a placeholder. Some legitimate GLBs have unnamed meshes. Review `likelyPlaceholder` and issue lists rather than automatically deleting assets.

## 7. Suggested test checklist

- Player keke appears exactly once.
- Driver appears seated inside the vehicle, not standing in front of it.
- Driver follows vehicle movement and rotation.
- Camera keeps the full keke visible on desktop and mobile.
- Passenger boarding positions still match the vehicle's seating geometry.
- GLB models have plausible bounds and scale.
- No duplicate road, duplicate player, or extra render loop is introduced.
- WebGL status badge remains readable on narrow screens.
- Existing controls, physics, collisions, routes, and game HUD remain intact.
