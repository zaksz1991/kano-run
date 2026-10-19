# Kano Life — Driver Model Audit & Alignment Upgrade

An additive Three.js helper for auditing existing GLB models, anchoring the player driver to the keke, suggesting camera framing, and showing a compact WebGL status line.

## Files
- `js/KanoDriverModelAudit.js` — complete module.
- `INTEGRATION.md` — integration guide and test checklist.

## Scope
This package does not include or modify the game's actual GLB assets and does not automatically change the live game. The developer must connect the module to the real loaded model roots and tune the seat anchor for the specific keke asset. It does not replace physics, camera smoothing, controls, or the existing render loop.
