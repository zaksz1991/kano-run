# KANO LIFE — Step 106: Adaptive Performance Engine

## Scope

This update strengthens the existing `KanoAdaptiveQuality` controller. It does not create a second renderer loop, replace Three.js, alter driving physics, or remove game modes.

## Changes

1. **Emergency resolution ladder for weak mobile devices**
   - The normal resolution floor remains 1.0 CSS pixel per CSS pixel.
   - Only low-tier mobile devices on the Standard sharpness setting can descend below 1.0.
   - Emergency resolution stops at 0.82. Sharp and Max user choices remain respected.
   - Duplicate final resolution steps continue to reduce decorative scene distance without repeatedly resizing the canvas.

2. **Sustained frame-time decisions**
   - The controller maintains a smoothed frame-time estimate alongside its one-second FPS windows.
   - Hidden-tab and long resume gaps are excluded from performance decisions.
   - Two slow windows and a minimum hold period are required before reducing quality.
   - Recovery requires twelve consecutive headroom windows and a longer hold period to prevent oscillation.

3. **More useful distance LOD**
   - The LOD ladder now has additional distance steps after the normal resolution floor.
   - Waiting passenger GLB actors are included in visual-only LOD.
   - Character visibility has distance hysteresis to prevent visible flicker near a boundary.
   - Passenger-zone parents, traffic simulation, collision state, pickups, fuel stops and the player keke are not removed or changed.

4. **Resource and diagnostics improvements**
   - Stale LOD actor references are removed when waiting passengers are replaced.
   - Pixel-ratio changes do not call `resize()` when the actual renderer ratio is already at the requested value.
   - Diagnostics now expose frame-time EMA, performance class, active ratio profile and whether emergency resolution is allowed.

## Files changed

- `js/KanoAdaptiveQuality.js` — updated existing controller.
- `js/KanoAdaptiveQualityPolicy.js` — new deterministic policy module.
- `tests/KanoAdaptiveQualityPolicy.test.mjs` — policy unit tests.
- `tests/KanoAdaptiveQualityIntegration.test.mjs` — wiring and preservation tests.

## Preservation

No changes were made to `index.html`, `main.js`, `game.js`, `renderer3d.js`, `ui.js`, `KanoDeviceTier.js`, `KanoPhoneComfortUpgrade.js`, `ModelManager.js`, `KanoGameplayPresentationRepair.js`, `KanoModelAssetVisualUpgrade.js`, `tests/KanoRegressionGuard.test.mjs`, or `public/` assets.

## Verification

The focused adaptive-quality and mobile-performance regression set passes. The complete test suite still contains failures caused by the intentionally stripped upload: missing `public/` assets and service worker, missing package dependency `three`, missing asset manifest, and an absent Node test-environment bootstrap. Those are source-snapshot limitations, not failures introduced by this change.

No physical Android performance run was available. This update has not been verified on the Mali-G52 MC2 device, and no FPS improvement is claimed until the deployed game is benchmarked on that hardware.
