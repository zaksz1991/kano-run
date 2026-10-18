# Kano Life — Smoke, Collectible Coins & Live Active Players

This upgrade extends the existing Kano Run / Kano Life application. It does not replace the Game class, Renderer3D, Renderer2D, ModelManager, collision system, or AudioManager.

## Included files

### Copy to the existing repository

- `js/main.js` — full updated application entry point, with visual-effects lifecycle and live counter startup.
- `js/KanoVisualEffects.js` — exhaust smoke and collectible Naira coins in both Three.js and Canvas 2D modes.
- `js/LiveUserCounter.js` — client heartbeat and live-player badge.
- `api/live-users.js` — Vercel serverless presence endpoint backed by Upstash Redis REST.
- `js/KanoProductionBridge.js`, `js/KekeDynamics.js`, `js/productionSystems.js` — dependencies from the previous upgrade; included so the ZIP contains the expected integration modules.
- `package.json` — same runtime dependencies (`three`, `vite`) with a check script that includes the new modules and does not reference a missing `vite.config.js`.

Keep all your existing `index.html`, `game.js`, `renderer3d.js`, `renderer2d.js`, `ModelManager.js`, `storage.js`, assets and tests. Do not replace these files with this package; it only contains `main.js`, which is the intended replacement entry point, and the listed new/dependent modules.

## Smoke behaviour

- Three.js mode uses one shader-driven `THREE.Points` object with a fixed particle pool.
- Canvas 2D fallback draws smoke into a transparent overlay canvas.
- Smoke appears during acceleration and when engine health is low.
- The effect is visual-only and never changes authoritative game physics.

## Coin behaviour

- A small pool of 12 reusable Naira coins is placed on the road.
- Coins spin/floats subtly and recycle instead of being continually allocated.
- Collecting a coin awards ₦50 to the current run score and increments the visible coin counter.
- Rewards are run earnings. The existing game's terminal `bankRun()` flow remains responsible for banking them; this module does not write directly to saved banked funds.
- Coins can be collected in both 3D and Canvas 2D modes, and never pay out while reversing.

## Real live active-user count

A cross-device live-player count requires a shared server. Browser-only `localStorage` or `BroadcastChannel` would not produce a real global count. This package implements a Vercel API endpoint using an Upstash Redis sorted set. Active sessions heartbeat every 15 seconds; sessions older than 45 seconds are removed. The badge reports approximate active browser sessions, not signed-in users and not a bot-resistant analytics count.

### Configure Upstash Redis

1. Create a Redis database in Upstash and copy its **REST URL** and **REST token**.
2. In the Vercel project for `kano-run.vercel.app`, open **Settings → Environment Variables**.
3. Add these variables for **Production** (and Preview too if needed):
   - `UPSTASH_REDIS_REST_URL` = your Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN` = your Upstash REST token
   - `KANO_ALLOWED_ORIGINS` = `https://kano-run.vercel.app,http://localhost:5173`
4. Redeploy after saving the variables.
5. Verify `/api/live-users` responds with a method-not-allowed JSON response to a GET request; the client uses POST heartbeats.
6. Open the production site in two separate browser sessions. Once both heartbeats arrive, the count should reflect both sessions. Close a session or wait at least 45 seconds to see its count disappear.

Do not place the Upstash token in a `VITE_` environment variable or in browser-side JavaScript. Only `api/live-users.js` should receive the Redis credentials.

If Upstash is not configured, the badge displays `LIVE PLAYERS · UNAVAILABLE` instead of a fabricated count. Production origin is restricted to `https://kano-run.vercel.app` by default; add any required Vercel preview origin to `KANO_ALLOWED_ORIGINS` explicitly.

## Installation

Copy each listed file into the corresponding location in the existing repository. Replace `js/main.js` with this package's `js/main.js` and place `api/live-users.js` in the repository-root `api/` folder. Do not put the API file under `js/` or `dist/`.

Review the `package.json` replacement before using it. It preserves the project's current `three` and `vite` dependencies, adds syntax checks for the new modules, and removes an old syntax-check reference to `vite.config.js`. If your current package scripts have newer custom commands, merge only the `check` script rather than replacing your whole package manifest.

## Validate before deployment

Run in the repository directory:

```bash
node --check js/main.js
node --check js/KanoVisualEffects.js
node --check js/LiveUserCounter.js
node --check api/live-users.js
npm test
npm run build
```

The source files have been syntax-checked in the generation environment. The application has not been run end-to-end against your full repository; complete a Vercel build and test desktop/mobile gameplay before declaring the deployment production-ready.
