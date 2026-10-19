# Kano Life — World Environment Upgrade

Standalone environment simulation module for a Kano-themed driving/life simulation built with Vite and Three.js.

## Features
- Shared world state for weather, day phase, traffic pressure, passenger demand, and road risk.
- Road-segment metadata for market density, pedestrian density, potholes, parking obstructions, flyovers, and KAROTA checkpoints.
- Environment actors for pedestrians, goats, roadside sellers, parked vehicles, market stalls, and KAROTA officers.
- Timed events for market rush, school closing, rain bursts, wedding convoys, checkpoints, and quiet periods.
- Hazard resolution outcomes and checkpoint assessment records.
- Event callbacks and localStorage save/export/import support.
- Actor caps to help avoid unbounded simulation growth on mobile devices.

## Files
- `js/KanoWorldEnvironmentDirector.js` — complete module.
- `INTEGRATION.md` — setup and integration examples.

## Validation
Run `node --check` against the module in an environment configured for ES modules. Runtime smoke tests should cover event modifiers, actor lifecycle, checkpoint results, and save-state round trips.

## Status
Additive module only. It has not been merged into or deployed to the live Kano Run game. Actual rendering, physics, UI, audio, and integration with the game's existing route/traffic/career systems remain host-game responsibilities.
