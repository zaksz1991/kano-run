# Step 100 — Technical note

## Mix policy

The runtime's spawned-traffic hook uses randomized batches of ten: four `keke`, three `motorcycle`, and three `car` entries. The order is shuffled per batch. This gives exact target proportions over each completed batch while avoiding a visible fixed sequence.

## Model loading

The renderer requests the existing ModelManager keys `keke`, `motorcycle`, and `car` when its draw loop first runs. The current ModelManager catalogue maps those keys to the bundled model paths. `window.kanoTrafficCompositionAudit()` reports actual model cache paths/status; this is the runtime source of truth if an asset fails to load.

## Scope

This is a traffic-spawn mix and preload change. It does not alter the driving physics, road coordinates, collision resolution, traffic lane/depth values, game economy, saved data, or UI. Visible traffic counts may differ from the target ratios because vehicles enter and leave the live view at different times. The enforced percentages refer to complete ten-vehicle spawn batches, not the instantaneous scene.

## Validation boundary

Automated tests validate the shuffled bag and source wiring. No production build or interactive browser session was available for verification in this pass.
