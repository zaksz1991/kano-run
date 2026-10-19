# Kano Life — Systemic Simulation Upgrade

Three additive JavaScript modules for deeper driver-life gameplay, pooled procedural traffic, and dynamic audio mixing.

- `js/KanoLifeSimDirector.js`: persistent cash/fuel/hunger/fatigue/reputation, day clock, trip start/completion, refuelling, meals, rest, fines, and autosave.
- `js/KanoProceduralTrafficDirector.js`: pooled keke/motorcycle/car traffic with configurable 40/30/30 mix, lane placement, recycling, and near-miss/collision hooks. Uses caller-provided Three.js Object3D factory.
- `js/KanoDynamicSoundDirector.js`: user-gesture audio unlock, buffered playback, looping ambience, one-shots, engine telemetry modulation, volume controls, and mute.

## Scope and validation

These modules are not yet connected to the live `kano-run.vercel.app` game. They were designed to avoid assumptions about current asset paths, HUD elements, and game entry-point variables. See `INTEGRATION.md` before enabling them.

All files are ES modules. `KanoProceduralTrafficDirector.js` expects Three.js Object3D instances from the caller; it does not import Three.js itself.
