KANO LIFE — STEP 42
TOUCH-FRIENDLY KEKE DIAGNOSTIC EXPORT

Purpose
- Extends Step 41's opt-in ?debugKeke=1 diagnostics panel with buttons for Copy report and Save report .txt.
- Captures the latest already-computed diagnostic snapshot without running additional scene-tree traversals.
- Uses the Clipboard API when available and attempts a document selection fallback when clipboard permission is unavailable.
- Saves a plain-text report through a temporary object URL where browser download APIs are supported.
- Clearly reports copy/download success or failure in the panel.
- Keeps diagnostic overlay disabled during normal gameplay. The overlay is pointer-transparent except for its two accessible, touch-friendly action buttons.
- Does not change game physics, player transforms, vehicle replacement logic, render cadence or scene traversal.

Installation
1. Extract this ZIP into the existing Kano Run project folder containing index.html and package.json.
2. Replace js/KanoKekeRuntimeDiagnostics.js with the complete replacement file included here.
3. Copy tests/KanoKekeRuntimeDiagnostics.test.mjs into the existing tests folder, replacing the previous Step 41 test of the same filename.
4. Keep the Step 41 renderer and its support modules installed; this update deliberately changes only the diagnostics module, its focused test and documentation.
5. Open the game with ?debugKeke=1 to show the diagnostic panel. Tap Copy report or Save report .txt. Remove the query parameter to return to normal UI.

Do not replace main.js, game.js, renderer3d.js, index.html, CSS, vehicle assets, traffic modules or day-cycle modules for this update.

Validation
- Run: node --test tests/*.test.mjs
- Syntax-check js/KanoKekeRuntimeDiagnostics.js with node --check.
- The Node suite tests both the diagnostics feature and the existing Step 41 safeguards.
- No browser download behavior, WebGL screenshot, or physical-phone rendering has been verified in this package builder.
