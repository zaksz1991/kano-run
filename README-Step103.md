# Kano Life — Step 103: Seated Driver Motion & Steering

## Install

1. Extract `Kano-Life-Step103-Seated-Driver-Motion.zip` using File Explorer.
2. Open `kano-step103-package`.
3. Copy the package's `js` and `public` folders into the existing Kano Run project, merging folders and replacing matching files.
4. Keep `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, `ModelManager.js`, controls, collision logic, route state and saved browser data unchanged.

This update builds on Steps 92–102 and includes their support files and bundled vehicle assets.

## What changes

- Adds small, continuous upper-body movement to the seated keke driver.
- The driver's head and arms respond to the existing steering input; the torso leans subtly while turning.
- Reverse mode changes the driver's posture and head orientation.
- Crash shake adds a small torso response instead of changing vehicle physics.
- Keke drivers in the traffic pool receive limited movement tied to their existing traffic speed factor. Parked checkpoint kekes receive only subtle idle movement.
- A renderer audit reports whether the player rig was found and animated, plus the number of traffic and parked rigs updated.

The adapter is self-contained and uses the rig already created by the current ModelManager implementation. It does not need a new ModelManager export. It loads before `KanoGameplayPresentationRepair.js` imports `main.js`, preserving the established startup ordering.

## Runtime audit

After starting the game and allowing the player GLB to load, run this in browser DevTools:

```js
window.kanoSeatedDriverMotionAudit()
```

The audit reports rig counts, player/traffic/parked animation counts, last frame delta, normalized speed, steering value, reverse state, and recent adapter errors.

## Scope limits

This is a pose/motion improvement, not a new rig or high-detail character generation. It does not change vehicle position, route navigation, fare handling, collision logic, speed rules or the underlying model geometry. It only animates the specific `KANO_SEATED_DRIVER_RIG` included by the bundled keke model pipeline; other GLBs without that rig are left unchanged. The visual result has not been browser-tested in this environment.

## Verification

- Automated tests: run `node --test tests/*.test.mjs` from the package root.
- ES-module syntax checks cover the included JS and MJS files.
- ZIP archive integrity is checked after packaging.
- A production build and live interactive browser test have not been run in this environment.
