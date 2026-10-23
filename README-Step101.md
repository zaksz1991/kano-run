# Kano Life — Step 101: Real Traffic Models & Directional Traffic Flow

## What this update fixes

Step 100 bundled authentic keke, okada and sedan GLBs and added a 40/30/30 traffic assignment rule. The older runner/renderer shape (`game.obs` and `Renderer3D.vehiclePool`) is different from the newer (`game.s.traffic`) shape, so the previous adapter could fail to assign traffic types or mount those models in that renderer. Step 101 adds an explicit compatibility layer for both shapes.

- In the legacy runner, newly spawned traffic is assigned from the same shuffled 4-keke / 3-motorcycle / 3-car batch.
- The existing vehicle pool mounts the loaded GLB under the current pool actor; procedural geometry remains as the fallback if an asset cannot load.
- The okada gets a seated procedural rider only when the loaded motorcycle hierarchy does not already contain a named rider.
- The left lane is treated as oncoming traffic; the centre and right lanes are same-direction traffic. Vehicles face the appropriate direction.
- Same-direction traffic closes toward the player more slowly than oncoming traffic, making lane flow visually distinct in the current runner presentation.
- No fare, wallet, saved-data, passenger, collision-handler, route, UI, or score schema is replaced.

This remains an arcade three-lane road representation. It is not a surveyed real-world traffic map or full rigid-body vehicle simulation. Model loading still depends on the bundled files being served from `/assets/models/` and on the app's configured Three.js imports.

## Installation

1. Download and extract `Kano-Life-Step101-Real-Traffic-Models-Directional-Flow.zip` using File Explorer.
2. Open `kano-step101-package`.
3. Copy its `js` and `public` folders into the root of the existing Kano Run project, merging folders and replacing matching files.
4. Keep the existing `index.html`, `main.js`, `game.js`, `ui.js`, `renderer3d.js`, and saved game data unchanged. The complete replacement `js/KanoModelAssetVisualUpgrade.js` adds the Step 101 import after the existing traffic-composition hook.

## Runtime audit

After the game starts and traffic appears, use browser DevTools:

```js
window.kanoTrafficRuntimeIntegrationAudit()
```

Inspect `trafficCounts`, `trafficFlow`, `modelStatus`, `modelPaths`, `visibleGLBActors`, and `visibleFallbackActors`. The audit reports actual cache/mount status rather than assuming the GLBs are visible.

## Verification status

- Focused Step 101 tests: 10 passed, 0 failed.
- Cumulative automated tests: see `TEST-OUTPUT-Step101.txt`.
- JavaScript syntax validation: performed on the changed modules and dependency-free rules.
- ZIP integrity: checked after packaging.
- Production build and interactive browser visual test: not performed in this environment.

The source-level checks do not establish the visual result on the live site. Confirm the model orientation, model loading, and traffic flow in a running game before treating the visual change as verified.
