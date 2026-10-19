# Kano Life — Dynamic Weather & Day/Night Atmosphere Upgrade

## What's added

- **Night lighting profile** based on `game.s.night`.
- **Harmattan haze and suspended dust** when `game.s.environment === 'harmattan'`.
- **Rain streaks** when `game.s.environment === 'rainPuddles'`.
- **Subdued overcast lighting** for muddy and bad-road events.
- **Mobile-aware fixed particle pools** (86 rain streaks / 64 dust particles on mobile; 190 / 142 on desktop).
- **Safe render-wrapper composition** with the existing cinematic camera; scene colors and light values are restored after each WebGL render.
- **No additional game state, collision, traffic, fare, or audio simulation**. `Game` remains the gameplay authority.
- `?disableAtmosphere=1` disables atmospheric effects for comparison. `?disableCameraFX=1` disables camera polish. `?fixedQuality=1` disables adaptive render-resolution changes.

## Install

1. Back up the repository.
2. Extract this package at the `kano-run` repository root and merge its `js/` directory.
3. Replace `js/main.js` with the supplied complete entry point.
4. Add or replace `js/KanoAtmosphere.js`, `js/KanoCinematicCamera.js`, and `js/KanoAdaptiveQuality.js`.
5. Keep the existing `index.html`, `game.js`, `renderer3d.js`, `renderer2d.js`, `ModelManager.js`, `KanoProductionBridge.js`, `KekeDynamics.js`, `KanoVisualEffects.js`, `LiveUserCounter.js`, `KanoSceneUpgrade.js`, `KanoAnimationTrafficUpgrade.js`, `KanoPerformanceMonitor.js`, `ui.js`, `controls.js`, `audio.js`, `storage.js`, CSS, models, and other assets.
6. Do not replace `package.json` or `package-lock.json` for this upgrade.

The supplied `main.js` retains the previously integrated scene, coin/smoke, live-user, traffic, Keke dynamics, animation, cinematic-camera, adaptive-quality, model-audit, and performance-monitor hooks. It expects those existing companion modules to be present in the repository.

## Verify

From the repository root, run:

```bash
npm run check
npm test
npm run build
```

Then test `https://kano-run.vercel.app/` on desktop and on a real phone. For diagnostics:

- `?debugModels=1` — show model auditing.
- `?debugPerf=1` — show frame-time and renderer counters.
- `?disableAtmosphere=1` — disable rain/dust/weather lighting.
- `?disableCameraFX=1` — disable cinematic camera effects.
- `?fixedQuality=1` — disable adaptive rendering resolution.

## Validation status

The supplied JavaScript files passed `node --check` syntax validation. This package has **not** been executed against the full repository, and production build success or 60 FPS has not been verified here. Weather effects are intentionally limited to the existing 3D road scene; the pre-existing 2D renderer remains the fallback on devices without WebGL.
