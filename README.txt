KANO LIFE — VERCEL BUILD REPAIR

ROOT CAUSE
The repository's current root package.json contains only:
  { "type": "module", "private": true }
It declares no dependencies. Vercel therefore reports `up to date`, installs no Vite executable,
and then fails at `vite build` with `vite: command not found`.

COMPLETE REPLACEMENT
Replace the entire package.json at the repository root with the package.json in this folder.
It declares Vite and Three.js, preserves ES module mode, includes normal Vite scripts, and selects
Node 24.x, which is supported by Vercel and meets current Vite runtime requirements.

WHY THREE.JS IS INCLUDED
js/renderer3d.js and js/ModelManager.js import `three`; ModelManager also imports
`three/addons/loaders/GLTFLoader.js`. These imports require the Three.js npm package.

WHAT NOT TO CHANGE
Do not replace index.html, game.js, renderer3d.js, ModelManager.js, vite.config.js, vercel.json,
or any model/audio assets for this repair.

BUILD SETTINGS
The log shows a direct `vite build` command, so adding the Vite dependency is the essential fix.
If the Vercel dashboard's Build Command is overridden, `vite build` will continue to work because
Vite is now a declared dependency. Alternatively, the package now defines `npm run build`.
Vite's default output directory is `dist`.

VALIDATION LIMITATION
The package.json was parsed and checked for required dependencies and scripts, and this ZIP was
validated. The full application build has not been run against the entire repository in this runtime.
After this replacement, check the next build log: dependency installation should install Vite, and
if another missing package or source error exists it will appear as the next specific error.
