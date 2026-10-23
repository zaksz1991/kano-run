# Kano Life — Step 89: Native CSS Module Import Repair

## Why this fixes the current startup failure

The latest runtime report shows that the Three.js bare-specifier errors no longer appear, but `/js/main.js` still fails to load. The repository's `js/main.js` contains a Vite-style side-effect import:

`import '../css/kano-responsive-upgrade.css';`

That works when Vite transforms the source. It does not work as a plain browser ES module: the browser tries to fetch the CSS URL as a JavaScript module, which causes the main entrypoint's module graph to fail before `Game` and `UI` are created.

This is a static-site-safe compatibility repair. It preserves the existing game modules and UI:

1. The replacement `index.html` keeps the Step 88 Three.js import map and all existing screens/module entrypoints.
2. It links `/css/kano-responsive-upgrade.css` as a normal stylesheet.
3. It maps the CSS URL used by the native `main.js` import to `js/KanoNativeCssImportShim.js`. The shim ensures the stylesheet exists and has no game-engine dependencies.
4. No `main.js` rewrite, `package.json`, Vite build, `harness` folder, or `boot.py` is required for this repair.

## Apply

1. In the root of `github.com/zaksz1991/kano-run`, replace `index.html` completely with the included `index.html`.
2. Add `js/KanoNativeCssImportShim.js` to the existing root `js` folder.
3. Commit both files to `main` and allow Vercel to publish the static files.
4. Reload the live page in a fresh tab and run the existing startup audit again.

## Verification performed

- Import-map JSON parsed successfully.
- Verified the import map appears before the page's module entrypoints.
- Verified the mapped target is the included shim file.
- Verified the original start controls, career screen, visual-upgrade entrypoint, and direct `/js/main.js` entrypoint remain in the complete replacement HTML.
- Verified that `../css/kano-responsive-upgrade.css` in `/js/main.js` normalizes to `/css/kano-responsive-upgrade.css`, the URL handled by the import map.
- Shim JavaScript syntax check passed.
- Three automated static regression tests passed.

## Limitations

An interactive browser test could not run in this workspace because browser navigation to the local test server was blocked by the environment. The public production site has not been redeployed from here, so live recovery is not claimed. This repair targets the confirmed remaining native-module incompatibility from the source. If a different missing dependency appears afterward, use the fresh browser diagnostic to identify it rather than replacing other game files speculatively.
