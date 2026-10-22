KANO LIFE / KANO RUN — STEP 29
Mobile sidewalk pedestrian spacing and crowd-loop fix

WHY THIS UPDATE
The mobile crowd alternated pedestrians between left and right sidewalks while increasing depth by one spacing value for every person. That means each individual sidewalk had only half the intended density: a low-tier sidewalk repeated every 38 metres and a mid/high-tier sidewalk every 32 metres. The crowd could look sparse even with all listed pedestrian actors present.

WHAT CHANGED
- Pairs each left- and right-side pedestrian at the same depth row on mobile.
- Calculates the mobile pedestrian loop using rows per sidewalk, so the shorter loop matches the paired layout.
- Leaves desktop crowd placement and loop length unchanged.
- Does not add new models, actors, geometry types, GLB promotion slots, or per-frame draw calls.
- Retains the device-tier pedestrian count, static-mesh merging, arm animation, distance culling, and recycling behavior.

FILES
- js/renderer3d.js — complete replacement file.
- tests/kano-pedestrian-sidewalk-spacing.test.mjs — new regression tests.
- tests/KanoStep28RendererMerge.test.mjs — retained Step 28 regression test.
- tests/KanoLazySceneBuild.test.mjs — retained lazy-scene regression test.
- tests/KanoMobilePedestrianMeshMerge.test.mjs — retained mobile-mesh regression test.
- TEST-STATUS.txt — validation summary.

INSTALLATION
Extract the ZIP into the root of the existing Kano Run project, assuming the Step 28 renderer merge is already installed. Replace js/renderer3d.js with the complete file. Keep all other game files, assets, and previous Step 26/27 upgrades unchanged. No code snippets or partial replacements are required.

LIMITATIONS
Source-level tests and JavaScript syntax checks do not confirm visual placement on a live browser. This update has not been rendered in a browser or measured on a physical phone.
