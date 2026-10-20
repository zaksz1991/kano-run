KANO LIFE — SIMULATION PRESENTATION REPAIR
==========================================

This additive compatibility package addresses the seven issues in the latest report:

1. Overall top score name and score not visible
   - Shows the current Overall #1 name and score in the HUD and on the start screen.
   - Uses /api/leaderboard?board=all&limit=1 when the global API is available.
   - Clearly falls back to PERSONAL BEST from local save if the global endpoint is unavailable.

2. Goat crossing had no animated goats
   - Adds a small herd of low-poly 3D goats to the existing goatCrossing event.
   - Animates their crossing path, legs, and head; the event still uses the game's existing choices.

3. KAROTA event had no visible patrol/animation
   - Places an existing KAROTA/police model when available, with visible flashing beacons and an officer gesture.
   - Creates a lightweight, animated roadside patrol fallback if the model is unavailable.
   - Does not turn Hisbah into KAROTA or merge their roles.

4. Morning routine played on every visit
   - START DRIVING now begins the selected game mode immediately.
   - REPLAY MORNING ROUTINE retains the existing animated routine as an optional start-screen action.

5. Environmental road noise overpowered the engine
   - Caps the generated rolling/road-noise gain after the original engine update.
   - Preserves the existing engine recording, horn and sound-effect interface.

6. Water seller had no animated roadside scene
   - Adds a roadside pure-water counter, displayed sachet/bottles, and a seller who gestures.
   - It uses an already-loaded character model if available, otherwise a custom lightweight animated vendor rig.

7. Motorcycles appeared too often and without a rider
   - Limits the spawned traffic mix to approximately 10% motorcycles and 40% keke (other vehicle types make up the balance).
   - Adds an animated rider to standalone motorcycle GLBs when the hierarchy does not advertise a rider.

8. Potholes looked static
   - Adds a pulsing edge-warning, loose rock chips and subtle animation to the existing pothole actor.
   - Keeps the gameplay collision rules and pothole impact logic unchanged.

INSTALLATION
------------
1. Add js/KanoGameplayPresentationRepair.js to the repository's js folder.
2. Replace the complete root index.html with the index.html supplied in this ZIP.
3. Leave game.js, ui.js, renderer3d.js, audio.js, ModelManager.js and storage.js unchanged.

HOW IT WORKS
------------
The new entry module installs small prototype wrappers before importing the original main.js.
This allows the existing Game, UI, Renderer3D and AudioManager systems to keep handling core gameplay.
It does not create a second game loop, renderer, storage system or event engine.

ASSET LIMITS
------------
The existing ModelManager catalog does not expose a dedicated goat or roadside pure-water seller model.
The package therefore creates lightweight, animated 3D goat actors and an animated vendor rig, using a loaded character model for the seller when available. KAROTA uses its existing model if available and a procedural patrol fallback otherwise.
These are scene actors, not replacements for future high-detail, rigged GLB assets. If the catalogue assets fail to load, some fallback geometry remains necessary.

The current overall #1 score requires the API response to include a row with a display name and score. If the global service is unavailable, the screen explicitly displays local personal best instead of falsely labelling it as a global record.

VALIDATION
----------
Syntax and HTML parsing are checked as package validations. The package has not been visually tested in the live game, and no claim is made that actual device performance or every GLB model has been verified.
