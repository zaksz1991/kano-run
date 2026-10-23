# Kano Life — Step 75: Launch Hardening & Persistent Social Network

**Package type:** additive overlay for the existing Kano Life / Kano Run repository. It is not a standalone replacement game.

## What this update adds

### Start-page recovery

- Includes a fallback route and driver choice in the HTML so those controls do not initially render as empty if the configuration-population bootstrap fails.
- `KanoAppLaunchRecovery.js` replaces the marked starter values with the real route and driver options when the existing configuration and save modules are available.
- Adds a post-click progress check. When the Start Driving action is clicked but the game stays on the start screen, the page surfaces a retry/error message instead of failing silently.
- Uses the existing `main.js` entry point and current game instance. It does not construct a second `Game` instance.

The safeguards are designed around the reported blank route/driver controls and stuck start screen. The actual production browser failure has not yet been captured in a browser console, so this package does not claim a proven diagnosis or a verified live fix.

### Persistent social network

A **Your Wider Circle** panel is added within the existing People & Relationships screen. Eight fictional recurring contacts have persistent relationship memories, including partner, friend, neighbour, family elder, sibling/cousin, football friend, community contact and fellow driver/workmate.

Social scenes cover misunderstandings, promises, personal boundaries, household responsibilities, co-parenting, separation boundaries, grief, elders and family care, neighbour disputes, water queues, football banter, music/movie taste, discussion of Islamic lessons, naming ceremonies, weddings, workmate solidarity, public embarrassment and safe responses to harassment.

- Relationships evolve through trust, closeness, respect, support and tension.
- Existing social wellbeing metrics remain authoritative; the add-on does not keep a second set of joy, sadness, anger, patience or compassion scores.
- The existing Aure Journey owns relationship stage. This panel reads that stage to select appropriate stories rather than creating a duplicate single/dating/married/divorced state.
- The game’s existing preferences can influence conversations about football, music, films and religious discussion.
- Contact names are editable. Exported social reports omit those names.
- Social choices are disabled during an active driving shift.
- No real messages are sent, no real-world harassment report is filed, no external account is contacted, and no wallet or money transaction is added by Step 75.

### Keke hero image

The Step 74 transparent-background, realistic 3D-style Keke render remains in `public/assets/kano-life-keke-hero.webp` and is used on the start screen in place of the small flat vehicle illustration.

## Install using File Explorer / the repository GUI

1. Extract the ZIP.
2. Merge the included `js/`, `css/`, `public/`, `tests/`, and `docs/` folders into the existing `kano-run` repository folder.
3. Replace the root `index.html` with the supplied file.
4. Replace `js/KanoAppLaunchRecovery.js` with the supplied complete file.
5. Keep all other original files unless the archive explicitly includes a file at the same path. In particular, do **not** replace `js/main.js`, `js/game.js`, `js/ui.js`, `js/storage.js`, `js/config.js`, the 2D/3D renderers, package files, or your existing assets.
6. Preserve the previously installed Step 64–74 life-simulation modules. The supplied old source archive did not include every historical dependency expected by the cumulative `index.html`; the production repository is expected to retain those earlier files.
7. Check the start page in a desktop browser and a phone viewport. Verify the route/driver selects populate and that Start Driving changes into a live game or morning routine. If it still fails, note the visible error text and browser-console message.

## Verification results and boundaries

The merged offline validation workspace reported:

- `node --test tests/*.test.mjs`: **231 passed, 0 failed**.
- `node scripts/check-syntax.mjs`: **171 JavaScript files passed**.
- `node scripts/verify-release.mjs`: **13 checks passed, 0 warnings, 0 failures**, after restoring prior Step 64–70 dependency modules into the *validation workspace*.

The Vite build was **not verified**: the offline source copy does not have `node_modules`, and `npm run build` stopped with `vite: not found`. No Playwright browser run, real desktop/mobile gameplay test, live WebGL asset check, or Vercel deployment was performed. These limits are documented in `TEST-STATUS-Step75.txt`.

## Technical direction

The next stage should connect this social-memory graph to real NPC actors and locations in the Three.js scene while keeping one event loop, one authoritative game state, existing save APIs and an opt-in consent-centred story approach. Use real-time external sources only for features that truly require them; do not bundle or stream copyrighted music, films or sermons without the required rights.
