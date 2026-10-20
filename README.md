# Kano Life — GLB Visual Review & Category Mapping Studio

This upgrade adds a browser-based 3D preview page so you can see the exact GLB assets already in `public/assets/models/`, inspect their embedded names, mesh counts, rough dimensions and animations, and assign categories based on visual inspection instead of guessing from filenames.

It adds no GLB assets and does not rename any model.

## Package contents

- `vite.config.js` — complete replacement for the currently published Vite config; preserves the existing `/` base, ES2020 build target, no sourcemaps and `host: true`, adds the existing GLB catalogue scanner plugin, and builds the review page as a second HTML entry.
- `scripts/glb-catalog-sync.mjs` — scanner/override plugin that discovers actual GLB paths and applies exact-path mappings to the existing `js/ModelManager.js` catalogue during Vite transformation.
- `scripts/glb-catalog-overrides.json` — starting exact-path override file. It starts empty so no model is incorrectly assigned without visual verification.
- `glb-model-review.html` — review workspace entry page.
- `js/glb-model-review.js` — Three.js GLB preview, file inventory, playback for embedded animation clips and export controls.
- `js/glb-model-review-utils.js` — category mapping and URL-safety helpers.
- `tests/` — model-catalogue and mapping regression tests.

## Install

1. Replace the entire existing `vite.config.js` with the included complete file.
2. Add `glb-model-review.html` at the repository root.
3. Add `js/glb-model-review.js` and `js/glb-model-review-utils.js` under `js/`.
4. Add `scripts/glb-catalog-sync.mjs` and `scripts/glb-catalog-overrides.json` under `scripts/`. If a file at either path already exists, replace the entire file with the one in this package.
5. Keep `js/ModelManager.js`, `index.html`, `renderer3d.js`, all model files and all other game logic unchanged.

This uses the existing `three` and Vite dependencies; no new npm package is required. The repository's standard `vite build` will build both `index.html` and `glb-model-review.html`.

## Use the visual review page

Open `/glb-model-review.html` on the game site after the updated build is available. The page fetches `/assets/models/model-catalog-audit.generated.json`, created by the Vite plugin. Select a GLB on the left; it loads in the 3D viewer. Drag to orbit, scroll or pinch to zoom, and use the animation selector if the asset includes animation clips.

Use the category dropdown and **ADD TO CATEGORY** / **REMOVE FROM CATEGORY** after visually inspecting the selected asset. The page only edits a browser-local mapping draft; it does not write back to the repository. **DOWNLOAD MAPPING JSON** exports `glb-catalog-overrides.json`, which must then replace the repository's `scripts/glb-catalog-overrides.json` file. Rebuild the game for the new catalogue to take effect.

The draft is stored in local browser storage and can be reset. **EXPORT INVENTORY CSV** downloads exact paths, file sizes, embedded names, and current category assignments.

## Interpretation

A GLB appearing and loading in the preview proves the file is being served and can be parsed by Three.js. It does not prove that every gameplay spawner places the model in the live world. Conversely, an error in this review page includes the exact path being requested so a missing file can be distinguished from a model-placement bug.

The scanner maps model candidates by their file paths, folder paths and embedded GLB metadata. Visual manual overrides are intended for ambiguous renamed models. Confirm that the model category is correct before exporting.

## Validation

The included tests cover renamed model discovery, catalogue transformation, exact-path overrides, URL-encoded spaces, invalid paths, and preservation of category entries when editing an override. Browser WebGL preview and production asset serving must be confirmed on the game site after the upgrade is installed.
