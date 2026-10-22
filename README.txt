KANO LIFE — STEP 22: ROADSIDE LABEL TEXTURE LIFECYCLE FIX

Source-level finding
--------------------
Renderer3D.syncZones() creates a new 512 x 128 CanvasTexture for each temporary
pickup/drop-off/fuel zone. When a zone leaves the active state, the code removed
its actor and disposed its materials/geometries with disposeSceneTree(actor),
but that helper intentionally preserves textures by default because imported
GLB textures can be shared. The zone-owned label CanvasTexture was therefore
not explicitly released during normal zone recycling.

What this package changes
-------------------------
- Complete replacement: kano-run/js/renderer3d.js
- New helper: kano-run/js/KanoZoneTextureLifecycle.js
- Focused tests: kano-run/tests/KanoZoneTextureLifecycle.test.mjs
- Explicitly disposes only each expired zone's unique label texture, clears the
  reference, then runs the existing scene-tree disposal unchanged.
- Does not dispose textures on child GLB instances or alter shared ModelManager
  asset ownership.
- Does not change rendering scale, road/vehicle geometry, collisions, missions,
  animation cadence, traffic simulation, or model/audio/texture source assets.

Install
-------
Extract into the existing kano-run folder, preserving directory paths. Replace
only js/renderer3d.js and add js/KanoZoneTextureLifecycle.js. The test file may
be added to tests/ if you want to retain the focused regression test; no full
npm test run is requested for this update.

Validation performed in this environment
----------------------------------------
- node --check passed for renderer3d.js and KanoZoneTextureLifecycle.js.
- Focused node:test suite: 4/4 passed.
- ZIP integrity check passed.
- The full game/browser audit and physical-phone performance were not run.
