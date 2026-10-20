# Kano Life — GLB Variant Activation Upgrade

This upgrade targets a concrete ModelManager limitation: `load(key)` selects the first successfully loaded GLB candidate for a category, stores a single wrapper in `cache`, and `getInstance(key)` clones that same wrapper. The catalogue can list many models while the live scene still repeats just one.

## What changes

- Keeps the first working GLB as the category's stable fallback.
- Loads a capped, rotating selection of additional candidates that are actually listed for each category by the build-time catalogue and/or `scripts/glb-catalog-overrides.json`.
- `getInstance(key)` cycles through successfully loaded variant wrappers, so separate building slots, traffic actors, pedestrians and props can use different existing model files.
- Uses conservative family budgets: mobile budgets are lower than desktop budgets, and a failed extra candidate restores its budget so other models can still be tried.
- Preserves existing category dimensions, orientation handling, the seated-driver behavior for keke models, and per-instance material cloning.
- Adds pool paths/readiness/budget information to `ModelManager.getStatus()` for diagnosis.
- Existing procedural fallbacks remain visible until the category's bounded variant pass completes. A category with one configured asset does not get blocked waiting for nonexistent alternatives.

## Install

1. Replace the entire existing `scripts/glb-catalog-sync.mjs` with the file in this ZIP.
2. Keep the already installed `vite.config.js` and `scripts/glb-catalog-overrides.json` unchanged. The override JSON can contain your own model mappings; this package does not overwrite it.
3. Keep `js/ModelManager.js`, `js/renderer3d.js`, `index.html`, and all GLB files unchanged. The Vite plugin applies the variant logic to `ModelManager.js` at transform time after inserting the catalogue generated from your real assets.

## What to expect

On preload, the primary category candidates load first. The variant pass then loads a bounded number of extra candidate files in a priority order that favours buildings, stalls, flyovers, pedestrians, and key traffic. Available variants are then selected in a round-robin pattern by `getInstance`. If a file fails, is rejected for dimensions, or is missing, the next candidate is tried and the original working asset remains available.

This is not a new asset pack. It uses only GLBs that already exist under `public/assets/models/` and have been assigned to a category. Ambiguous renamed assets still need the manual mapping file so that, for example, a shopfront is not mistakenly used as a generic building or traffic object.

## Validation

The included Node tests validate current renamed-filename discovery, manual mapping, transform integration, variant-pool injection, transform idempotency, and unsupported-source protection. They do not verify your deployed browser session or every model's visual suitability.
