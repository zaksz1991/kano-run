# Kano Life — Vehicle Lifecycle & Ownership Upgrade

A standalone ES module for persistent vehicle wear, maintenance warnings, overheating, breakdowns, repair quotes, workshop/roadside repairs, and hire-purchase progression.

## Included
- `js/KanoVehicleLifecycleDirector.js` — complete module.
- `INTEGRATION.md` — integration guide and wallet-safety examples.
- `package.json` — package metadata and syntax-check command.

## Safety of integration
This module does not move 3D vehicles, detect collisions, or deduct currency. Connect it to the existing physics and wallet systems. Repair and installment methods require an explicit `paymentConfirmed: true` flag after the authoritative wallet has confirmed payment.

## Status
Standalone package. Not integrated into the live Kano Run game.
