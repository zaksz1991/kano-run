# Kano Life (Kano Run)

A mobile-first browser driving game set in Kano State, built with Vite, vanilla JavaScript ES modules, and Three.js 0.170. Game Developer: Hassan Zakariya.

## Build and deploy

- Install dependencies with `npm install`.
- Development server: `npm run dev`.
- Production build: `npm run build` (uses `node ./node_modules/vite/bin/vite.js build` to avoid `.bin` permission problems).
- Preview production: `npm run preview`.
- Deploy the repository root as a Vercel Vite project. Build command: `npm run build`; output directory: `dist`.

## Renderer switches

- Default: WebGL / Three.js when available.
- `?force2d`: force the playable Canvas 2D renderer.
- `?force3d`: keep WebGL even if mobile FPS falls; useful for debugging.
- WebGL initialization failures use a **fresh canvas** for Canvas 2D because a WebGL canvas cannot be reused for a 2D context.
- Mobile performance watchdog switches to 2D only below 10 FPS continuously for about 8 seconds. It does not switch merely because FPS dips below 18.

## Controls

- Touch: on-screen left/right, brake, gas, horn; swipe left/right on the road to change lanes.
- Keyboard: left/right arrows or A/D, up/W gas, space/down brake, H horn, Esc menu.
- Brake nearly to a stop to load/drop passengers or refill fuel at a fuel pad.

## Modes

Career, Time Attack (3.5 km), Fuel Gauge Challenge (4 km), Match Drop, Potholes Challenge (3 km), and Free roam. Local save includes wallet, best score, recent runs, route/driver, radio, dialect, settings, achievements, daily streak, best time by route, and Hausa/Yoruba/Igbo top-three score boards.

## Asset map

Place optional GLB assets under `public/assets/models/`:

- `vehicles/keke/keke-1.glb` through `keke-8.glb`
- `vehicles/cars/` — sedan, taxi, suv, truck, motorcycle
- `vehicles/special/` — police, karota, bus, okada, ambulance
- `characters/passengers/` — hijab_muslim_woman, women_in_hijab, Man, suit
- `characters/pedestrians/`

The model manager tries ordered candidates, normalizes valid meshes to per-type target heights, rejects implausible bounds, applies double-sided materials, caches loaded models, and logs successful GLBs. Missing GLBs fall back to procedural vehicles, so the game remains playable without asset packs. Mobile preload is limited to essential vehicles and a passenger.

## Culture and promotion

The game uses Kano route names, Hausa-first language flavour, KAROTA (not LASTMA), roadside stalls and northern architecture, plus Yoruba and Igbo language options. In-world/start-screen promotion links to RuffNeck Entertainment and RuffNeck Learn.

## Audit notes

This package is a self-contained upgrade/build candidate. It has not been committed to the live GitHub repository or deployed to Vercel. Test with `?force2d` and `?force3d` after importing it. Optional third-party GLB packs are not included; model loading is path-based and safely degrades when files are absent.
