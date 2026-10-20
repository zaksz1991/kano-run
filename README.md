# Kano Keke Life — GLB Scene Activation & Runtime Audit Upgrade

This follow-through upgrade changes the existing renderer as well as the build-time GLB catalogue/variant plugin. It uses existing model files only.

## What it addresses

- The renderer was only replacing two of its ten existing building slots with GLBs on mobile. The transformed renderer now allows every existing building slot to be replaced when its category has a loaded model.
- Mobile building-frontage centres are moved modestly closer to the road without placing the small procedural building footprint deliberately inside the lane.
- Building GLBs were scaled down to a minimum of 2.2 world units by the legacy placeholder slot heights. GLB display height now uses a more realistic architectural minimum while retaining some variation by slot.
- Mobile never created streetlight slots, so `roadlight` models could not replace streetlight fallbacks. The renderer now creates three rows per side on mobile and six rows per side on desktop, allowing existing roadlight models to activate.
- Mobile now has six roadside prop slots (one more than before), increasing opportunities for a mapped market-stall variant to appear while keeping all slots within the world loop.
- Adds `?assetAudit=1` on-screen diagnostics for active GLB paths versus procedural fallbacks, actor counts, position, bounds and model-manager status. The panel refreshes every 2.5 seconds and can export JSON.

## Install

1. Replace the entire `scripts/glb-catalog-sync.mjs` with the file in this ZIP.
2. Do not replace `vite.config.js`, `scripts/glb-catalog-overrides.json`, `js/ModelManager.js`, `js/renderer3d.js`, `index.html`, `package.json`, or any GLB assets.
3. Preserve the repository's existing `scripts/glb-catalog-overrides.json` so your actual renamed-model assignments remain intact.
4. Use the model-audit query parameter after the updated build is running: `?assetAudit=1`. The panel is intentionally hidden without this parameter.

The Vite plugin transforms both `js/ModelManager.js` and `js/renderer3d.js` at build time. The source files themselves do not need manual edits.

## Audit use

The on-screen panel shows the number of currently attached GLB actors and procedural fallbacks, groups them by kind, lists active asset paths, and provides a `DOWNLOAD JSON` control. If a type still has only fallback actors, inspect the generated model catalog audit and mapping file; an empty or invalid category cannot be activated by a renderer change alone.

## Validation

The included tests cover renamed asset discovery, manual category overrides, invalid paths, model-variant transformation, renderer activation, audit insertion, idempotency and JavaScript syntax. They do not constitute live-browser or Vercel deployment testing.
