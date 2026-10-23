# Kano Life — Step 70: Lefe and Aure Negotiation

## Source baseline

Built from the current public `main` sources checked on 2026-10-23, not by copying an older Step ZIP:

- `https://raw.githubusercontent.com/zaksz1991/kano-run/main/index.html`
- `https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverAureJourney.js`
- `https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverAureJourneyUpgrade.js`
- `https://raw.githubusercontent.com/zaksz1991/kano-run/main/js/KanoNorthernDriverAureAndCultureUpgrade.js`

The supplied `index.html` is based on that live entrypoint and retains its six existing startup modules, manifest link, Apple touch icon, and stylesheet. It adds one final module script for Step 70. The new runtime imports the existing `KanoNorthernDriverAureJourneyUpgrade.js`, which imports the existing Aure/cultural, family-responsibility and career-progression layers.

## What this adds

- A locally saved, family-customisable Lefe list with editable line quantities and a custom family-requested item.
- Fictional game-balancing prices, clearly labelled as not current Kano market prices and not a universal required list.
- A family-list discussion where players can ask for an item breakdown, reduce optional scope, request voluntary elder mediation, or pause and save.
- A richer-suitor situation showing the tension between a low-income relationship and family financial expectations. The partner can choose to stay, consider the decision, or choose another proposal; neither the woman nor man is treated as property.
- Family-pressure follow-up, explicit mutual partner commitment, and agreement gating that requires an engaged profile, partner commitment and a family discussion status.
- Actual purchases through the existing `save.money` wallet, only after a list is agreed and while off-shift. Purchases cannot exceed planned quantities, and the ledger and wallet are rolled back together if persistence fails.
- Exportable local report without partner names, real contacts or private message content.

The list items are examples, not a claim that every Hausa/Northern Nigerian family asks for the same items. A Lefe list is configurable by the story. No choice automatically changes the Aure profile; completing the shopping list does not mean a marriage happened.

## Files

- Replace: `index.html` (current public main entrypoint plus one additive Step 70 import)
- Add: `js/KanoNorthernDriverLefeNegotiation.js`
- Add: `js/KanoNorthernDriverLefeNegotiationUpgrade.js`
- Add: `tests/KanoNorthernDriverLefeNegotiation.test.mjs`
- Add: `tests/KanoNorthernDriverLefeNegotiationIntegration.test.mjs`

No `main.js`, `game.js`, `renderer3d.js`, storage core, service worker, manifest, CSS, or model asset replacement is included.

## Install

Extract to the existing Kano Run project root containing `index.html` and `package.json`. Replace `index.html` with the supplied complete file; add the new JavaScript modules and tests to their matching folders. Preserve all existing files and the Claude repairs. The added module script loads the current Aure relationship layer before creating the Lefe panel in LIFE & CAREER.

## Validation

Run:

```text
node --test tests/KanoNorthernDriverLefeNegotiation.test.mjs tests/KanoNorthernDriverLefeNegotiationIntegration.test.mjs
```

Source-level tests do not replace a full Vite/Vercel production build or browser/phone verification. All listed prices are fictional balancing values.
