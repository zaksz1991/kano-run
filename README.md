# Kano Life — Step 67: Employment Schedule & Weekly Payroll

This package is based on the current public `main` source for `zaksz1991/kano-run`, inspected on 2026-10-23. The supplied `index.html` mirrors that main-branch entrypoint's existing HTML, PWA links, and startup module order, with one additive final entrypoint for the Step 67 employment schedule module. It does not replace `main.js`, `game.js`, `renderer3d.js`, model assets, service worker, or manifest.

## Feature

- Loads the existing Step 66 employment-market UI and extends accepted offers with a work schedule and attendance panel.
- Shows current accepted role, fictional salary range, scheduled working days, attendance, unpaid family/health leave, and weekly payroll records.
- Calculates per-attendance-day pay from the midpoint of the opening's fictional monthly salary range, using a 22-day or 26-day schedule divisor.
- One date can only be attended or marked as leave once. Career actions are disabled during active driving.
- Payroll is calculated only from explicitly recorded workdays; missed days and unpaid leave earn no pay.
- Weekly payday is due after a complete seven-day period. When the player leaves employment, recorded work in the final partial period is settled once.
- Uses the existing `save.money` wallet and `persist()` from `storage.js`; payroll receipts are stored with that save for duplicate-credit protection.
- Exports a JSON report and persists employment schedule history in `localStorage`.
- Does not automatically generate driving fares, change game clock, enforce job attendance by blocking driving, or claim real jobs/salaries.

All employment openings and salary figures are fictional roleplay data.

## Install

Extract this ZIP into the current Kano Run project root (same folder as `package.json`). Replace the complete `index.html` with the supplied current-main-based version; add:

- `js/KanoNorthernDriverEmploymentSchedule.js`
- `js/KanoNorthernDriverEmploymentScheduleUpgrade.js`

The schedule upgrade imports the current Step 66 `KanoNorthernDriverEmploymentMarketUpgrade.js`, activating the career market and salary schedule together. Keep that current module and its `KanoNorthernDriverEmploymentMarket.js` base module in `js/`.

Keep all other current project files untouched. In particular, do not replace `main.js`, `game.js`, `renderer3d.js`, `storage.js`, PWA files, CSS, assets or Claude's renderer repairs.

## Tests

Run the isolated suite using Node's test runner from the project root:

`node --test tests/KanoNorthernDriverEmploymentSchedule.test.mjs`

This does not replace the full current-repository/Vercel build verification.

## Additional integration safety

- The payroll credit path checks the boolean returned by the current `storage.js` `persist()` method. If saving fails or returns `false`, it restores the previous in-memory wallet value and the previous payroll receipt value rather than claiming the payday was saved.
- If a payroll receipt already exists, a retry marks the payroll row paid without crediting the wallet again.
- `tests/KanoStep67EntryPointIntegration.test.mjs` checks that the current-main startup modules and PWA links are retained, that Step 66 employment UI is imported, and that the payday storage failure guard stays present.

## Validation scope

Isolated tests and JavaScript syntax checks do not substitute for a production build against the full current repository. Verify the complete working tree and `npm run build` in the current repository before deploying.
