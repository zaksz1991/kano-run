KANO LIFE — STEP 20: CACHED LIFE-SCENE TRAVERSAL FIX

WHY
The lazy-scene update prevents all story scenes from being constructed at startup, but after scenes are visited they stay parented under lifeDioramaRoot and are only set invisible. Three.js still traverses descendants during world-matrix updates even when an ancestor is invisible. This step keeps only the currently active life scene attached to the scene graph.

FILES
- kano-run/js/renderer3d.js — complete replacement, based on the Step 19 renderer snapshot shared in this conversation.
- kano-run/tests/KanoCachedLifeSceneMount.test.mjs — focused tests for detaching/caching life scenes.
- kano-run/tests/KanoLazySceneBuild.test.mjs — updated regression test so it checks the new detach behaviour rather than expecting the old hide-only behaviour.

BEHAVIOUR
- While driving or inside the garage, cached life-scene groups are detached from the render graph but remain in the lifeSceneGroups Map with their geometry, materials, actors and state retained.
- When a routine is selected, its cached group is attached and made visible; other groups are detached.
- Revisiting a routine reuses the existing group; it does not rebuild or dispose the scene.
- This targets scene traversal CPU work after multiple life scenes have been visited. It does not claim to fix every source of mobile GPU lag.

INSTALL
Extract the ZIP into the existing kano-run folder. Replace only the included files at their matching paths. Keep all other source files, models, textures and audio unchanged. This replacement is based on the latest Step 19 renderer snapshot available in this conversation; it cannot preserve unrelated edits that exist only in your local folder and were not shared here.

VALIDATION
The changed renderer passed node --check. Four focused cache-mount tests and five lazy-scene regression checks passed in the assembled validation environment. The full project test suite, production browser audit and physical-phone performance were not run or claimed as verified.
