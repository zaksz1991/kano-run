# Kano Life — Animation Director Upgrade

A lightweight orchestration layer for the game's existing Three.js character and vehicle visual animators.

### Coordinates
- Player vehicle visual animation
- Driver pose synchronization
- Existing character animation and pedestrian routes
- Reduced-motion preference
- Pausing updates while the browser tab is hidden
- Animation diagnostics for a developer HUD

### Safety boundaries
This is an additive module. It does not implement or replace driving physics, collisions, traffic AI, GLB assets, or the render loop. It must be integrated with the real game code and actual loaded model references before its effects appear in-game.

See `INTEGRATION.md` for the full wiring guide.
