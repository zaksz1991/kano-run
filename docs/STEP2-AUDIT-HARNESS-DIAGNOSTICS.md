# Kano Life — Step 2 audit harness correction

## Diagnosis from the latest user-provided browser output

The audit had an incorrect expectation: it clicked `START DRIVING` and then waited for `#life-routine-screen`. In the current application, `KanoGameplayPresentationRepair.js` deliberately overrides `UI.prototype.beginMorningRoutine` so the ordinary start button begins a run immediately. The story remains available through the separately-created `REPLAY MORNING ROUTINE` button. The audit therefore waited for a screen that is intentionally hidden on the default path.

The logs also show a startup race: in several cases the Start button remained on the screen after the click. The harness previously waited only for the button to be visible, which happens before the delayed bootstrap chain necessarily reaches `UI.bind()`. The replacement waits for `window.__KANO_LIFE_GAME__`, the game's `start` method, and the renderer mode before interacting.

## Changes in this update

- Wait for application initialization before clicking any start action.
- Treat the normal start button as direct start and require `game.state === 'PLAY'`, a hidden start screen, visible HUD/drive controls, and a reported renderer mode.
- Update run recovery to wait for direct restart instead of trying to traverse the optional story.
- Run a separate quick smoke test through `REPLAY MORNING ROUTINE` using the actual current story-button labels. The smoke test follows the skip-breakfast path, proceeds through the guarded park, and checks that the shift starts with `breakfastEaten === false`.
- In default local Vite Preview runs, return explicit fixture responses for `/api/live-users` and `/api/leaderboard`; Vite Preview does not execute Vercel functions. The fixture endpoints are recorded in each result. If `KANO_AUDIT_BASE_URL` is supplied, the real endpoints are used and no API fixtures are installed.
- Keep unexpected console/page errors, failed model requests, HTTP errors, frame timings and screenshots in the report.

## Apply

Replace these complete files from the ZIP:

- `scripts/browser-audit.mjs`
- `tests/browser-audit-harness.test.mjs`

Add this document:

- `docs/STEP2-AUDIT-HARNESS-DIAGNOSTICS.md`

Do not replace `public/assets/`, `package-lock.json`, or other project files.

## Verify

Run:

```powershell
npm test
$env:KANO_AUDIT_DURATION_MS="10000"
npm run browser:audit
Remove-Item Env:KANO_AUDIT_DURATION_MS
```

The 10-second setting shortens only the eight driving scenarios; it is a diagnostic run, not the full 60-second performance audit. Inspect `summary.md` and `report.json`. If the diagnostic starts successfully, rerun without `KANO_AUDIT_DURATION_MS` for the full 60-second matrix.

## Limitations

This package is a source update; it does not claim the browser run passed. It has been checked for JavaScript syntax and the harness's Node regression tests in the generation environment, but not executed against your local Windows browser and its binary asset collection. Real asset rendering remains **needs assets** until the fresh report confirms model response and visual results.
