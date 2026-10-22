# Kano Life — HUD Layout and Driver Camera Fix

## Complete replacement files

- `js/KanoDayHud.js`: moves the day-cycle HUD to the right edge, calculates its vertical position from live HUD/minimap/menu bounds, repositions on resize/orientation changes, and removes its listeners on disposal.
- `css/kano-responsive-upgrade.css`: hides the decorative Kano label behind phone stat cards and condenses secondary phone HUD rows while preserving the key driving stats.
- `js/renderer3d.js`: moves the driver-view camera above and farther behind the keke canopy and raises its look target to reduce bodywork obstruction. Chase-camera settings are unchanged.
- `tests/static.test.js`: updates the driver-camera assertion to the intended values.
- `tests/KanoDayHudLayout.test.mjs`: adds regression checks for the reported layout and camera issues.

## Verification

This ZIP is made from the code-only repository snapshot available to this session and contains only these complete replacement files plus this document. Run `npm test`, `npm run check`, and `npm run build` against the current working repository after copying the files. A software-rendered browser run cannot establish real phone GPU performance; inspect driver camera and HUD placement visually in a real browser/device.
