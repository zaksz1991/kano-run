# Kano Life — scan, audit and implementation review

## Scope inspected

The public `zaksz1991/kano-run` repository identifies itself as Kano Life and documents a Vite + Three.js game. Its current `package.json` is version 3.2.0, uses Three.js `^0.170.0`, and still uses `vite build` rather than the requested explicit Node invocation. The current `index.html` contains the malformed viewport value `viewport-fit=cover.0` plus duplicate `maximum-scale` and `user-scalable` attributes. The loading screen is a large inline implementation and the earlier review identified simulated progress rather than readiness-based loading.

Repository: https://github.com/zaksz1991/kano-run
Live deployment referenced by the repository: https://kano-run-nu.vercel.app

## Changes included in this candidate package

- Correct viewport metadata; no duplicate scale attributes.
- Vite/Three.js vanilla ES module project with the requested Node-based build script.
- Modular game state, config, 2D renderer, 3D renderer, GLB manager, controls, audio, storage, and UI.
- Fresh-canvas fallback: a canvas used for WebGL is replaced before creating a Canvas 2D context.
- `?force2d` and `?force3d`; mobile watchdog only changes to 2D after less than 10 FPS for approximately 8 continuous seconds.
- Canvas 2D road, visible player keke, traffic, pickups, drop pads, fuel pads, potholes, Kano skyline/stalls and visible mode badge.
- Three.js road/world, procedural vehicle fallback meshes, optional GLB loading and target-height normalization.
- 60+ Kano route names, seven driver profiles, six modes, fare/pickup/drop loops, KAROTA and rich-man events, robber event, fuel/condition/tyres, missions, daily login reward, local save, run history, and top-three local tribal scoreboards.
- Responsive HUD and compact touch controls; keyboard and swipe controls.
- Hausa/Yoruba/Igbo copy, radio cycling, promotional links, and Hassan Zakariya developer credit.
- Vercel headers and deployment README.

## Findings / limits that remain before calling this production-shipped

1. **The new package has not been pushed to GitHub or deployed.** This environment has no authenticated GitHub repository write tool, so the live project is unchanged.
2. **Production build could not be run here.** `npm install` failed because DNS/network access to `registry.npmjs.org` was unavailable (`EAI_AGAIN`). All local JavaScript modules passed `node --check`; JSON configuration passed parsing. That is not equivalent to a Vite production build.
3. **No GLB assets are bundled.** The ModelManager tries the documented paths, but actual asset paths, mesh orientation, visual quality, and HTTP 200 responses require the user's asset pack and deployment test. Missing files fall back to procedural meshes.
4. **This is a playable baseline, not yet full parity with every requested subsystem.** The detailed wishlist still includes richer passenger character models/crowds, full garage purchases/paint unlock economy, complete daily-mission claiming, advanced route-specific landmark systems, all optional northern timed events, richer audio/radio beds/voice lines, and comprehensive mobile/browser QA.
5. **The game has only been statically checked in this environment.** It needs desktop and real-device playtesting for collision timing, touch behavior, mode balance, and WebGL fallback.

## Required acceptance checks after importing into the repository

- `npm run build` succeeds on Vercel.
- `/`, `/?force2d`, and `/?force3d` load; 2D shows the road and keke, not an empty canvas.
- Console confirms WebGL renderer and successful `[ModelManager] OK keke ← assets/models/...` when GLBs exist.
- Test first movement under 10 seconds, lane controls, fuel refill, passenger boarding/drop, fare event, KAROTA pay/talk/run, collision, all three life savers, paid continue, and final game over.
- Verify localStorage after reload, 60+ routes, all modes, daily WAT reward, and top-three tribe boards.
- Test portrait/landscape on an actual phone and confirm no controls cover the keke.
