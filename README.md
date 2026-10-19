# Kano Life — Market Society Upgrade

Three modular systems for the next simulation milestone:

1. `KanoMarketDayDirector.js` — market-day schedule, time-of-day demand, congestion and demand pulses.
2. `KanoDriverSociety.js` — persistent NPC identities, personality-weighted driving/social decision hints, reputation, fatigue and outcomes.
3. `KanoVehicleOwnership.js` — owner-driver, hire-purchase, remittance, shared-shift records, payments and transfer-on-final-payment.

## Validation

JavaScript syntax checks are required after changes. The modules are designed to be testable in isolation, but they have not been connected to or tested against the production game. No live site changes are made by this package.

See `INTEGRATION.md` for the connection points and safeguards.
