KANO LIFE — STEP 12: MOBILE MODEL-PRELOAD BUDGET

Purpose
Reduce phone loading hitches by preventing several imported GLB models from
being fetched, parsed, and uploaded concurrently during initial startup or an
active driving shift.

Files included (complete replacements)
- kano-run/js/main.js
- kano-run/js/ModelManager.js
- kano-run/tests/KanoMobileModelPreloadBudget.test.mjs (focused regression test)

What changes
- On mobile, the player's keke is the only model category in the initial
  essential preload. The keke can be applied as soon as it is ready.
- Other mobile GLB categories keep their existing procedural fallback while
  they load later, one at a time, only while the game is not actively playing.
- The queue checks the game state between individual assets, not just between
  groups. Starting a shift stops the next model from starting. An already
  active fetch/parse is allowed to finish safely.
- ModelManager sequences multi-model preload requests on mobile and yields to
  the browser between assets. Desktop keeps its existing parallel preloading.
- No model, texture, audio, gameplay system, driving physics, or collision
  file is removed or modified by this package.

Install
Extract the ZIP at the root of the existing repository and replace only the
included files at the same paths. Keep all other files and all assets.

Validation performed here
- node --check on main.js and ModelManager.js: passed
- focused preload-budget source regression tests: 4/4 passed
- ZIP integrity: checked

Limitations
The full project test suite, production build, browser audit and physical-phone
benchmark were not run in this environment. This change targets overlapping
model-load work; it does not by itself prove the phone frame rate is fixed.
