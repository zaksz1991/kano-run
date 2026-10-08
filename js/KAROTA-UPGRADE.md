# Kano Run — KAROTA checkpoint upgrade

## Replace

- `js/renderer3d.js`
- Add `js/karotaWorld.js`

## What this layer adds

- KAROTA checkpoint frame and overhead sign
- Uniformed KAROTA officer
- Patrol vehicle with warning lamps
- Inspection barrier
- Traffic cones
- Checkpoint booth
- Dust/roadside grounding
- Officer hand-signal animation
- Barrier open/closed animation
- Warning-light animation
- Reads existing game checkpoint/KAROTA state without replacing the game's enforcement, fine, negotiation, or chase logic

## Compatibility

The renderer checks several possible existing state names (`karotaCheckpointActive`, `karotaActive`, `checkpointActive`, `atKarotaCheckpoint`, `inKarotaCheckpoint`, `karotaCheckpoint`) so the visual layer does not require a new gameplay API.
