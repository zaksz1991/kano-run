# Kano Life — Step 99: Natural Passenger Poses & Real Checkpoint Kekes

## What this update changes

- Replaces legacy single-pickup character actors with the existing articulated, arm-down character rig, preventing a bundled unrigged passenger model with outstretched arms from being used for the roadside waiting pose.
- Keeps general checkpoints at four distinct waiting characters on mobile and six on desktop, using the existing Step 92 crowd layer.
- Ensures the sidewalk walker set is created when the road renderer becomes active even if the renderer did not call the expected build hook during initialization. The existing gait now also runs if the scene has no explicit `lifeScene` label; explicitly non-road scenes are left alone.
- Replaces the two procedural parked checkpoint kekes with real instances from the project's ModelManager `keke` GLB once that model is available. It preserves the bay placement and orientation and records the resolved asset path on each clone.
- Adds `window.kanoRealKekePassengerPoseAudit()` to inspect sidewalk actors, single-passenger poses, checkpoint passenger counts, parked-keke GLB usage and errors.

## Installation with File Explorer

1. Download and extract `Kano-Life-Step99-Natural-Passengers-Real-Checkpoint-Kekes.zip`.
2. Open `kano-step99-package/js`.
3. Copy the package's `js` folder into the existing Kano Run project's `js` folder. Merge folders and replace matching files.
4. Copy the package's `public` folder into the existing project's root as well. Merge folders and replace the matching keke model if prompted.
5. Keep `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, `ModelManager.js`, and saved browser data unchanged.

The package is cumulative and includes the visual/navigation modules required by the Step 99 bootstrap. It also includes the exact `public/assets/models/vehicles/keke/keke-3.glb` file used by the existing ModelManager candidate list, so the real checkpoint-keke replacement does not depend on a separate asset download.

## Runtime check

In browser DevTools, run:

```js
window.kanoRealKekePassengerPoseAudit()
```

Expected when the current route has a general checkpoint visible: `realKekes` should equal the number of parked kekes at that checkpoint after the `keke` model has loaded; the crowd count should be 4 on mobile or 6 on desktop; sidewalk count should be greater than zero. A GLB swap is deferred until ModelManager reports the `keke` model in its cache, so the audit can temporarily show zero real checkpoint kekes while it is loading.

## Accuracy and limitations

- The checkpoint vehicles use the actual bundled keke GLB through ModelManager; the Step 99 character fallback remains procedurally articulated because the packaged human GLBs are unrigged and do not contain a usable walk-cycle animation.
- The update does not run TencentARC InstantMesh, create new photorealistic assets, or convert the continuous road into a surveyed open world.
- A production Vite/Vercel build and live interactive browser test were not available in this workspace. Automated checks below are source-level checks and do not prove final on-device appearance.

## Validation

- Focused regression tests: included in `tests/`.
- JavaScript syntax checks: recorded in `SYNTAX-STATUS-Step99.txt`.
- ZIP integrity and SHA-256: recorded alongside the package.
