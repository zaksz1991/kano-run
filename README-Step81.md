# Kano Life — Step 81
## Long Animation Frame attribution + cumulative startup repairs

Step 81 builds on Step 80's startup and observer reliability replacements and adds more useful performance evidence to the existing local runtime audit.

### What changed

`js/KanoLifeRuntimeAudit.js` continues recording uncaught errors, failed resources, unhandled promise rejections and main-thread long tasks. It now additionally attempts to observe the browser's `long-animation-frame` performance entry type. When supported, the diagnostic export records delayed frame duration, blocking duration, render/style-layout timestamps and a bounded list of script attribution values such as the script path, function entrypoint/invoker and timing. Query strings are stripped from source URLs, the report stays in memory until the user exports it, and no report is sent to any server.

This is designed for the previously observed multi-second stalls. The normal Long Tasks API may show that the main thread was blocked without identifying the contributing script; Long Animation Frames can provide better script attribution in supported browsers. The browser may not expose this API, so the existing diagnostic remains functional without it.

The ZIP also carries forward the 15 complete replacement modules from Step 80, including the household-water constant import and the Aure & Culture `SECTION_ID` declaration, rather than requiring the user to apply those fixes separately.

### Apply with File Explorer

1. Extract the ZIP.
2. Open `kano-step81-release`.
3. Copy its `js` and `tests` folders into the root of the existing Kano Run project.
4. Merge the folders and replace files with the same names when prompted.

All supplied changes are complete files. Do not replace `index.html`, `js/main.js`, `js/game.js`, `js/ui.js`, storage, renderer, project package files or game assets.

### Local verification

- `node --test tests/*.test.mjs`: 472 passed, 0 failed.
- Syntax check: 219 JS/MJS files passed.
- Release structure: 13 checks passed, no warnings or failures.
- Local module imports: 145 checked, zero missing.
- Three added tests exercise supported-browser capture, unsupported-browser fallback, and bounded attribution history.

### Limits

A Vite production build and interactive browser run were not completed in this offline workspace. These results do not prove that a production freeze is fixed or that the new script attribution is available in every browser. If the browser does not support Long Animation Frames, the feature reports itself unavailable and does not affect startup.
