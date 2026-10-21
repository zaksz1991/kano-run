# Kano Keke Life — Render Mode & Frame Budget Audit

This is a diagnostic-only upgrade. It does not change the renderer, force WebGL, or modify gameplay. It is intended to capture evidence for the next performance/fallback repair instead of guessing.

## Files
- `js/KanoRenderModeFrameBudgetAudit.js` — opt-in browser overlay and JSON export.
- `tests/render-audit-smoke.test.mjs` — basic regression checks.

## Add it without replacing existing game files
1. Add `js/KanoRenderModeFrameBudgetAudit.js` to the repository at that exact path.
2. In the existing `index.html`, add this script tag after the existing game scripts (before `</body>`):
   `<script src="/js/KanoRenderModeFrameBudgetAudit.js"></script>`
3. Do not replace `index.html` wholesale for this diagnostic. Preserve all existing scripts and markup.
4. Open the game with `?renderAudit=1` added to the URL.
5. Play for 20–30 seconds, then select **EXPORT JSON**. Also capture the browser console if the game switches to 2D.

## What it reports
- Approximate sampled FPS, smoothed frame time, and worst observed frame.
- Number of canvas elements and which expose WebGL or 2D contexts.
- WebGL context-lost/restored events.
- Renderer hints if the app exposes `window.renderer` or `window.gameRenderer`.

## Important limits
Canvas context inspection is observational and cannot conclusively identify the game's active renderer. Some browsers do not expose renderer objects globally. This tool intentionally does not call `getContext()` to force a new context on existing canvases; it inspects available contexts and reports uncertainty. The output is evidence, not a fix by itself.
