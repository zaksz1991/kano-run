# Kano Life — Step 91: Economy Clarity and Payout Rules

## What this update changes

- The driving HUD and run report show **score points**, not naira.
- The start page labels the spendable wallet separately from completed-run payouts.
- The saved-run button previews the estimated payout, making it clear that fares in an unfinished run are not yet part of the wallet.
- The run report provides a line-by-line payout calculation.
- The payout rule for runs completed after this update is **65% of gross passenger fares + a score bonus**. The other 35% is a simulated running-cost reserve. The bonus is 1% of score points capped at the lower of 5% of gross fares or ₦3,000.
- Wallet cash is only credited when a run ends permanently and the save succeeds. Continuing a crash/soft-over run does not bank those fares.
- Existing wallet balances and previously stored banking history are retained. Historical transactions are marked as legacy when normalized; no retroactive wallet credit is applied.
- Career statistics say **completed runs** so an in-progress/saved run with kilometres and XP is not mistaken for a completed run.

## Example from the reported screen

For score **176,274** and gross fares **₦90,863**:

- Gross passenger fares: ₦90,863
- Running-cost reserve (35%): ₦31,803
- Take-home fare payout (65%): ₦59,060
- Score bonus (1% score, subject to caps): ₦1,762
- **Estimated total payout: ₦60,822**

This is an estimate for that active run. It is not added to the existing ₦3,550 wallet until the run ends permanently and the browser confirms the save.

## Files

Complete replacement files are supplied under `js/` and `index.html`; one additive CSS file is supplied under `css/`; regression tests under `tests/`. The game engine, renderers, storage key, assets, Three.js import map, static-CSS import shim, and existing career/simulation modules are not replaced.

## Apply with File Explorer or GitHub

Copy the ZIP's `index.html` into the repository root; merge `js/`, `css/`, and `tests/` into their existing folders; replace files with matching names. Keep all other files unchanged.

## Verification and limits

The saved source snapshot passed the focused calculation checks and the isolated storage smoke test. Full browser validation against the production website and the current GitHub branch was not available from this workspace. Do not treat this package as deployed until the next live build and browser audit confirm the payout panel and wallet update.
