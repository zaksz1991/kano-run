# Kano Life — Step 90: Career Host Binding Crash Repair

## Confirmed cause

The current `index.html` contains the modern `#kano-life-career-screen` host with `#klc-settings-body` and `#life-career-close`. `KanoNorthernDriverLifeSimulationUpgrade.js` sees the host ID and returns early from its legacy panel creator, but its old `bindPanel()` then assumes legacy controls such as `#klc-close-top` and `#klc-profile-form` exist. Calling `.addEventListener()` on one of those missing nodes raises the reported TypeError. The primary `UI.bind()` has already completed, which is why the audit can show `uiBound: true` and `gamePresent: true` while also recording the error.

## Changes

- `js/KanoModelAssetVisualUpgrade.js` is a complete replacement. It retains the original visual-quality code and explicitly orders the life simulation module, the compatibility guard, the additional life-simulation layers, and the presentation/bootstrap wrapper.
- `js/KanoLifeCareerBindGuard.js` is a new compatibility module. It catches only the reported null-`addEventListener` TypeError, only when the modern hub markup is present, and only after the core UI/game binding is confirmed. Other exceptions are rethrown and remain visible to diagnostics.
- `tests/KanoLifeCareerBindGuard.test.mjs` tests the expected-hub case, verifies that unexpected failures are not swallowed, and checks import ordering.

## Install

Extract the ZIP. Copy `js/KanoModelAssetVisualUpgrade.js` and `js/KanoLifeCareerBindGuard.js` into your existing project's `js` folder, replacing the file with the same name and adding the new file. Keep `index.html`, the CSS import map, `main.js`, `game.js`, `ui.js`, storage, and assets unchanged.

## Verification and limits

Run the supplied Node test file with your existing project test workflow if available. A local static syntax check and the included focused regression tests were run when creating this package. A new Vercel deployment and external live-browser confirmation have not been performed in this workspace. The guard prevents this optional legacy panel binding error; it does not claim to test every life-simulation feature end-to-end.
