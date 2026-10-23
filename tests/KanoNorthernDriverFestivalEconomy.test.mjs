import test from 'node:test';
import assert from 'node:assert/strict';
import {
  marketSeasonForDay, seasonalMarketMultiplier, seasonalPriceEffectPercent,
  nextMarketSeason, normalizeFestivalBudget, festivalBudgetSummary,
} from '../js/KanoNorthernDriverFestivalEconomy.js';
import { marketGoodPrice, createDefaultSocietyState, buyMarketStock, sellMarketStock } from '../js/KanoNorthernDriverKanoSocietyMarkets.js';

test('season calendar follows the same broad family-ceremony priority as Step 58', () => {
  assert.equal(marketSeasonForDay(28, 'muslim').id, 'family-ceremony');
  assert.equal(marketSeasonForDay(56, 'christian').id, 'family-ceremony');
  assert.equal(marketSeasonForDay(6, 'private').id, 'ordinary-market');
});

test('faith preference changes illustrative festival-season context but never forces an action', () => {
  assert.equal(marketSeasonForDay(10, 'muslim').id, 'ramadan-preparation');
  assert.equal(marketSeasonForDay(30, 'muslim').id, 'eid-community-period');
  assert.equal(marketSeasonForDay(30, 'christian').id, 'christian-community-period');
  assert.equal(marketSeasonForDay(30, 'none').id, 'ordinary-market');
});

test('harvest arrivals soften grain buy prices and remain deterministic', () => {
  assert.equal(seasonalMarketMultiplier('grains-roots', 8, 'buy', 'private'), 0.94);
  assert.equal(seasonalMarketMultiplier('grains-roots', 8, 'sell', 'private'), 0.97);
  assert.equal(seasonalMarketMultiplier('textiles', 8, 'buy', 'private'), 1);
});

test('festival season affects existing marketGoodPrice buying and selling calculations', () => {
  const ordinaryBuy = marketGoodPrice('rice-wake-pack', 1, 'buy', 'none');
  const eidBuy = marketGoodPrice('rice-wake-pack', 30, 'buy', 'muslim');
  const ordinarySell = marketGoodPrice('rice-wake-pack', 1, 'sell', 'none');
  const eidSell = marketGoodPrice('rice-wake-pack', 30, 'sell', 'muslim');
  assert.ok(eidBuy > 0 && eidSell > 0);
  // This asserts different deterministic contexts, not that every day must have a higher price.
  assert.notEqual(eidSell, ordinarySell);
  assert.notEqual(eidBuy, ordinaryBuy);
});

test('seasonal resale demand flows through real stock buy/sell helpers without double wallet credit', () => {
  let state = createDefaultSocietyState(); state.tradingBusiness = 'provisions-kiosk'; state.faithPreference = 'muslim';
  const buy = buyMarketStock(state, { goodId: 'rice-wake-pack', qty: 1, day: 1, wallet: 10000, activeShift: false });
  assert.equal(buy.ok, true);
  const beforeSellWallet = buy.wallet;
  const sell = sellMarketStock(buy.state, { goodId: 'rice-wake-pack', qty: 1, day: 30, wallet: beforeSellWallet, activeShift: false });
  assert.equal(sell.ok, true);
  assert.equal(sell.wallet, beforeSellWallet + sell.revenue);
  assert.ok(sell.revenue > 0);
});

test('next season search is bounded and normalized', () => {
  const next = nextMarketSeason(1, 'muslim', 84);
  assert.ok(next);
  assert.ok(next.daysUntil >= 1 && next.daysUntil <= 84);
  assert.equal(next.day, 1 + next.daysUntil);
  assert.equal(nextMarketSeason(1, 'private', 0)?.daysUntil >= 1, true);
});

test('festival budget clamps unsafe values and accurately flags a cash shortfall', () => {
  const budget = normalizeFestivalBudget({ occasion: 'wedding', food: -12, clothing: 9999999, transport: 'invalid', gifts: 2000, household: 1500 });
  assert.equal(budget.food, 0); assert.equal(budget.clothing, 250000); assert.equal(budget.transport, 0);
  const sum = festivalBudgetSummary({ food: 2500, clothing: 3000, transport: 1200, gifts: 500, household: 800 }, 5000);
  assert.equal(sum.total, 8000); assert.equal(sum.gap, 3000); assert.equal(sum.affordable, false);
});

test('unknown goods do not acquire seasonal prices', () => {
  assert.equal(marketGoodPrice('not-a-real-good', 30, 'sell', 'muslim'), null);
  assert.equal(seasonalPriceEffectPercent('unknown-group', 30, 'buy', 'muslim'), 0);
});
