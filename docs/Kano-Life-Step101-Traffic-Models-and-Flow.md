# Step 101 engineering note

The runtime adapter is intentionally guarded by engine shape. If the active game owns `obs` and the renderer exposes `vehiclePool` plus `styleVehicle`, it enables GLB mounting and relative traffic movement for that known runner. If the game uses `s.traffic`/`state.traffic`, the adapter does not replace the newer engine's `updateTraffic` implementation; it adds flow metadata and can mount models if the renderer exposes the legacy vehicle pool.

GLB resources are only installed once the ModelManager cache has a usable model. Procedural fallback geometry remains for unavailable assets. The audit API reports per-model load state and counts of visible pool actors currently marked as GLB-backed.

The flow projection classifies lane 0 as oncoming and lanes 1–2 as same-direction. Same-direction traffic uses a lower screen-space approach multiplier than oncoming traffic. This improves direction readability in the current endless-runner projection, but is not wheel physics, longitudinal open-world movement, or a surveyed road layout.
