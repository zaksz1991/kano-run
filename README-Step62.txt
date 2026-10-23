KANO LIFE / KANO RUN — STEP 62
Family responsibilities, time commitments and unexpected life events

WHAT THIS ADDS
- One deterministic, persisted family/social situation per in-game day.
- Culturally grounded but optional scenarios covering school needs, Aure invitations, suna, elder visits, home repairs, market help, condolences, cost-of-living pressure, time conflicts and relationship communication.
- Four choices: contribute now, promise a contribution by a visible due date, offer time/practical help, or explain boundaries respectfully.
- A persistent commitment board with due/overdue state, payments, non-financial task completion, and bounded due-date renegotiation.
- Current relationship status and existing family-trust meter shown read-only, without creating a second trust score.
- JSON export of current commitments and recent history.

FINANCIAL / GAMEPLAY INTEGRITY
- Uses existing `save.money` as the single spendable wallet.
- No automatic charges; promises only become payments when the player selects PAY.
- Decisions and commitment payments are locked during active driving.
- Each daily event can be resolved only once. Re-loading the panel on the same day does not reroll it.
- Unanswered daily situations lapse when the calendar advances without taking money or imposing a forced penalty.
- Values are fictional game balancing, not actual prices or social rules.
- This panel tracks commitments, not relationship trust; the existing social/Aure modules remain authoritative for their own meters.

INSTALLATION
Requires Step 61 household water module in the existing chain.
1. Extract this ZIP into the existing project root.
2. Replace the complete file: `js/KanoNorthernDriverHouseholdWaterUpgrade.js`. The replacement preserves all Step 61 water functionality and adds one import for the Step 62 panel.
3. Add `js/KanoNorthernDriverFamilyResponsibilities.js` and `js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js`.
4. Copy both included tests into the existing `tests` folder.

PRESERVE THE REPAIRED CORE
Do not replace `main.js`, `game.js`, `renderer3d.js`, `index.html`, service worker, manifest, CSS, model assets, or Claude's Step 48 repair files. This update changes only the Step 61 integration bridge and adds its own modules/tests.

VALIDATION
Focused Node tests and syntax checks are run against the included Step 62 files. This is not a full build or validation of the entire repaired repository. Browser visuals and physical-phone performance remain unverified.
