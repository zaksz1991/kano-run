# Kano Life — Driver Economy Upgrade

Standalone JavaScript simulation for a keke driver's working finances in Kano.

## Includes
- Daily fare revenue and operating expenses
- Fuel price changes, purchases, and consumption
- Household, food, mobile data, and permit budget estimates
- Savings deposits and withdrawals
- Emergency costs and optional controlled borrowing
- Debt repayment and hire-purchase instalments
- Daily reports, alerts, ledger entries, and persistent state
- Event callbacks for HUD and finance-screen integration

## File
- `js/KanoDriverEconomyDirector.js` — complete ES module.

## Compatibility
Designed for modern browsers and Vite/ES modules. It uses browser `localStorage` when available and can be tested in Node by passing `{ autoLoad: false }`.

## Status
Standalone add-on. It is not connected to the production game wallet, UI, or deployed site. Read `INTEGRATION.md` before connecting it to avoid duplicate wallet deductions.
