# Kano Life — Step 102: Real Player Keke & Startup Integration Fix

## Download and install

This is an additive update for the existing static Kano Run project. It does not require a `harness` folder, `boot.py`, terminal-based installation, or replacement of the core game files.

1. Extract `Kano-Life-Step102-Real-Player-Keke-Startup-Fix.zip` in File Explorer.
2. Open `kano-step102-package`.
3. Copy the included `js` and `public` folders into the root of the existing Kano Run project, merging folders and replacing matching files.
4. Keep the current core `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, `ModelManager.js`, controls, storage and saved browser data unchanged.

The included `public/assets/models/vehicles/` folder retains the real keke, okada and sedan GLBs bundled in Step 100/101. The current project must retain its existing `ModelManager.js` and Three.js dependencies, which are part of the application and are not replaced by this incremental package.

## What Step 102 changes

### 1. Fixes prototype-hook startup order

The Step 100 traffic-composition module, Step 101 traffic-model integration module, and Step 102 player-keke integration module now load **before** `KanoGameplayPresentationRepair.js` imports `main.js`. Previously, Step 100/101 were listed after that nested import, so their `Renderer3D.init` hooks could miss an already-created renderer. Installing them first lets the GLB model manager, vehicle-pool hooks and player mount logic register before the live renderer is instantiated.

### 2. Uses the actual keke GLB for the player vehicle

The existing player root remains unchanged, preserving the current lane controls, root position, camera relationship, shadow and game state. When `ModelManager.load('keke')` completes, the bundled `keke-3.glb` is cloned into that root. The procedural body remains visible while the GLB loads and remains as fallback if loading fails.

### 3. Keeps the seated driver inside the vehicle

The ModelManager's existing driver-rig logic adds a seated driver when the keke source model has no recognised embedded driver. The new audit checks that the driver rig is a descendant of the actual player keke model rather than a standalone roadside person.

### 4. Paint selection compatibility

The player vehicle continues to accept the existing paint-selection calls. The adapter recolours eligible untextured body/panel materials by name while avoiding the seated driver's clothing, wheel, glass and metallic materials. Textured vehicle materials preserve their authored appearance.

### 5. Runtime audit

After the game starts, run this in the browser DevTools console:

```js
window.kanoPlayerKekeModelAudit()
```

It reports whether the real GLB is mounted, the model path, whether the player keke is inside the existing player root, the seated-driver rig status, fallback status, paint targets and any model-load error. Existing audits remain available, including `window.kanoTrafficRuntimeIntegrationAudit()` and `window.kanoRealKekePassengerPoseAudit()`.

## Scope limits

This step integrates the player vehicle model into the currently available runner and fixes startup-hook order. It does not replace the core collision/road simulation, generate new high-detail models with InstantMesh, or claim full wheel physics. Textured GLB materials may not respond to existing paint options when no suitable untextured body material is identifiable. A visual check in the running game remains necessary to confirm that the imported vehicle's authored forward orientation and model-specific seat placement look correct.

## Verification

- `node --test tests/*.test.mjs`: **46 passed, 0 failed**.
- JavaScript ES-module syntax checks: all included `.js` and `.mjs` files passed.
- ZIP archive integrity: checked after packaging.
- Production build: not run in this environment.
- Live browser visual test: not performed.

The automated checks verify source/bootstrap structure and the required asset's presence. They do not establish how the model appears in the live browser.
