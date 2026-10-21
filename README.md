# Kano Keke Life — Player Vehicle & Build Safety Upgrade

This package fixes two concrete problems found in the current repository source:

1. The checked-in `package.json` contains only a test script. Vercel runs `vite build`, but Vite is absent from declared dependencies. This replacement restores the Vite and Three.js dependencies and the `dev`, `build`, `preview`, and `test` scripts.
2. `scripts/glb-catalog-sync.mjs` discovers keke candidates from any model path containing “keke”. That can classify a human asset such as `characters/pedestrians/keke female.glb` as a player-vehicle candidate. A Vite post-transform guard restricts player-keke candidates to GLBs under `vehicles/` and excludes human-labelled paths.

## Files in this ZIP

- `package.json` — complete repository-root replacement.
- `vite.config.js` — complete replacement retaining the current model-review HTML input and catalogue plugin, with one additional safety plugin.
- `scripts/keke-catalog-safety.mjs` — new post-transform filter and audit-report correction.
- `tests/keke-catalog-safety.test.mjs` — regression tests.

## Installation

1. Replace the root `package.json` with the included complete file.
2. Replace the root `vite.config.js` with the included complete file.
3. Add `scripts/keke-catalog-safety.mjs` at that exact path.
4. Add `tests/keke-catalog-safety.test.mjs` at that exact path.
5. Keep `scripts/glb-catalog-sync.mjs`, `scripts/glb-catalog-overrides.json`, `js/ModelManager.js`, `js/renderer3d.js`, and all existing GLB assets unchanged.

The package uses Vite 8 and Three.js versions that exist in the npm registry at the time of preparation. Vite 8.3 requires Node.js 20.19+ or 22.12+; Vercel builds in this project should use Node.js 22.12+ or 24.x.

## Safety behaviour

If at least one safe vehicle model is found, only vehicle-path candidates remain in `CATALOG.keke`. If no safe vehicle GLB remains, the catalog is empty for that category and the game should retain its existing procedural keke fallback. This intentionally prefers a known fallback vehicle over displaying a human model as the vehicle.

## Validation

Run the included Node.js tests with the project test script after installation. JavaScript syntax and unit tests were checked during package preparation. A Vercel build and in-browser model rendering have not been run from this environment.
