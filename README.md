# Kano Keke Life — World Performance, Instancing & Brightness Upgrade

## Purpose

This upgrade targets concrete renderer costs visible in the current source:

- The world creates many separate lane-marking meshes and updates each one every frame.
- Desktop procedural buildings create one separate mesh/material for each window.
- Day/night atmosphere exposure and lighting were conservative, matching the dark/flat look in the supplied screenshot.

The upgrade batches repeating road markings into one `THREE.InstancedMesh`, batches windows per procedural building, and applies a modest stable lift to existing daylight lighting. It does not replace or rename any GLB assets and does not modify fares, vehicle damage, collisions, traffic rules, or progression.

## Files

- `index.html` — complete replacement that loads the performance hooks before existing root-cause and GLB presentation modules.
- `js/KanoWorldPerformanceInstancingUpgrade.js` — new runtime patch.
- `tests/kano-world-performance-upgrade.test.mjs` — Node regression checks.

## Installation

1. Replace the repository-root `index.html` with the included complete file.
2. Add `js/KanoWorldPerformanceInstancingUpgrade.js` at that exact path.
3. Add `tests/kano-world-performance-upgrade.test.mjs` at that exact path.
4. Keep `package.json`, `vite.config.js`, all other game files, model mappings and GLB assets unchanged.

## Diagnostics

Open the game with `?worldPerfAudit=1&debugPerf=1` added to the address. The world audit reports lane-marking batches, desktop window batches, lighting profile, WebGL draw calls and triangle count. Use **EXPORT JSON** to save the report.

The normal game URL is not forced into 3D mode. The existing fallback remains available if WebGL is unavailable or the game encounters a serious runtime issue.

## Validation

The included tests check module syntax assumptions, instancing integration, stable lighting calculations, load ordering, and preservation of important page IDs. Actual device frame rates and visual appearance must still be checked in the browser; source-level tests cannot guarantee a specific FPS gain on every device.
