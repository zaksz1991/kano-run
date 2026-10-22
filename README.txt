KANO LIFE / KANO RUN — STEP 27
GLB-first goat crossing fallback

PURPOSE
The cultural events module previously created a goat crossing only when the
asset inventory contained a valid goat GLB. The current inventory does not
list a goat model, so the event can be absent from the road scene. This update
keeps the real-GLB path as the preferred option and adds an articulated,
procedural goat only when the model inventory is empty/unavailable or the GLB
fails to load or has invalid bounds.

WHAT CHANGED
- Keeps existing real-goat GLB discovery and loading as the first choice.
- Adds a recognizable low-poly goat fallback with torso, raised neck, head,
  muzzle, eyes, ears, horns, tail, four legs and hooves.
- Animates the fallback leg pivots during the existing goat crossing event.
- Keeps the existing crossing timing, roadside travel, cultural events,
  passenger/fare logic, vehicle collision rules and other game systems intact.
- Adds diagnostics that distinguish GLB-loaded and procedural-fallback states.
- Cleans up fallback geometry and materials when the scene upgrade is disposed.

INSTALLATION
1. Extract this ZIP into the root of your existing kano-run project folder.
2. Allow js/KanoCulturalStreetEventsUpgrade.js to be overwritten with the
   complete replacement file.
3. Keep tests/kano-cultural-street-events.test.mjs (updated existing test) and
   tests/kano-goat-fallback.test.mjs (new regression test).
4. No other runtime files need to be replaced for this update. Do not replace
   main.js, game.js, renderer3d.js, KanoSceneUpgrade.js, or CSS for Step 27.

BEHAVIOR
The goat crossing still starts after the existing in-game delay and only while
playing the road scene. If a valid real GLB exists, it is used instead of the
fallback. The fallback is not an external asset and is not claimed to be a
photorealistic scanned model.

LIMITATIONS
- JavaScript syntax and focused source-level regression tests pass.
- No browser screenshot or physical-phone render was available in this run.
  The goat's appearance and phone frame-time impact still require visual review.
