KANO LIFE — STEP 57
AURE, RELATIONSHIPS & NORTHERN CULTURAL LIFE

PURPOSE
Adds an additive life-simulation layer for Aure (marriage), dating, single life, engagement, marriage, separation and divorce; peer pressure and gossip stories; named women keke-driver colleagues; everyday interactions with adult workers who moved to Kano from other Nigerian states; respectful Almajiri community-support stories; Hausa meals; and an opt-in private women's wellbeing tracker.

FILES IN THIS UPDATE
- js/KanoNorthernDriverAureAndCulture.js
- js/KanoNorthernDriverAureAndCultureUpgrade.js
- js/KanoNorthernDriverRoadComplianceUpgrade.js (complete Step 56 endpoint with one additive import that loads the new module)
- tests/KanoNorthernDriverAureAndCulture.test.mjs
- tests/KanoNorthernDriverAureAndCultureIntegration.test.mjs

INSTALLATION
1. Extract into the existing Kano Run project root, where index.html and package.json live.
2. Replace js/KanoNorthernDriverRoadComplianceUpgrade.js with the complete file from this ZIP. This exact endpoint is part of Step 56 and is extended only by the new import; it does not replace main.js, game.js, renderer3d.js, or index.html.
3. Add js/KanoNorthernDriverAureAndCulture.js and js/KanoNorthernDriverAureAndCultureUpgrade.js.
4. Copy both test files into the existing tests directory.
5. Keep every other file and Claude's repair changes unchanged. Step 56's fuel-economy -> road-compliance import chain must already be installed.

FEATURES
- Relationship status: single, dating, engaged/preparing for Aure, married, separated, divorced.
- Pros and trade-offs are explained neutrally. Age/gender social pressures are events rather than inevitable penalties.
- Adult, non-graphic relationship-boundary situations include loyalty, consent, honesty and social consequences.
- Named women drivers: Asabe, Talatu, Altine, Jummai, Laraba, Hajara, Hauwa, Hadiza, Falmata, Binta, Rabi and Maryam. They are named life-simulation colleagues; this update does not claim to add unique 3D rigs for them.
- Company worker stories include adults who move to Kano from different Nigerian states.
- Almajiri scenes are community-support stories about children and never romantic scenes.
- Hausa meal choices: tuwo da miyan kuka, shinkafa da wake with grounded pepper and groundnut oil, Gurasa, akara da kunu. Game prices are not current market prices.
- Optional private women's wellbeing tracker (off by default): fictional cycle calendar, pregnancy-check event after an opted-in adult intimacy scenario, symptom concern log for unusual discharge/irritation or urinary discomfort, qualified-care/antenatal record, mood/wellbeing meter and cosmetics/skin-care choices including a simulated risk for uncertain skin-lightening cream.
- The health tracker is for fictional roleplay only. It makes no diagnosis and provides no prescriptions. Real symptoms require qualified healthcare advice. User can disable the tracker; data stays in local browser storage.
- All romance/intimacy is non-graphic and only between consenting adults. No sexual scenarios include minors.
- Meal, healthcare and cosmetic purchases debit the existing save wallet and are prevented while a gameplay segment is active. No second spendable wallet is added.

VALIDATION
See TEST-STATUS-Step57.txt. Tests are source-level; no claim of full repaired-project or browser rendering verification is made.
