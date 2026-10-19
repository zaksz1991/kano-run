# Kano Life — Vehicle Visual Animation Upgrade

An additive Three.js visual layer for the existing Keke/traffic vehicles. It adds subtle suspension, chassis roll/pitch, wheel spin, front wheel steering, steering-wheel motion, and optional smoothed camera follow.

## Files
- `js/KanoVehicleVisualAnimator.js` — complete ES module.
- `INTEGRATION.md` — integration notes and complete usage example.

## Important
This module does not replace the current driving physics, collision system, traffic AI, or camera controller. Register the vehicle once and feed it motion values from the existing game loop. Do not run its camera-follow option at the same time as another camera controller. Wheel mesh axis and vehicle model orientation vary by asset, so inspect each model and configure wheel references accordingly.
