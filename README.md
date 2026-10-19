# Kano Life — Systemic Events Upgrade

A lightweight event scheduler for dynamic transport-life gameplay: passenger demand, fuel reminders, KAROTA checkpoint warnings, road hazards, market congestion, fare negotiation, and rest opportunities.

## Contents
- `js/KanoSystemicEventDirector.js` — complete ES module
- `INTEGRATION.md` — integration steps and example wiring
- `tests/smoke-test.mjs` — deterministic smoke test

## Important
This is an additive module, not a modification of the live Kano Run site. It does not create visual objects by itself. Connect callbacks to the existing game UI, model/traffic systems, sound director, and driver state. Avoid creating duplicate physics, traffic, or animation loops.

## Run the smoke test
From this package directory, run `node tests/smoke-test.mjs` in an environment with Node.js installed. No third-party dependency is required.
