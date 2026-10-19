# Kano Life Commercial Integration — Release 1.1

## Files

- `js/KanoCommercialIntegration.js` — additive lifecycle/event coordinator.
- `patches/main.js.patch` — minimal integration patch for the current published `js/main.js`.

## Apply using the GitHub website

1. Open the `js` folder in the repository.
2. Create `KanoCommercialIntegration.js` and paste the complete file from this package.
3. Open `js/main.js` and apply the four small changes shown in `patches/main.js.patch`: add the import, add the module variable, initialise the coordinator after `new Game(...)`, update it after `game.tick(dt)`, and dispose it on `pagehide`.
4. Commit the changes through GitHub. Vercel should deploy the commit if the repository is connected to the project.

## Important compatibility notes

The coordinator imports `./PassengerDialogueManager.js` because both files live in `js/`. This path is intentionally relative to the destination repository, not the ZIP folder.

It does not create Three.js passenger anchors or execute hotspot purchases. It only handles real DOM anchors/events supplied by existing systems. The current game remains the authority for physics, money, routes, progression, touch controls, adaptive quality, and live-user count. Do not replace those systems with the duplicate standalone modules.

## Verification

`KanoCommercialIntegration.js` passed a Node syntax check. The integration patch was checked against the current published `main.js` import/boot/frame/pagehide anchors. A full Vite build and browser gameplay test were not possible without the full repository checkout. No repository change or deployment has been performed by this package.
