# Kano Life — World Animation Upgrade

Adds a reusable Three.js `KanoWorldAnimationDirector` for subtle ambient motion on already-loaded pedestrian, goat, flag, sign, stall, tree, and dust objects.

## Included
- `js/KanoWorldAnimationDirector.js` — complete ES module
- `INTEGRATION.md` — integration examples and constraints

## Important
This is a standalone upgrade package, not a commit to the GitHub repository. It will not change the production site until the module is added to the project, imported, registered against actual loaded objects, and called from the existing game loop. The module does not create missing 3D models.
