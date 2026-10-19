# Kano Life — Workshop & Recovery Upgrade

A standalone ES module for playable repair-workshop and breakdown-recovery workflows.

## Included
- Four configurable logical workshop records in Kano districts.
- Component repair quotations for tyres, engine, cooling, brakes, suspension, electrical, and bodywork.
- Repair booking, payment-confirmation boundary, in-game repair timers, and pickup completion.
- Recovery quotations with distance, incident severity, after-hours pricing, dispatch, and ETA.
- Event callbacks, job/recovery history, and export/import persistence.

## Validation
Syntax and isolated workflow smoke tests should be run in the target project. This package is an additive module; it is not automatically integrated into the live game and does not contain 3D workshop assets.

## Safety against duplicate money systems
The module deliberately never deducts cash. Charge through the game's existing wallet and pass the confirmed transaction reference into the module. Never treat a quote or booking as proof that payment occurred.
