# Kano Life — Step 88: Static Three.js Import Map Repair

## Confirmed startup cause

The live runtime report shows that `/js/main.js` fails because the browser cannot resolve the bare module specifier `three`. The source is served as native browser ES modules on the static site, but the HTML has no import map. The outer message `Failed to fetch dynamically imported module: /js/main.js` is a consequence of the unresolved dependency, not proof that `main.js` itself is missing.

## Change

This package contains a complete root `index.html` replacement based on the current public repository markup. It adds an import map in the document head, before any module scripts. It maps:

- `three` to the pinned Three.js module `0.186.1`;
- `three/addons/` to the version-matched `examples/jsm/` directory for GLTFLoader, SkeletonUtils, and related addons;
- `three/` to the same pinned package root for any other Three.js subpath imports.

The existing game's DOM IDs, startup panels, settings controls, module entrypoints, and stylesheet references are retained. No `package.json`, Vite build, harness, or `boot.py` is needed for this browser-side fix.

## Apply

1. Open the `kano-run` repository on GitHub.
2. Open the root `index.html` and choose Edit.
3. Replace the entire file with this package's `index.html` and commit it to `main`.
4. Open the new Vercel deployment and reload with a hard refresh. Check the runtime audit.

## Verification and limits

- The HTML and embedded import-map JSON were validated locally.
- The map is placed before every module script, as required for browser import-map resolution.
- The live page, external CDN availability from every user's network, and a new Vercel deployment were not tested here.
- The import map introduces a pinned runtime dependency on jsDelivr. The 3D module graph needs access to that CDN; if the CDN is blocked, the game may continue to run only if its current 2D fallback path is usable.
