# Step 3 — Performance and Delivery Status

## Source changes in this update

- All seven direct `GLTFLoader` call sites now use `createGLTFLoader()`, which registers Three.js `MeshoptDecoder` support. Existing uncompressed assets remain compatible. No GLB has been recompressed in this source-only update.
- Wired the existing PWA manifest and service worker into `index.html` and `js/main.js` and linked the Apple touch icon.
- Added one-year immutable cache headers for Vite-style hash-named JS/CSS bundles in `vercel.json`; existing model stale/revalidate rules remain separate.
- Corrected two fallback-texture request paths to `public/assets/models/environment/ground/`.
- Added `scripts/audit-public-references.mjs` to inspect the actual working tree and write a cautious candidate list. It never moves/deletes files.
- The existing renderer already uses `InstancedMesh` for repeating lane marks and building windows; a measured scene-wide draw-call cap/static-geometry merge has not been implemented or verified by this source-only update. It should be tuned against the real models and browser measurements rather than guessed.

## Binary asset work — needs assets

The supplied `kano-run-source.zip` contains the 128-row asset manifest, but not the actual model, texture, or audio binaries. Compression and visual verification cannot be performed on path/size metadata. Specifically:

- Meshopt-encode appropriate GLBs; compare geometry/animation fidelity and target player keke under 3 MB.
- Convert eligible textures to WebP/KTX2 at 1024 px or below where suitable, while preserving the three distinct palette textures required by the city-kit models.
- Inspect high-poly assets and replace only confirmed oversized, visually unneeded props with low-poly equivalents/decals.
- Re-encode audio to 64–96 kbps Opus with a compatible fallback and validate each resulting file. Radio playback already sets `preload = 'none'` and avoids directory-probing requests.

## Non-destructive asset review

Run `node scripts/audit-public-references.mjs` against the complete local repository after merging these files. Review `artifacts/public-reference-audit/report.md` before moving any candidate to `art-source/`. No asset relocation or deletion is included in this update.

## Tests and remaining verification

This source snapshot excludes binary assets and the currently installed `node_modules`. Run `npm ci`, `npm test`, `npm run check`, `npm run build`, `npm run release:verify:dist`, and the full Playwright audit locally. Browser audit results supplied before this update were 8/8 clean scenarios; they do not verify this new service worker/decoder wiring.
