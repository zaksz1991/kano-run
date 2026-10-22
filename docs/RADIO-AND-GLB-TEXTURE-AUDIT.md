# Kano Life: deterministic radio paths and GLB texture audit

## Radio change

`js/audio.js` now uses one manifest-backed path, `/assets/models/audio/`, and maps the six UI stations to existing filenames in `ASSET-MANIFEST.csv`. It does not send `HEAD` requests or probe several directories/aliases. Radio tracks use `preload="none"` and begin loading only when playback is requested. Engine and horn audio paths are unchanged.

The Vision FM station currently uses `radio-kano.mp3`, preserving the existing fallback behavior after the absent `vision-fm.mp3` and `vision.mp3` candidates. If that file's programme/station identity is not correct, replace it only after confirming which supplied audio asset belongs to Vision FM.

## Read-only texture audit

Run from the project root:

```text
node scripts/audit-glb-texture-references.mjs
```

Optional custom model directory:

```text
node scripts/audit-glb-texture-references.mjs public/assets/models
```

The script reads GLB JSON chunks, identifies GLBs mentioning `colormap`, lists external image URIs, resolves them relative to each GLB file, and reports missing or out-of-root paths. It writes:

- `artifacts/glb-texture-audit/report.md`
- `artifacts/glb-texture-audit/report.json`

It never edits, moves, embeds, or deletes assets. Inspect the output before deciding whether any texture should be restored or embedded.

## Tests

The new `*.test.mjs` files verify direct radio paths, the absence of `HEAD` probing, lazy radio preloading, and the GLB JSON-chunk scanner using synthetic containers. They do not claim that real binary model files were scanned in this environment.
