KANO LIFE / KANO RUN — STEP 58
Society, markets, street commerce and cost-of-living simulation

WHAT THIS UPGRADE ADDS
- Optional faith/community calendar for Muslim, Christian, other/personal, no-routine, or private preference. Festival timing is illustrative game timing, not actual lunar or liturgical dates.
- Daily scenario choices about electricity contributions, rising household food costs, market levies/receipts, fictional unfulfilled public-service promises and unverified electoral allegations, cross-tribe fairness, farmers, festival invitations, and neighbourhood shops.
- A current-game-day street-commerce target of approximately 70% active shopfronts across the renderer's building slots. An additive Renderer3D hook adds procedural fascia, awnings, shutters, doors and display tables to selected building slots. It does not replace renderer3d.js.
- A Kano market guide: Dawanau (grains), Yankaba (vegetables), Yan Lemo/Naibawa (fruit), Kantin Kwari (textiles), Kofar Wambai (second-hand clothing/footwear and mixed goods), Kurmi (crafts/leather and traditional merchandise), Sabon Gari/Abubakar Rimi (general merchandise/food provisions), Kwanar Singer (groceries/provisions), and Farm Centre (electronics/services).
- Household pantry shopping and an optional small side trade: provisions kiosk, grain/root produce, fruit/vegetable table, thrift/footwear table, or fabric table. Stock must be purchased before sale; sales may generate a simulated margin or loss.
- Clothing, footwear, hairstyle/grooming preferences and a wallet-backed store. Previously purchased styles can be equipped again for free. Current implementation saves style preferences; it does not remodel character GLB geometry.
- Optional weekly electricity contribution and small-trader levy reserve. Bills never charge automatically; payments are blocked during an active driving segment. Repeated attempts do not duplicate the same weekly bill/arrear.
- Saved community/civic/market trust meters and a bounded activity ledger.

IMPORTANT DESIGN NOTES
- All in-game prices, bill amounts, stock units, market price movements and festival dates are fictional balancing values. They are not current Nigerian prices, official tax/levy schedules, NEPA tariffs, or a real religious calendar.
- Civic/political events use fictional local actors and frame electoral fraud as an allegation requiring evidence, not as a verified claim about any actual election or person.
- No ethnic group has an inherent gameplay penalty. Discriminatory choices have social costs; fair service builds cross-community trust.
- The 70% frontage value is the requested scene-design target. The additive hook decorates selected Renderer3D building slots when the plugin loads before/while the scene builds. Validate actual fit with the currently installed GLB buildings in the running WebGL game; this environment did not perform a browser render.
- This ZIP deliberately does NOT replace main.js, game.js, renderer3d.js, index.html, service worker, manifest, CSS, or any Claude-repaired core file.

INSTALLATION
1. Extract the ZIP into the existing Kano Run project root.
2. Replace this complete file:
   js/KanoNorthernDriverAureAndCultureUpgrade.js
3. Add these new files:
   js/KanoNorthernDriverKanoSocietyMarkets.js
   js/KanoNorthernDriverKanoSocietyMarketsUpgrade.js
4. Copy these tests into the existing tests folder:
   tests/KanoNorthernDriverKanoSocietyMarkets.test.mjs
   tests/KanoNorthernDriverKanoSocietyMarketsIntegration.test.mjs
5. Preserve all previous Step 45–57 files and the Claude repair files. Step 57's Aure/Culture upgrade must already be installed.

The addon is loaded by the existing Step 57 Aure/Culture module through one additional import. No manual code insertion is required.
