# Kano Keke Life — Embedded GLB Character Animation Upgrade

This is the next incremental replacement for `js/KanoLifeRootCauseRepair.js`. It preserves the exact-path keke calibration controls and cached goat discovery from the previous repair, while adding on-demand activation of animation clips embedded in the existing passenger, pedestrian, life-scene and water-seller GLB assets. No new models are included.

## Changes

- Reads embedded clips from an exact existing GLB path only when a real character clone has been attached.
- Caches the clip list per exact model path so many instances do not trigger repeated clip probes.
- Selects a clip using the current activity (walk, seated/idle, sweep, draw water, wake, food/water selling, cleaning). If a model has no clips or the clip names cannot be matched, the existing procedural pose remains active rather than freezing the actor.
- Removes common root/hips position tracks from the animation copy to reduce accidental scene-position drift while retaining limb and torso animation.
- Limits the number of simultaneously active added mixers to 12 on mobile and 28 on desktop. Static world objects do not trigger animation metadata loads.
- Disposes the temporary probe scene's geometries, materials and textures after extracting animation clips.
- Stops mixers for actors that become orphaned.
- Adds embedded-animation status to the existing `?rootCauseAudit=1` / `?assetAudit=1` panel.

## Installation

Replace only the complete file at:

`js/KanoLifeRootCauseRepair.js`

Keep `index.html`, `js/ModelManager.js`, `js/renderer3d.js`, `js/KanoSceneUpgrade.js`, all existing GLB assets, catalogue scanner and manual mapping files unchanged. This relies on the repair module already being loaded by the current game build, as in the preceding root-cause upgrade.

## Validate

Open the game with `?rootCauseAudit=1`. The panel reports embedded-clip requests, loaded clip assets, clipless assets, failures and active actors. `DOWNLOAD JSON` exports exact model paths and clip names. If an asset has no suitable embedded clip, it falls back to the existing procedural pose; this package does not invent missing clips or add models.

## Validation limits

The package includes syntax and static regression checks. Live gameplay, individual GLB animation quality, browser loading cost and device frame rates cannot be verified without testing your deployed build on the target device. The on-demand clip probe performs one additional GLTF parse per used character path; mixer limits and resource disposal are included to control cost.
