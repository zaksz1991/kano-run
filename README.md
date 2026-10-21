# Kano Keke Life — Cultural Street Events Upgrade

## Included

- `js/KanoCulturalStreetEventsUpgrade.js` — a compatibility layer that decorates the game's existing wedding-convoy SUV actors, raises the chance of seeing the existing `Bikin Aure` event, adds two roadside characters using already-loaded character GLBs with bowl props, and discovers/animates a real goat GLB only if the generated asset inventory contains one.
- `index.html` — complete replacement based on the current repository HTML, registering the new module before the existing root-cause/model-visual/startup chain.
- `tests/kano-cultural-street-events.test.mjs` — static regression tests for the integration and safeguards.

## Installation

1. Replace the repository-root `index.html` with the complete `index.html` in this ZIP.
2. Add `js/KanoCulturalStreetEventsUpgrade.js` at the exact path shown.
3. Add `tests/kano-cultural-street-events.test.mjs` at the exact path shown.
4. Keep `package.json`, `vite.config.js`, `scripts/glb-catalog-overrides.json`, `js/ModelManager.js`, `js/renderer3d.js`, `js/KanoSceneUpgrade.js`, and all GLB assets unchanged.

The current `Game.updateEnvironment()` already owns the game's environmental events and creates three SUV traffic records for weddings. This upgrade decorates those real traffic actors and makes a wedding outcome more likely when the existing environment timer expires. It does not replace the simulation or introduce duplicate driving/collision systems.

Roadside characters are cloned from existing loaded `passengerMan`, `pedestrian`, or `passenger` models and receive small bowl props. It avoids female-name candidates where the model path is identifiable. This is a child-scale reuse of an existing character model, not a guarantee of a dedicated child asset.

The goat system reads `/assets/models/model-catalog-audit.generated.json`, selects a matching existing goat GLB, and plays a suitable embedded clip when the GLB contains one. If no real goat asset is found, the audit reports that fact and does not create a primitive goat placeholder.

## Diagnostics

Run `window.kanoCulturalStreetEventsAudit()` in the browser console to see wedding counts, the source paths used for roadside characters, goat discovery/loading status, crossing counts, and any model-load failures.

## Validation

The bundled Node tests verify hook registration and key code paths. They are static regression tests; they do not prove visual correctness in a live browser. Live gameplay and actual GLB inventory availability must still be checked in the running game.
