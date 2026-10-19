# Integration Guide — Kano Driver Economy

## Purpose
`js/KanoDriverEconomyDirector.js` is an additive economy module for Kano Life. It models daily earnings, operating costs, fuel, savings, emergencies, debt, and keke hire-purchase. It does **not** directly change your game's wallet or render UI.

## Important wallet rule
Keep the existing game's wallet as the single source of truth. For a fare, repair, fuel purchase, or instalment:
1. Ask the authoritative wallet/economy layer to validate and commit the transaction.
2. Only after that succeeds, record the confirmed result in this module.
3. Do not independently subtract the same amount from both this module and the game's wallet.

Examples of the module API:

```js
import { KanoDriverEconomyDirector } from './KanoDriverEconomyDirector.js';
const economy = new KanoDriverEconomyDirector({ startingCash: 2500 });

// Call only after the main wallet has confirmed a fare payment.
economy.recordRevenue(850, 'passenger_fare', { route: 'Kano market run' });

// Ask this module whether the cash ledger can cover fuel; coordinate the actual
// wallet transaction in your integration layer before committing both systems.
const fuelQuote = 5 * economy.getSnapshot().fuelPricePerLitre;
if (economy.getSnapshot().cash >= fuelQuote) {
  // Main wallet transaction must succeed first.
  economy.buyFuel(5, economy.getSnapshot().fuelPricePerLitre);
}

// Track actual fuel use from the driving simulation.
economy.consumeFuel(0.8, 12);

// Subscribe UI to changes.
const unsubscribe = economy.on('change', snapshot => {
  // Update HUD/finance screen with snapshot.cash, snapshot.savings, snapshot.debt.
});
```

The snippet is an API illustration, not a drop-in patch to your current game. Match the authoritative wallet transaction flow before wiring it into live gameplay.

## Key methods
- `recordRevenue(amount, source, details)` — record confirmed income.
- `recordExpense(category, amount, details)` — records an expense only if the module's cash ledger can cover it.
- `buyFuel(litres, pricePerLitre)` / `consumeFuel(litres, kilometres)` — track fuel purchases and usage.
- `setFuelPrice(pricePerLitre, reason)` — update pump prices.
- `estimateDailyBudget()` / `settleDailyExpenses(options)` — calculate or process household, food, data, permit, and instalment costs. Use `settleDailyExpenses` only if its payments have been coordinated with the primary wallet.
- `startHirePurchase({ principal, deposit, dailyInstalment, totalDays })` — start a simulated hire-purchase agreement after confirming deposit affordability.
- `payHirePurchaseInstalment()` / `makeExtraHirePurchasePayment(amount)` — process simulated instalments.
- `depositSavings(amount)` / `withdrawSavings(amount)` / `repayDebt(amount)` — track personal finance.
- `recordEmergency(name, cost, { canBorrow, debtLimit })` — handle financial emergencies.
- `closeDay({ settleExpenses })` — archive daily totals and advance the day.
- `getSnapshot()` / `exportState()` / `importState(data)` / `reset()` — reporting and persistence.

## Events
Use `economy.on(eventName, callback)`; it returns an unsubscribe function. Events include `change`, `transaction`, `revenue`, `expense`, `fuel`, `fuel_price`, `budget`, `hire_purchase`, `payment_missed`, `ownership_complete`, `alert`, `day_closed`, `savings`, `debt`, `emergency`, `restore`, and `reset`.

## Persistence
Browser `localStorage` is used when available. Configure `storageKey` if separate save slots are needed. The module can also export/import JSON for a central save system.

## Integration checklist
- [ ] Decide which existing wallet owns the canonical cash balance.
- [ ] Connect confirmed fare income and operating expenses without double-charging.
- [ ] Connect actual litres consumed from the vehicle/fuel system.
- [ ] Show fuel price, cash, savings, debt, daily budget, and instalment status in the finance HUD.
- [ ] Decide whether household costs are automatic or player-confirmed.
- [ ] Add explicit UI confirmation before starting hire-purchase or paying instalments.
- [ ] Connect repair invoices from `KanoWorkshopRecoveryDirector` through one payment service.
- [ ] Test save/load and day rollover on desktop and mobile.

This module is not yet integrated into or deployed to the production game.
