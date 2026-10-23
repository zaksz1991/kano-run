# Source baseline and preservation notes

Checked current public GitHub `main` source on 2026-10-23:

- https://raw.githubusercontent.com/zaksz1991/kano-run/main/index.html
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverSkillsPathways.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverSkillsPathwaysUpgrade.js
- https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverDigitalLifeUpgrade.js

The current-main entrypoint carries the PWA links, the four existing startup registrations, and Step 65's career-pathways registration. `index.html` in this package is derived from that current-main entrypoint with one Step 66 module tag appended after Step 65.

The current-main digital-life upgrade still showed the quote syntax defect from the supplied Vercel log; `js/KanoNorthernDriverDigitalLifeUpgrade.js` in this package retains the full Step 65-reviewed module behaviour and corrects that exact string to double quotes. No older `main.js`, `game.js`, renderer, CSS, service worker, manifest, or assets are included as replacements.
