The runtime smoke test uses a small mock config solely to exercise the real storage.js implementation without a browser.
Run from tests/runtime with Node.js: node storage-smoke.mjs
It verifies checkpoint round-tripping through the existing kano-life-save-v4 key, top-three sorting, and wallet banking.
It does not simulate the full Three.js renderer or browser UI.
