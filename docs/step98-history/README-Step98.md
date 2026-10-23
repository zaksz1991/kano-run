# Kano Life — Step 98: Persistent Roadside World Anchors

## What this update addresses

Step 98 fixes the visual recycling problem for roadside infrastructure. Fuel-station forecourts, parked checkpoint kekes, and the general-checkpoint passenger queue are detached from temporary zone actors and positioned from the same signed travel coordinate used by Steps 96–97. They now approach the player, pass behind the player, and leave the visible band instead of being dragged back toward the camera whenever a zone depth is refreshed. Reversing along the current route moves these same landmarks back into view.

Sidewalk walkers are also placed against the signed road coordinate while their existing gait animation is retained. Their short walking path is bounded so they do not drift indefinitely down the road. Checkpoint passengers keep a restrained idle animation after the gameplay zone itself is recycled.

## Install with File Explorer

1. Download and extract `Kano-Life-Step98-Persistent-Roadside-World-Anchors.zip`.
2. Open the extracted `kano-step98-package/js` folder.
3. Copy its files into the existing Kano Run project's `js` folder. Choose **Replace** for files with matching names and **Merge** for the folder.
4. Keep `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, all saved browser data, and the model/texture asset folders unchanged.

The ZIP includes the current Step 92–97 visual/navigation modules required by this bootstrap, the updated complete `KanoModelAssetVisualUpgrade.js`, and the new `KanoInfrastructureWorldAnchorsUpgrade.js`. It does not replace the main game engine or user save data.

## Runtime audit

In the browser's DevTools console, run:

```js
window.kanoInfrastructureWorldAnchorAudit()
```

The audit reports the signed distance, anchored fuel stations, checkpoint parking, passenger groups, sidewalk walkers, current positions, visibility, and whether objects are attached to the world rather than the player.

## Scope and asset note

This does not convert the entire game to a surveyed open-world Kano map and does not replace the arcade steering/collision engine. It corrects the specified roadside visuals within the current signed-distance renderer. The existing procedural Adaidaita Sahu model and articulated pedestrian meshes remain in use; this step does not claim to generate or rig new high-detail GLB assets with InstantMesh.

## Checks completed

- Step 98 source-level regression tests: included in `tests/`.
- JavaScript syntax checks: performed for the JavaScript modules included in this ZIP.
- ZIP integrity: checked after packaging.
- Full Vite/Vercel build and live browser visual test: **not run in this environment**. Source-level checks do not establish what the deployed game will look like on a device.
