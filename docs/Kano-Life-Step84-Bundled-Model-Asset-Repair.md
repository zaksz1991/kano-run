# Step 84 — Bundled model-path repair record

## Evidence

The user-provided local browser trace lists repeated `404` requests under `/assets/models/vehicles/` and `/assets/models/characters/`. The current supplied source snapshot's `public/assets` tree had the hero image but no models subdirectory. `js/ModelManager.js` tries candidate GLBs sequentially and returns on the first valid model, so making each category's first configured candidate available prevents its later nonexistent alternatives from being requested.

## Design

The repair adds 24 compact original GLB v2 files at the unique first-choice paths in `ModelManager.js`. Each is self-contained and uses embedded geometry/materials. Geometry is merged by material before export to keep draw-call meshes low. The existing loader, fallback, vehicle behavior, scene code, and startup files remain unchanged.

## Coverage

- Three-wheeler keke and eight unique vehicle categories.
- Adult passenger and pedestrian variants with distinct clothing silhouettes.
- House frontage and industrial building.
- Flyover with red/white rail marks.
- Roadside street fixtures: lighting, cone, mound, bench, traffic signal and stop sign.

## Safety boundary

This is an asset-only runtime patch plus a Node regression test. It adds files under `public/assets/models`, one test under `tests`, and documentation. It does not modify game logic or user data.
