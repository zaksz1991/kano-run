# Kano Life — Step 70: Parenthood & Family Growth

This is an additive feature package based on the live public `main` entrypoint inspected at `https://raw.githubusercontent.com/zaksz1991/kano-run/main/index.html` on 23 October 2026. It preserves the existing six startup script tags and PWA manifest/apple-touch-icon links, then adds the new runtime module. The runtime imports the current `KanoNorthernDriverAureJourneyUpgrade.js` and reads the existing life-profile and Aure health snapshots instead of replacing their state.

## Install

Extract the ZIP into the existing Kano Run project root (the folder containing `index.html` and `package.json`). Allow the supplied complete `index.html` to replace the existing one. Add `js/KanoNorthernDriverParenthood.js` and `js/KanoNorthernDriverParenthoodUpgrade.js`. Copy the two test files to the existing `tests/` folder.

Do not replace `main.js`, `game.js`, `renderer3d.js`, `storage.js`, the service worker, manifest, CSS or model assets.

## Feature

- Optional, local-browser-only family planning, expecting-parent story and parenting chapter.
- Uses an existing positive simulated test from the Aure/cultural health panel for a self-pregnancy story, or requires an explicit player confirmation for a fictional adult partner-pregnancy story.
- 84-day compressed narrative arc with three 28-day story stages; this is expressly not medical timing, a due-date calculator, diagnosis or treatment advice.
- Optional family-support, budget-planning, rest/work-plan, naming/Suna and childcare actions; at most one action per in-game day.
- Birth is never recorded automatically. It requires the story timer plus recorded support/preparation milestones and a deliberate player action.
- Does not move money, change relationship status, add medical records, prescribe treatments or include partner names / health details in export.

## Verification

Included tests cover state normalization, privacy opt-in, explicit pregnancy-story gating, compressed narrative milestones, birth preconditions, child-story age, idempotent actions and entrypoint preservation. The live production build and phone rendering must still be run against the full current repository.
