KANO LIFE / KANO RUN — STEP 60
Household power, NEPA outage rhythm and generator reserve

WHAT THIS ADDS
- A LIFE & CAREER panel for fictional household electricity-supply patterns and daily outage estimates.
- Persistent generator fuel reserve and single-hour generator use; the fuel bundle is paid at purchase and is not charged again when used.
- Per-day generator-use limit to avoid unlimited repeated power actions.
- Utility-service complaint records for no supply, meter/billing questions and low voltage.
- Exportable household utility report and a short persistent action ledger.
- A deterministic outage estimate and food-storage risk reminder, without automatically destroying pantry items or applying hidden losses.

BILLING INTEGRITY
The existing Step 58 Society & Markets panel continues to manage the weekly NEPA / household electricity contribution. Step 60 deliberately creates no second electricity bill. Generator fuel is a separate household backup cost, paid once on purchase. Vehicle fuel remains separate from generator fuel.

DESIGN NOTES
All supply-hour ranges, generator costs, interruption schedules and risk labels are fictional gameplay values. They are not real tariff bands, current supply schedules, official NEPA/DisCo information or live prices. Complaint logging provides no guaranteed repair, cash award or civic-reputation reward.

INSTALLATION
Requires Step 57–59 and the existing repaired-project import chain.
1. Extract this ZIP into the existing Kano Run project root.
2. Replace the complete file: js/KanoNorthernDriverFestivalEconomyUpgrade.js (this only adds the Step 60 module import; the rest of Step 59 is preserved).
3. Add: js/KanoNorthernDriverHouseholdUtilities.js
4. Add: js/KanoNorthernDriverUtilitiesUpgrade.js
5. Copy the two test files into the existing tests folder.

Do NOT replace main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS, assets, or other Claude-repaired files. The panel appears within LIFE & CAREER after the festival/market section.
