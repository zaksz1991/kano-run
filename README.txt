KANO LIFE — HUD LAYOUT AND DRIVER CAMERA FIX

This archive contains complete replacement files, not snippets.
Extract at the root of your existing kano-run project folder and allow the files
inside kano-run/ to merge with the matching project folders. Keep all other files
and assets unchanged.

Included changes:
- Day-cycle HUD dynamically positions on the right below intersecting HUD/minimap elements and cleans up resize listeners.
- Phone HUD hides the decorative Kano label and secondary chips to reduce top-screen crowding.
- Driver camera is raised and pulled back to clear the keke bodywork.
- Regression tests cover the reported layout and camera issues.

Validation performed against the supplied code-only snapshot:
- Complete available Node test suite: 157 passed, 0 failed.
- JavaScript syntax check: passed for project JavaScript files.

No browser visual check was performed in this environment. Re-run `npm test`, `npm run check`, and `npm run build` in your current repository, then inspect the layout and driver camera in the actual browser.
