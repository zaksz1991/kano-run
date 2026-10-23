KANO LIFE / KANO RUN — STEP 63
Phone, calls, messages and everyday communication

PURPOSE
Adds an optional LIFE & CAREER panel for airtime, daily incoming messages and missed calls, communication choices, contact-specific trust, and a short activity ledger. Scenarios reflect family responsibilities, Aure-related social pressure, partner communication, market contacts, keke park coordination, company work, household bills and community occasions.

SAFETY AND FINANCIAL BEHAVIOUR
- Phone actions and airtime top-ups are disabled during active driving/gameplay.
- Airtime top-ups deduct the selected amount from the existing save.money wallet and roll it back if the phone state cannot be stored.
- Calls/replies spend phone airtime; no extra wallet debit is made for a call or message after the top-up.
- Ignoring a message is free, but can reduce only the phone system's contact-specific bond score.
- Contact scores are deliberately separate from Aure trust, family trust and passenger trust; this add-on does not silently overwrite other systems.
- Messages are generated deterministically by in-game day, stored locally, bounded to 40 inbox items and expire after two in-game days.
- The system does not access the real phone, contacts, SMS, call logs, or network.

INSTALLATION
Prerequisites: Steps 57–62 must already be installed, including the household-water → family-responsibilities chain.
1. Extract this ZIP into the project root folder containing index.html and package.json.
2. Replace js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js with the included complete replacement. It preserves the Step 62 implementation and adds one import for the new phone module.
3. Add js/KanoNorthernDriverPhoneLife.js and js/KanoNorthernDriverPhoneAndCommunicationUpgrade.js.
4. Copy both tests/*.test.mjs files into your existing tests folder.

DO NOT replace main.js, game.js, renderer3d.js, index.html, the service worker, manifest, CSS, 3D assets, or any Claude-repaired core files. This ZIP deliberately contains only the one changed integration file plus new phone modules and tests.

VALIDATION
Run these focused tests with Node.js in your project environment:
  node --test tests/KanoNorthernDriverPhoneLife.test.mjs tests/KanoNorthernDriverPhoneLifeIntegration.test.mjs
Syntax-check js/KanoNorthernDriverPhoneLife.js and js/KanoNorthernDriverPhoneAndCommunicationUpgrade.js in the same module configuration as the project.

Limits: this add-on has not been verified in a browser against the complete current repaired project. Pricing (airtime amounts and call/message costs) is fictional gameplay tuning, not a claim about Nigerian network tariffs. The app models phone communication locally; it does not make actual calls or send messages.
