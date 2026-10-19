# Kano Life — Road Physics & Collision Response Upgrade

Standalone JavaScript module for adding road-handling calculations and vehicle damage consequences to Kano Life.

## Features
- Vehicle-specific profiles for keke, motorcycles, cars, buses, and trucks.
- Wet-road, dust, gravel, and rough-road grip modifiers.
- Braking-deceleration and braking-distance estimates.
- Steering slide/traction-loss signal.
- Spring-damper suspension response.
- Pothole impact and tyre-health consequences.
- Collision damage, speed-loss, and repair estimates.
- Vehicle condition snapshots and restore.
- Event callbacks for UI, sound, haptics, and game systems.

## Files
- `js/KanoRoadPhysicsDirector.js` — complete module.
- `INTEGRATION.md` — integration guide.

## Status
Additive module; not wired into the production game. It does not detect collisions or render effects. Connect it to the existing game loop, collision system, model animation, and authoritative wallet.
