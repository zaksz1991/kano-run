# Kano Keke Life — Character Animation State Machine Upgrade

This is an incremental replacement for `js/KanoLifeRootCauseRepair.js`. It retains the previous keke calibration, character GLB attachment, goat discovery, damage feedback, embedded animation metadata cache and diagnostic panel. It adds real state changes for embedded animations instead of locking imported life-scene characters to only the first animation requested.

## What changes

- **Activity changes now trigger animation requests.** When a morning-life rig changes `rig.action` (for example, idle to sweep or draw water), the imported character requests a clip matched to the new activity.
- **Cross-fades between compatible embedded clips.** When the same GLB contains suitable clips for both states, the transition blends over 220 ms rather than instantly replacing one pose with another.
- **Per-actor clip-action cache.** Reuses actions for clips already created on the same actor and stops the outgoing action after the brief cross-fade window.
- **Animation budget waiting list.** Actors deferred by the mobile/desktop mixer cap can retry when other animated actors are removed; they are no longer permanently skipped for that state.
- **Lower per-frame allocation.** The mixer update loop iterates the map directly rather than allocating a fresh spread-array every frame.
- **Passenger seat entry transition.** New seated passenger GLBs settle into the seat over 360 ms, including a small vertical movement and scale easing, instead of popping instantly to the final pose. The final seat height is retained correctly after the transition.
- **More diagnostics.** The existing root-cause audit reports activity-mode transitions, cross-fade count and animation actors waiting for a mixer slot.

## Installation

Replace only this file with the complete file from the ZIP:

`js/KanoLifeRootCauseRepair.js`

Keep the existing `index.html`, `js/ModelManager.js`, `js/renderer3d.js`, `js/KanoSceneUpgrade.js`, `js/KanoAnimationTrafficUpgrade.js`, `js/productionSystems.js`, all GLB assets, catalogue scanner and manual mapping file unchanged. This assumes the root-cause repair module is already registered in `index.html` as in the previous upgrade.

## How to inspect

Open Kano Life with `?rootCauseAudit=1` appended to the URL. The diagnostics panel reports animation transitions, cross-fades, active mixers, deferred mixer count, selected model paths, goat status and damage feedback. Use **DOWNLOAD JSON** to export the audit.

## Limits

This package uses animation clips embedded in your existing GLBs. If a model has no appropriate clip, the code continues using the existing procedural fallback. A cross-fade is applied only when the selected clip differs from the currently active clip. This does not create new animation clips, add new GLB models, implement true vehicle rigid-body physics, or guarantee that a clip's content is semantically correct. Live browser gameplay and device frame rate have not been tested in this environment.
