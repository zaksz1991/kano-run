# Kano Life — Step 2 Audit Startup and Radio Fix

This update is an overlay for the current Kano Life project. It does not contain or replace `public/`, the GLB/GLTF files, textures, audio files, or player saves.

## Included changes

- `scripts/browser-audit.mjs`: allows a configurable 45-second default startup budget for slow/software-rendered 3D, detects when the game is already in a valid playable state, and captures live DOM/render diagnostics if no start path becomes available.
- `scripts/browser-audit.mjs`: records expected console noise from deliberately blocked model requests in a separate column. Unexpected non-model request failures and HTTP errors remain release blockers.
- `js/audio.js`: uses manifest-backed radio paths under `/assets/models/audio/` rather than probing several guessed folders with repeated HEAD requests. Playback remains lazy (`preload = 'none'`).
- `tests/runtime/node-test-setup.mjs`: adds an isolated EventTarget-based dispatch shim so wallet persistence tests do not flood the test output with `window.dispatchEvent is not a function` warnings.
- Regression tests cover the audit startup flow, radio mappings, GLB texture-reference scanning, and the Node event shim.

## Local check

Run the project test suite and then the browser audit. For a 10-second diagnostic only:

```powershell
$env:KANO_AUDIT_DURATION_MS="10000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_DURATION_MS
```

For the required Step 2 pass, run with the default duration (60 seconds per driving scenario):

```powershell
npm run browser:audit
```

Startup timeout can be increased on a particularly slow software-rendering host without shortening the drive sample:

```powershell
$env:KANO_AUDIT_START_TIMEOUT_MS="90000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_START_TIMEOUT_MS
```

The output includes `summary.md`, `report.json`, and screenshots under `artifacts/browser-audit/`.

## Limits

The audit uses Chromium's software renderer in this headless setup; treat frame timings as relative diagnostics rather than a physical Android benchmark. Expected model-blocking diagnostics are categorized separately only in explicit no-model scenarios. This update does not compress or delete models, alter game saves, or add replacement textures.
