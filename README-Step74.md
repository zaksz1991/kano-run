# Kano Life — Step 74: Start-Page Recovery, Keke Hero Render & Social Drama

## Deliverables

This is a **cumulative overlay for the existing Kano Life repository**, not a replacement for the complete repository. It includes a full replacement `index.html`, complete new JavaScript modules, new CSS, a generated transparent-background Keke image, tests, and research documentation.

### Main changes

1. **Start-page recovery.** `KanoAppLaunchRecovery.js` loads first, instruments the existing `UI` object's initialization/bind lifecycle, fills the route and driver selects from the existing `config.js` and `storage.js` when they are empty, retries the canonical `main.js` entry if the optional bootstrap chain has not bound, and displays an on-page retry/error notice if core initialization still fails. It does not construct a second `Game` instance.
2. **Direct canonical entry.** The supplied `index.html` explicitly loads `/js/main.js` after the existing visual and life-system bootstraps. The dynamic and direct imports use the same module URL, which is cached by the browser; this is intended to avoid creating duplicate game loops.
3. **Keke hero image.** The small flat illustration is replaced by `public/assets/kano-life-keke-hero.webp`, a newly generated, transparent-background, realistic 3D-style render sized for desktop and mobile layouts.
4. **People & relationships.** A `PEOPLE · RELATIONSHIPS & SOCIAL LIFE` entry is available from the start screen and the pause menu. The panel includes personal names, football club, music/radio, movie, religious-topic, speaker and gathering preferences; relationship stories; everyday interactions; emotional metrics; and a privacy-safe export.
5. **Relationship-stage sync.** The existing Aure Journey remains authoritative for single, dating, engaged, married, separated and divorced stages. Step 74 reads that stage and adapts the available storylines; it does not maintain a second relationship-stage record.
6. **One wallet.** The optional ₦250 kindness gift and ₦200 neighbourhood contribution use the current `storage.js` wallet. The transaction attempts to roll back the wallet if persistence of the matching social record fails. There is no duplicate wallet.
7. **Safety.** Social actions are locked during an active driving shift. Harassment is never a playable action or reward. The scene offers consent-centred support options. Separation and divorce stories prioritise boundaries and safety; mediation is optional and explicitly conditional on safety and consent. Family-care scenes do not create children or modify health records.

## Installation in the repository GUI

1. Extract this ZIP using File Explorer.
2. Copy its `js`, `css`, `public`, `tests`, and `docs` folders into the existing `kano-run` repository folder, merging folders when prompted.
3. Replace the repository's root `index.html` with the complete `index.html` supplied in this ZIP.
4. Do not replace `js/main.js`, `js/game.js`, `js/ui.js`, `js/storage.js`, `js/config.js`, either renderer, the package files, or existing model assets.
5. Check the browser start screen in both a desktop and a phone viewport. If startup still fails, the new recovery module should display an error instead of leaving the route and driver dropdowns blank without explanation.

The index preserves the Step 71–73 launch modules and the existing PWA links. It expects the current repository's previously added modules to remain in `js/`, including the Skills Pathways and Career Progression files referenced by its entrypoint.

## Social story coverage

The current narrative set includes misunderstandings, forgotten commitments, gossip, public embarrassment, football rivalry, sermon discussions, harassment of a woman at the park, music/movie differences, neighbour help, sadness and setbacks, separation boundaries, household fairness and family-care planning. Stories advance as choices are made rather than requiring a game-day counter to increment correctly.

Emotion meters separately track love/affection, trust, patience, compassion, joy, sadness, stress, respect, neighbour trust, friendship, autonomy, anger, resentment and grief. This is fictional gameplay state, not an assessment of any real person.

Named preacher choices are opt-in interest labels only. The panel does not download or play recordings, create a religious affiliation, rank movements, or endorse a scholar. Players can choose topics without selecting a named speaker.

## Verification status

- **Verified:** 214 tests pass in the merged offline snapshot using Node.js 22.16.0.
- **Verified:** syntax checks pass across 153 JavaScript and MJS files in that merged snapshot.
- **Verified:** one HTML doctype, one HTML root, one body, 16 module script references, one explicit `/js/main.js` entry, and valid local references for the new hero image and stylesheet.
- **Not verified:** `vite build`, because `node_modules` is absent in the available offline snapshot; browser console/network logs; real desktop/mobile gameplay; WebGL rendering; a real phone performance run; and the live Vercel deployment.

The exact live startup failure was not captured from browser developer tools. The blank selectors shown in the screenshots are consistent with the core `UI` initialisation not completing. This update adds a direct entry and recovery diagnostics to address that failure path; browser testing remains necessary to confirm the production symptom is fixed.
