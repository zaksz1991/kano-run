# Kano Life Step 2 — Playwright Browser Audit

This audit runs against the built `dist/` output using Vite Preview, not the dev server. By default, it runs the entire matrix:

- desktop (1440 × 900) and phone (390 × 844)
- forced Canvas 2D and forced Three.js 3D
- real model files enabled and intentionally blocked
- a 60-second driving session for every matrix cell
- cold first-load measurements on Fast 3G and Slow 4G throttle profiles
- console errors, uncaught page errors, failed requests, HTTP errors, browser frame timing, JavaScript heap growth, canvas size, responsive overflow, model request count, and screenshots

## Run from the project folder

1. Extract the Step 2 ZIP over the project. It adds `scripts/browser-audit.mjs`, replaces the complete `package.json`, and adds this guide. It does not include or replace `public/` assets.
2. Run `npm install` once. This updates `package-lock.json` to include the pinned Playwright 1.64.1 dependency. Keep the newly generated lockfile.
3. Run `npx playwright install chromium` once to install Playwright's matching Chromium browser.
4. Run `npm run browser:audit`.

The audit builds the project first, starts Vite Preview on `127.0.0.1:4173`, then writes a timestamped directory under `artifacts/browser-audit/` containing `report.json`, `summary.md`, and PNG screenshots. The script stops its preview server at completion.

## Full-duration versus short diagnostic runs

The required full run defaults to 60,000 ms per driving scenario. For a short check of the harness before committing to the full run, set `KANO_AUDIT_DURATION_MS` to a smaller value. A short run is a diagnostic only and must not be reported as the required 60-second playtest.

PowerShell example for a short diagnostic:

```powershell
$env:KANO_AUDIT_DURATION_MS="10000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_DURATION_MS
```

## Network profiles

The script uses explicit Chromium CDP throttling parameters so they are reproducible:

| Profile | Download | Upload | Latency |
|---|---:|---:|---:|
| Fast 3G | 1.6 Mbps | 0.75 Mbps | 150 ms |
| Slow 4G | 4 Mbps | 3 Mbps | 20 ms |

These are named simulation presets; real carrier conditions vary. Reported transfer sizes come from the browser Resource Timing API and may undercount cross-origin resources without Timing-Allow-Origin.

## Model on/off cases

The "with models" cases permit normal local GLB/GLTF/buffer requests. The "without models" cases deliberately block `.glb`, `.gltf`, and `.bin` model requests to exercise the procedural/fallback path. Intentional blocks are counted separately from unexpected failed requests.

The audit also inventories actual files under `public/assets/models`. If it finds zero GLB/GLTF/buffer files, the report marks real-model verification as **needs assets**. Do not treat a no-asset snapshot as a successful real-model test.

## Reading the report

- `report.json` is the raw record of all scenarios and request URLs.
- `summary.md` is the comparison table across the eight driving scenarios and two throttled first loads.
- The PNGs are named by viewport, renderer mode, model availability, or network profile.
- `actualRenderMode` must match the requested mode; if 3D falls back to 2D, investigate the console log, WebGL initialization, GLB path errors, and the asset inventory.
- A clean test means zero unexpected console/page errors, failed requests, and HTTP errors. Intentional no-model aborts are listed separately.
- Frame timing in headless Chromium is a browser-machine result. It is not evidence of real mid-range Android performance. A physical Android device is still needed to validate that target.

This audit is observational and does not modify gameplay data. It uses a fresh browser context per scenario and blocks service workers so first-load measurements are not served from a prior service-worker cache.
