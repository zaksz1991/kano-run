# Kano Life — Step 72: Adashi & Neighbourhood Support

This is a cumulative patch pack built on the Step 71 entrypoint and its Step 69–71 life modules. It adds an optional in-game rotating-savings circle and persistent neighbourhood contacts while keeping the existing game wallet as the only wallet.

## ZIP contents

- `index.html` — same current entrypoint and startup order, with one additional Step 72 module tag after the Step 71 panels.
- `js/KanoNorthernDriverAdashiSupport.js` — pure state model, fictional weekly circle, payout accounting, missed-payment standing, contact trust, support actions and report export.
- `js/KanoNorthernDriverAdashiSupportUpgrade.js` — accessible responsive career panel; commits Adashi state and wallet balance using the existing `storage.js` `save` and `persist()` APIs.
- `js/KanoNorthernDriverAureJourney.js`, `js/KanoNorthernDriverAureJourneyUpgrade.js`, `js/KanoNorthernDriverLefeNegotiation.js`, `js/KanoNorthernDriverLefeNegotiationUpgrade.js`, `js/KanoNorthernDriverParenthood.js`, `js/KanoNorthernDriverParenthoodUpgrade.js`, `js/KanoNorthernDriverSeasonalBridgeCore.js`, `js/KanoNorthernDriverSeasonalEnvironmentBridge.js`, `js/KanoNorthernDriverSeasonalResilience.js`, and `js/KanoNorthernDriverSeasonalResilienceUpgrade.js` — carried-forward Step 69–71 modules required by the bundled entrypoint.
- `tests/` — Step 69–72 automated model and integration-contract tests.
- `docs/Kano-Life-Research-Step72-Adashi-and-Social-Simulation.md` — detailed research summary, sources, assumptions, verification status, risks, and advanced-life-simulation roadmap.
- `TEST-STATUS-Step72.txt` and `test-output.txt` — recorded automated-test results.

## What the upgrade does

### Adashi circle

The player can create a 4–8-person fictional circle, choose one of four weekly contribution amounts, and select a payout position. Creating a circle costs nothing. When a contribution is due, the system checks and debits the existing banked wallet once. The pot is displayed as game simulation. Only an eligible player payout credits the player's existing wallet. NPC payouts are narrative/system records, not player income.

The in-game weekly due date advances seven simulation days after a turn is settled. Missed contributions lower community reputation and suspend payout eligibility; two consecutive on-time contributions restore eligibility for a future player turn. A circle can be closed between completed cycles, before the next contribution is paid. Closed-circle summaries remain in the local save.

### Neighbourhood support

Contacts have persistent trust, role and interaction history. The player can offer a road update, referral, mechanic lead or practical check-in, or request local information. Only one social action is accepted per simulation day, and each contact has a request cooldown. Responses are narrative guidance; they do not manufacture money, repair vehicles or create real passenger jobs.

### Economy and privacy safeguards

- No second wallet or cash value is created.
- The wallet and `save.lifestyle.adashiSupportV1` record are committed through the existing save object and `persist()` call.
- Actions are locked during the driving state.
- Game money is fictional. Values are not advertised as current or recommended real-world contribution rates.
- The downloadable report contains fictional game records; the module does not collect bank details, phone numbers or real contact records.

## GUI installation

1. Download the ZIP and extract it.
2. Merge the extracted `js/`, `tests/` and `docs/` folders into the existing `kano-run` repository folder, allowing the supplied Step 69–72 modules to be added or updated.
3. Replace the repository root `index.html` with the ZIP's `index.html` so Step 72 is loaded once after Step 71.
4. Preserve the project's existing core files and assets. **Do not replace** `js/main.js`, `js/game.js`, `js/renderer3d.js`, `js/renderer2d.js`, `js/storage.js`, core CSS, `package.json`, assets or PWA files with anything from this patch; they are deliberately not included.
5. The life/career panel appears when the existing `#kano-life-career-screen` is available. All money actions rely on the existing `storage.js` API.

## Verification boundary

The packaged test suite has **93 passing tests and 0 failures** under Node's test runner. The two new runtime modules pass syntax checks. This proves the tested model transitions and static entrypoint contracts only. A Vite production build, DOM/browser run, mobile visual check, live Vercel deployment, wallet reload, cloud-save sync and actual advancing simulation-day source have not been verified in this environment.

If weekly turns never become due after the update, the live build's schedule/life-day source must be checked before using the weekly circle; the model deliberately does not invent a second clock.
