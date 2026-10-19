# Kano Life — Traffic & Market Gameplay Patch

This is a targeted patch against the current public `js/game.js`, not a replacement game or standalone director.

## Changes
- Rebalances normal traffic generation to approximately 40% keke, 30% motorcycles, 30% cars/taxis/SUVs, with rare desktop-only special vehicles.
- Applies a bounded market/school-run multiplier to the actual passenger fare calculation.
- Replaces the existing wedding-event SUV group with five staggered keke vehicles using Kano-inspired celebratory colours.

## Compatibility notes
- Uses existing `Game` state and functions; no new imports, tables, packages, or controls are required.
- The market fare uplift is active while `s.environment` is `market`; school-run uplift is active while it is `schoolGate`.
- The requested traffic percentages describe ordinary generated traffic. The rare desktop-only special-vehicle override can shift the observed mix slightly.

## Apply via GitHub web interface
Open `js/game.js` in the repository and use GitHub's edit interface to make the three matching changes shown in `patches/game.js.patch`. Preserve all unrelated lines. The patch is supplied as a reference; this ZIP has not been pushed to GitHub.

## Validation
Patch hunks were prepared against the publicly readable source contexts. A full build and browser gameplay test have not been run. Check that the GitHub source has not changed since this patch was prepared before applying it.
