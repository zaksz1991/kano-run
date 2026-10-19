# Kano Life — 3D Animation Upgrade

A modular Three.js animation runtime for the existing Kano Life game. It supports GLTF skeletal clips, smooth cross-fades, walking/running state changes, waypoint movement for pedestrians, passenger boarding/alighting transitions, driver lean from steering/acceleration, mobile actor limits, and a restrained procedural fallback when a character asset has no animation clips.

## Included

- `js/KanoCharacterAnimation.js` — complete animation manager.
- `INTEGRATION.md` — integration points and safety checklist.

## Important integration note

This is an additive subsystem, not a claim that the live game has already been changed. The existing `main.js`, model loader, and game loop were not available in this workspace, so this package does not overwrite them or guess their exact method names. Integrate it at the existing GLTF character-load and frame-update points described in `INTEGRATION.md`.

## Asset quality determines the ceiling

For high-quality human motion, use rigged GLB/GLTF character models with correctly retargeted clips such as Idle, Walk, Run, Sit/Drive, Board, Alight, Talk, and Wave. This manager cannot invent believable skeletal limb motion for a static, unrigged mesh; its fallback is intentionally subtle. Keep your existing Keke model and seat positions as the source of truth.
