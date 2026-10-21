# Kano Keke Life — Deep Gameplay Root-Cause Repair

This is an additive repair layer aimed at the problems reported with the existing GLB models and gameplay presentation. It does not replace the game's large presentation/workshop module, catalogue scanner, manually selected model mappings, GLB files, or gameplay economy.

## Included files

- `index.html` — complete existing game HTML with one additional module script registered before the current GLB visual/presentation startup module.
- `js/KanoLifeRootCauseRepair.js` — new full module implementing the repairs and diagnostic report.
- `tests/root-cause-repair.test.mjs` — static regression checks for file order and important integration hooks.
- `test-results.txt` — result of the local static checks.

## What this targets

### Keke model fit
Each loaded `keke` template is inspected independently. The repair checks dimensions, detects models whose width is significantly longer than their depth, rotates those candidates onto the game's road-length axis, and recentres the visible model against the ground. A per-model report records the applied rotation and bounds. This is a cautious heuristic, not an artist-authored calibration; models whose mesh convention differs need to be checked in the audit panel.

### Reduce recurring animation discovery work
The existing animated-root discovery pass is cached for at most 180 ms and invalidated when the main actor collections or life-scene structure change. Mixers themselves continue updating every frame. On touch/mobile-sized screens, non-player cloned GLB meshes stop casting/receiving shadows to reduce extra render passes; keke shadows are not changed by this rule.

### Passenger boarding and driver's daily scenes
When a passenger's boarding/walking actor is created, the repair tries to attach an already-loaded model from the project's existing character categories. If none is loaded, it asks the existing `ModelManager` to load one preferred category at a time and then tries compatible configured fallbacks. A successful imported actor replaces primitive body/limb meshes; the underlying pickup/drop timing and game logic remain unchanged.

The same technique can replace primitive morning-life actor bodies when an existing pedestrian/passenger model is available. Existing actions such as sweeping, selling food and drawing water continue to be driven by the current scene update system. Imported skeletons receive low-amplitude, name-based arm/leg motion where possible, rather than assuming that every asset has the same rig convention.

### Pure-water seller
The repair keeps the existing table, sachets, proximity checks, horn purchase, wallet deduction and effects. It attempts to replace the procedural body/head with an existing loaded/available character model and adds a restrained selling gesture. If no usable character model loads, the audit says so and leaves the old placeholder intact rather than deleting the vendor.

### Goat crossing
The repair scans `assets/models/model-catalog-audit.generated.json` for an existing goat GLB using the file path and GLB hints. When found, it replaces the procedural goat actors in the existing crossing event and plays a suitable embedded walk/run/trot clip if present. If no goat can be identified from the inventory, it reports that fact. It does not invent or download a new model.

### Collision feedback and visible condition wear
The existing `Game.hit()` and `Game.hitPothole()` methods remain authoritative and are each called exactly once. The repair adds only short-lived impact particles and chassis shake. It derives a subtle material wear tint from the game's current body, engine and tyre condition values and restores original materials when condition returns to full. This is visual condition feedback, not mesh deformation or a full rigid-body simulation.

## Installation

1. Open `index.html` in the GitHub browser editor and replace the entire file with the included complete version. It preserves the current markup and adds `/js/KanoLifeRootCauseRepair.js` before `/js/KanoModelAssetVisualUpgrade.js`.
2. Add `js/KanoLifeRootCauseRepair.js` at that exact path using the complete file in the ZIP.
3. Leave every other file unchanged, especially `js/ModelManager.js`, `js/renderer3d.js`, `js/KanoGameplayPresentationRepair.js`, `scripts/glb-catalog-sync.mjs`, `scripts/glb-catalog-overrides.json`, and all GLB assets.

## Diagnostics

Open the game with `?rootCauseAudit=1` added to the game URL. The temporary panel displays the active player model path and dimensions, loaded model categories, whether passenger/life/vendor GLBs attached, goat discovery status, damage feedback status, and animation-root scan/cache counts. Use **DOWNLOAD JSON** to export the full report. The normal game URL has no diagnostic overlay.

The report is also available from the browser console via `window.kanoLifeRootCauseAudit()`; `window.downloadKanoLifeRootCauseAudit()` downloads the JSON report.

## Limits / honesty

- The audit module has not been run inside your live Vercel browser session in this environment.
- The renamed-model inventory must contain a goat filename or internal GLB hint containing a goat-related term for automatic goat discovery. An opaque renamed filename with no identifying metadata will be reported as not identified; the module will not guess a random animal model.
- The character replacement requires a valid loaded asset in a configured character category. If none loads, the fallback remains in place and the report shows that status.
- Visual damage is a material tint plus impact effects, not true body-panel deformation. Full physical deformation requires a vehicle model with separable parts or a mesh designed for deformation and a real physics/collision design.
- The mobile shadow change reduces shadow rendering cost but may make some non-player props appear flatter. It preserves existing geometry and textures.
- Static code checks can verify syntax and integration hooks, not actual asset availability, model orientation, browser playback, Vercel build, or device frame rate.
