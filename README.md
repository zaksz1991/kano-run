# Kano Run 3D (Phase 1)

Three.js / WebGL endless runner — Adaidaita Sahu through Kano.

## Stack (free)
- Three.js (vendored in `/vendor/three.module.js`)
- Vite + Vercel
- Existing game systems (routes, missions, life savers, HUD)

## Dev
```bash
npm install
npm run dev
```

## Deploy
```bash
npm run build
vercel --prod
```

## Architecture
- `game.js` — logic only
- `renderer3d.js` — WebGL scene, camera, vehicles
- HTML HUD overlays the canvas
