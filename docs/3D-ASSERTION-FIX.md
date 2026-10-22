# 3D mode regression-test update

The quality preference contract is now tested against the live implementation:

- `saved2D` reads `save.settings.quality === '2d'` during `boot()`.
- The initial selection checks `force2d || (saved2D && !force3d)` before calling the initial `start3D()` branch.
- The settings handler sets `userSelected2D = quality === '2d'` and exits early when either URL force flag is active.
- WebGL context loss/restoration calls `rebuild3D(...)`.
- Repeated frame-update failures request a 3D rebuild, never a Canvas 2D downgrade.

The earlier exact-string assertions referred to an obsolete `keep3D` variable and an old context/frame-recovery implementation. Production source is not changed by this update.
