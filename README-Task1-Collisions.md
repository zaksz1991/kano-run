# Kano Life — Task 1: Collision Contact Alignment

## Base

This change was prepared against the current public `main` source files viewed from GitHub on 24 October 2026. It does not use any earlier generated ZIP or snapshot as a source base. The bootstrap addition is applied to the current `js/KanoTrafficMix.js`; the existing traffic selector logic is retained verbatim.

## Changed files

- `js/KanoTrafficMix.js` — adds a bootstrap call to the new collision-contact module. Its existing traffic-selector exports remain unchanged.
- `js/KanoCollisionContactUpgrade.js` — new: synchronizes the existing swept collision test with the same eased lateral position used by `Renderer3D`, and increases post-impact vehicle separation to account for the existing vehicle-width table.
- `tests/KanoCollisionContactUpgrade.test.mjs` — new focused tests.

No protected file is included or overwritten. No file under `public/` is included. The feature set is unchanged.

## Why this targets the reported symptom

The current `Renderer3D.draw()` eases the player's X coordinate toward a target each frame (with a 50 ms delta cap and factor `dt * 5.8`). The current `Game.moveTraffic()` compares collisions against the immediate steering target instead of the eased player position. During lane changes those coordinates can differ, so a visible overlap can miss the collision test. The existing collision-kick offset also peaks at `0.92`, which can be less than the summed half-widths of the keke and another vehicle. The adapter uses the prior rendered-X estimate for collision testing, advances its estimate using the same easing rule after the existing simulation call, preserves collision steering nudges, and computes a model-aware kick.

## Verification

- Focused `node --test tests/KanoCollisionContactUpgrade.test.mjs`: 6 passed, 0 failed.
- Syntax checks: the new module, updated `KanoTrafficMix.js`, and the test file all passed `node --check`.
- Full repository `npm test`: not run in this environment because the environment cannot clone/download the latest repository, and the current GitHub repository root does not expose a `package.json`.
- Live browser / phone test: not verified.

This update does not claim that the full regression suite passes or that a real-device collision has been verified. It is an isolated Task 1 update and stops before pedestrian, fuel-station, or flyover changes.

## Install

Extract the ZIP and merge its `js` folder with the current project `js` folder. Replace `KanoTrafficMix.js` and add `KanoCollisionContactUpgrade.js`. Add the new test file under `tests/`.
