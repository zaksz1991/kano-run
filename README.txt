KANO LIFE — 3D MODE ASSERTION FIX

This ZIP contains complete replacement files:
- tests/static.test.js
- tests/Kano3DStaysOn.test.mjs
- package.json

What changed:
1. The saved-quality regression test now checks userSelected2D = quality === '2d', the current setting handler's explicit 2D choice, and the initial selection logic. It verifies that saved 2D is read before the initial WebGL start and that ?force3d overrides a saved 2D preference.
2. The context-loss and frame-error tests now check the current 3D rebuild implementation instead of obsolete identifiers/branches.
3. package.json restores the browser:audit script and declares Playwright 1.64.1. Existing check/test/build/release/assets/audio scripts are preserved.

Install:
Extract into the repository root and replace the listed files. Do not replace public assets.
Then run `npm install` so package-lock.json matches package.json, followed by `npm test`, `npm run check`, and `npm run browser:audit`.

No GLB, texture, audio, save or other user data is included or modified.
