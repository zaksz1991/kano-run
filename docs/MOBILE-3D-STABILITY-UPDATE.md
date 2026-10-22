# Kano Life — Mobile 3D Stability Update

## Scope

This update locks render-mode transitions to three allowed cases: a development/browser-audit `?force2d=1` override, an explicit saved/current Settings choice of 2D, or a first WebGL probe that confirms no WebGL context is available. A prior successful WebGL probe means that later context loss is treated as temporary, not as a reason to switch renderers.

## Changes

- `js/main.js` is a complete replacement entry module. Low FPS no longer starts Canvas 2D. Frame exceptions and WebGL context loss rebuild/retry the 3D renderer with backoff. A final permission guard prevents accidental 2D transitions.
- `js/KanoRenderModePolicy.js` centralizes and tests the policy.
- `public/sw.js` uses versioned model/texture cache names and bumps the cache namespace to `kano-life-v2`; old model/texture entries are eligible for deletion on activation.
- New tests cover the allowed transition policy, frame/context error recovery and monitor/adaptive-quality boundaries.

## Source audit findings

In the public `main` source inspected on 22 October 2026, additional unwanted 2D-switch paths remained beyond the two causes described by the project owner:

1. Mobile FPS below 10 for 8 seconds switched to Canvas 2D when `keep3D` was false.
2. Any frame exception switched to Canvas 2D when `keep3D` was false.
3. After six context-rebuild attempts, context loss could switch to 2D when `keep3D` was false.
4. A failed rebuild could switch to 2D when `keep3D` was false.
5. Startup or a settings-mode change routed any rejected `start3D()` promise to Canvas 2D, not only the specific no-WebGL condition.

`KanoPerformanceMonitor` reports frame time, calls and triangles; it does not call `start2D`. `KanoAdaptiveQuality` changes resolution and culls distant decorative actors, and does not select Canvas 2D. In the current public renderer, `shadowMap.enabled` is false and `THREE.Fog` is configured, including runtime day/environment fog updates. Mobile also uses a shorter building loop distance and a smaller modelled crowd pool than desktop.

## Textures and service-worker cache

The public service worker previously used a persistent, unversioned `kano-life-models` cache with stale-while-revalidate. That can temporarily serve old model/texture responses after same-path assets change. The new worker versions the model cache along with the shell/static cache. This does not create missing `Textures/colormap.png` files: those actual PNG files must exist in the repository at the exact relative paths referenced by the GLBs. After the update, run the existing GLB texture-reference audit and confirm the PNG URLs return HTTP 200 on the deployed site.

## Danfo Run comparison

The public site `danforun.com` exposes a driving HUD and touch controls, but its production source does not provide a verified Three.js renderer configuration or published draw-call budget. Its public privacy page identifies Eureka Gaming Studios Limited as its operator. This report therefore does not claim direct source-level equivalence with Kano Life. A valid internal comparison requires the actual Danfo Run project URL/repository if the intended project is different from the public site, plus the same phone/device and browser for both tests.

## Not included / needs assets

No GLB, PNG, audio or other game binary assets are replaced or compressed in this ZIP. Texture restoration, GPU texture memory reduction, geometry compression and a measured draw-call budget need the real asset files. Real-device FPS and the 60-second heap/GPU-memory audit remain unverified until run on the target phone using `?debugPerf=1&debugModels=1`.
