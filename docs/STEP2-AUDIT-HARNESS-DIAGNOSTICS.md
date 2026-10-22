# Kano Life — Browser Audit Harness Diagnostics Update

The latest 10-second run still completed 0/8 driving scenarios. The CLI summary omitted the actual scenario exception, so those results alone do not establish whether the remaining fault is in UI automation or application startup.

## What this update changes

- Resolves morning-routine buttons directly from the live `#life-actions` DOM, with Unicode normalization and visibility/disabled checks.
- Verifies that clicking START DRIVING visibly opens the morning-routine screen before attempting later actions.
- Adds a page snapshot to the failure record: current step, available actions, renderer mode, canvas dimensions, visible screens, URL and bootstrap script URLs.
- Preserves render-mode and frame sampler data for incomplete runs instead of leaving the fields blank by default.
- Prints each scenario's actual failure and representative HTTP errors in the terminal.
- Adds a failure-details section to `summary.md` so the next diagnostic run can be assessed without guessing from counts alone.

No game simulation, visual rendering, economy, progression, or binary assets are changed.

## Apply

Extract this ZIP over the existing `kano-run` project. Replace the included `scripts/browser-audit.mjs`, add the updated regression test, and add this document. Preserve `public/assets/`, `js/`, `index.html`, and all other project files.

## Run a short diagnostic

```powershell
npm test
$env:KANO_AUDIT_DURATION_MS="10000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_DURATION_MS
```

This run is diagnostic only; the full audit still requires 60 seconds of driving in each scenario. The terminal will print the caught error, and the generated `summary.md` will include the failure snapshot and representative failed requests.

If the routine advances successfully, rerun without the duration override to perform the full matrix.
