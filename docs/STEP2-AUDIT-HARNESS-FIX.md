# Step 2 Browser Audit — Harness Fix

## Root cause found from the first run

The morning routine automation selected `#life-actions button` and then searched inside each matching button for a descendant button. The game's morning-action buttons are siblings, not nested controls. Playwright therefore timed out before the routine finished, and none of the eight driving sessions entered the 60-second measurement loop. The `INCOMPLETE`, unknown-mode, and zero-frame rows are not evidence that all eight render modes failed; they indicate the audit harness did not reach gameplay.

## Changes

- Replaced the incorrect nested button locator with `#life-actions` as the parent container.
- Added failure diagnostics containing the current morning step, current scene title, available actions, page readiness, and reported render mode.
- Applied the same corrected helper to restart recovery.
- Removed the post-run `canvas.getContext('2d')` probe. Requesting a 2D context from a canvas already used for WebGL can create misleading context diagnostics; the report now records the game's render-mode flag instead.
- The summary distinguishes a clean completed scenario from a completed scenario with errors. Completion alone is not a clean bill of health.
- Added regression tests to prevent this exact selector mistake from returning.

## Apply and rerun

Extract the ZIP over the existing repository, preserving all other files and the real `public/assets/` directory. It replaces `scripts/browser-audit.mjs` and adds `tests/browser-audit-harness.test.mjs` plus this document.

Run:

```powershell
npm test
$env:KANO_AUDIT_DURATION_MS="10000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_DURATION_MS
```

This 10-second run is only to confirm that the harness enters gameplay and records a render mode and frame samples. If it does, run the required full 60-second matrix:

```powershell
npm run browser:audit
```

Attach the new `summary.md` and `report.json`. Do not judge asset or performance quality from the prior report because its eight gameplay scenarios never reached the measurement loop.
