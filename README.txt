KANO LIFE — MOBILE TRAFFIC INSTANCING FIX

Purpose
- Reduce mobile fallback traffic draw calls by batching vehicles of the same type into one THREE.InstancedMesh.
- Keep the player's keke and selected imported GLB traffic as ordinary scene objects.
- Keep traffic simulation, lane/depth state, model budget and vehicle collision ownership unchanged.
- Render only the same nearby mobile traffic that was previously eligible for display; distant vehicles remain simulated.

Files
- kano-run/js/renderer3d.js: complete replacement, incorporating the previous renderer3d.js optimization steps plus mobile fallback traffic instancing.
- kano-run/tests/KanoMobileTrafficInstancing.test.mjs: focused static regression checks (optional; no test run is required for installation).

Install
1. Extract this ZIP.
2. Copy the complete kano-run/js/renderer3d.js into the matching path in the existing project.
3. Keep all other project files, model assets, textures, and audio unchanged.

Validation performed here
- Node syntax check passed for the complete replacement.
- Focused static regression checks passed in an isolated temporary folder.
- ZIP integrity passed.
- No full app build, complete suite, or physical-phone benchmark was run. Instancing should reduce draw submissions for mobile fallback traffic, but actual frame-rate impact must be measured on the target phone.
