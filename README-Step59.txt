KANO LIFE / KANO RUN — STEP 59
Festival seasons, family occasions and seasonal market economy

WHAT THIS UPGRADE ADDS
- A deterministic simulated season helper aligned with Step 58's broad calendar conventions: family ceremonies, farm produce arrivals, optional Ramadan/Eid periods and Christian/community celebration periods.
- Optional festival and household occasion budget planner inside LIFE & CAREER.
- Seasonal modifiers feed the existing marketGoodPrice function and therefore affect household purchases and small-business buying/selling. Base day index and weekly price swing remain in place.
- A forecast panel shows current and upcoming market conditions and explains which categories have a simulated price modifier.
- Budget plan is saved locally and can be exported as JSON. It is a planning-only estimate and never debits or reserves wallet money.
- Existing shopping and resale transactions continue to use the existing wallet and inventory helpers; no new wallet is created.

DESIGN NOTES
- All prices and seasonal dates are fictional gameplay balancing. This is not a live market quote, actual lunar calendar, Christian liturgical calendar or religious timetable.
- Selecting a faith preference changes illustrative market context only. No worship, festival participation, dress, spending or relationship choice is mandatory.
- Step 59 only replaces the two complete Step 58 market module files and adds two new modules and tests. It does NOT replace main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS or Claude repair files.

INSTALLATION
1. Extract the ZIP into the existing Kano Run project root.
2. Replace complete files:
   js/KanoNorthernDriverKanoSocietyMarkets.js
   js/KanoNorthernDriverKanoSocietyMarketsUpgrade.js
3. Add new files:
   js/KanoNorthernDriverFestivalEconomy.js
   js/KanoNorthernDriverFestivalEconomyUpgrade.js
4. Copy these tests to the existing tests directory:
   tests/KanoNorthernDriverFestivalEconomy.test.mjs
   tests/KanoNorthernDriverFestivalEconomyIntegration.test.mjs
5. Step 57 and Step 58 must already be installed. Keep the existing core repairs and all unrelated upgrades unchanged.
