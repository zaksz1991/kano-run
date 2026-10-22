KANO LIFE — STEP 3 SOURCE DELIVERY PREPARATION

Merge the included files into the existing kano-run project; replace files when prompted. Do not remove public assets.

Included source changes:
- MeshoptDecoder is configured for every GLTFLoader call site through js/createGLTFLoader.js. Existing uncompressed GLBs remain supported.
- The existing PWA manifest/service worker are wired into index.html and js/main.js.
- Vercel immutable caching is scoped to hash-named top-level JS/CSS bundles; model caches remain revalidating.
- Two optional ground-texture URLs now match their actual public paths.
- scripts/audit-public-references.mjs and `npm run assets:audit` write a non-destructive report under artifacts/public-reference-audit/.

Important: the ZIP contains no model, texture, or audio binaries. Meshopt-compression, texture conversion, high-poly replacement, and audio re-encoding are therefore NOT performed in this ZIP and remain NEEDS ASSETS. No files are moved or deleted.

After merging: run npm test, npm run check, npm run build, npm run release:verify:dist, npm run assets:audit, then re-run the browser audit. Review docs/STEP3-PUBLIC-REFERENCE-CANDIDATES.md; approve any asset moves explicitly before moving anything.
