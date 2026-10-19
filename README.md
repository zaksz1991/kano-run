# Kano Life — Systemic Gameplay Bridge

This release coordinates the existing `KanoMarketDayDirector`, `KanoWeddingConvoyDirector`, `KanoVehicleLifecycleDirector`, and `KanoWorkshopRecoveryDirector` modules behind one update/disposal lifecycle.

## Included
- `js/KanoSystemicGameplayBridge.js`
- `patches/main.js.integration-snippet.js`
- `INTEGRATION.md`

## Important boundaries
This is an integration bridge, not a claim that the live game has been updated. It does not create convoy vehicle meshes, directly alter fares, deduct money, or replace the actual collision system. Those actions must be connected to the existing renderer/game economy to avoid duplicate actors or incorrect wallet changes.
