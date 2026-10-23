import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIETY_STORAGE_KEY, KANO_MARKETS, STREET_COMMERCE_DENSITY, FAITH_PREFERENCES,
  STYLE_CATALOG, MARKET_GOODS, CIVIC_SCENARIOS, TRADING_BUSINESSES,
  createDefaultSocietyState, normalizeSocietyState, marketPriceIndex, marketGoodPrice,
  buyStyle, equipOwnedStyle, buyMarketStock, sellMarketStock, buyPantryGoods,
  setFaithPreference, currentCommunityCalendar, scenarioForDay, resolveCivicScenario,
  payWeeklyBill, snapshotSociety,
} from '../js/KanoNorthernDriverKanoSocietyMarkets.js';

const S = createDefaultSocietyState;

test('Kano market guide includes grains, produce, textile, thrift and general-merchandise hubs', () => {
  const ids = KANO_MARKETS.map(x => x.id);
  for (const id of ['dawanau','yankaba','yan-lemo','kantin-kwari','kofar-wambai','kurmi','sabon-gari','kwanar-singer','farm-centre']) assert.ok(ids.includes(id));
  assert.ok(KANO_MARKETS.find(x => x.id === 'dawanau').goods.includes('Maize'));
  assert.match(KANO_MARKETS.find(x => x.id === 'dawanau').goods.join(','), /Millet/);
  assert.match(KANO_MARKETS.find(x => x.id === 'kofar-wambai').specialty, /Second-hand/);
});

test('street commerce frontage target is 70 percent and frontage shares sum to 100 percent', () => {
  assert.equal(STREET_COMMERCE_DENSITY.targetCommercialFrontageShare, 0.70);
  const total = STREET_COMMERCE_DENSITY.frontageMix.reduce((sum, item) => sum + item.share, 0);
  assert.equal(Math.round(total * 100), 100);
  assert.ok(STREET_COMMERCE_DENSITY.frontageMix.some(x => x.id === 'kiosk'));
  assert.ok(STREET_COMMERCE_DENSITY.frontageMix.some(x => x.id === 'roadside-table'));
  assert.match(STREET_COMMERCE_DENSITY.note, /additive Renderer3D hook/);
});

test('default state and normalizer keep faith, wardrobe, trust, inventory and logs bounded', () => {
  const state = normalizeSocietyState({ faithPreference: 'made-up', communityTrust: 140, marketTrust: -9, wellbeing: NaN, ledger: [{ day: 3, text: '<danger>' }] });
  assert.equal(state.faithPreference, 'private');
  assert.equal(state.communityTrust, 100); assert.equal(state.marketTrust, 0); assert.equal(state.wellbeing, 65);
  assert.equal(state.ledger[0].text, 'danger');
  assert.equal(normalizeSocietyState({}).version, 1);
  assert.ok(SOCIETY_STORAGE_KEY.includes('society-markets'));
});

test('market price index is repeatable and bounded', () => {
  for (let day = 1; day <= 200; day += 1) {
    const index = marketPriceIndex(day);
    assert.ok(index >= 0.88 && index <= 1.18);
    assert.equal(index, marketPriceIndex(day));
  }
  assert.equal(marketPriceIndex(0), marketPriceIndex(1));
});

test('market prices use known goods and reject unknown goods', () => {
  assert.ok(marketGoodPrice('maize-bag', 1, 'buy') > 0);
  assert.ok(marketGoodPrice('maize-bag', 5, 'sell') > marketGoodPrice('maize-bag', 5, 'buy'));
  assert.equal(marketGoodPrice('unknown', 1), null);
});

test('clothing/style purchase updates appearance and wallet exactly once', () => {
  const out = buyStyle(S(), { styleId: 'kaftan', day: 1, wallet: 6000 });
  assert.equal(out.ok, true); assert.equal(out.wallet, 2500); assert.equal(out.state.equipped.clothing, 'kaftan');
  assert.ok(out.state.ownedStyles.includes('kaftan')); assert.equal(out.cost, 3500);
});

test('already-owned style equips without a duplicate charge', () => {
  const start = S(); start.ownedStyles = ['kaftan']; start.equipped.clothing = 'work-polo';
  const out = buyStyle(start, { styleId: 'kaftan', day: 2, wallet: 500 });
  assert.equal(out.ok, true); assert.equal(out.wallet, 500); assert.equal(out.equippedOnly, true);
  assert.equal(out.state.equipped.clothing, 'kaftan');
});

test('style purchases are blocked during driving and when unaffordable', () => {
  assert.equal(buyStyle(S(), { styleId: 'sneakers', wallet: 10000, activeShift: true }).reason, 'shift_active');
  const out = buyStyle(S(), { styleId: 'babban-riga', wallet: 20 });
  assert.equal(out.reason, 'insufficient_wallet'); assert.equal(out.wallet, 20); assert.equal(out.state.ownedStyles.length, 0);
});

test('owned style can be equipped without new spending', () => {
  const state = S(); state.ownedStyles = ['sneakers'];
  const out = equipOwnedStyle(state, { styleId: 'sneakers' });
  assert.equal(out.ok, true); assert.equal(out.state.equipped.footwear, 'sneakers');
  assert.equal(equipOwnedStyle(S(), { styleId: 'sneakers' }).reason, 'not_owned');
});

test('household pantry purchase charges wallet once and adds stock', () => {
  const out = buyPantryGoods(S(), { goodId: 'maize-bag', qty: 2, day: 1, wallet: 10000, marketId: 'dawanau' });
  assert.equal(out.ok, true); assert.equal(out.state.pantry['maize-bag'], 2); assert.equal(out.wallet, 10000 - out.total);
  assert.equal(out.state.ledger[0].type, 'pantry_purchase');
});

test('pantry purchase rejects wrong market, active shift and insufficient wallet', () => {
  assert.equal(buyPantryGoods(S(), { goodId: 'maize-bag', wallet: 5000, marketId: 'yankaba' }).reason, 'wrong_market');
  assert.equal(buyPantryGoods(S(), { goodId: 'maize-bag', wallet: 5000, activeShift: true, marketId: 'dawanau' }).reason, 'shift_active');
  assert.equal(buyPantryGoods(S(), { goodId: 'maize-bag', wallet: 10, marketId: 'dawanau' }).reason, 'insufficient_wallet');
});

test('business stock is only bought when chosen trade and selected market match', () => {
  const state = S(); state.tradingBusiness = 'grain-roots';
  const good = buyMarketStock(state, { goodId: 'maize-bag', qty: 3, day: 1, wallet: 15000, marketId: 'dawanau' });
  assert.equal(good.ok, true); assert.equal(good.state.stockLots.reduce((n, x) => n + x.qty, 0), 3);
  assert.equal(buyMarketStock(state, { goodId: 'maize-bag', wallet: 9000, marketId: 'yankaba' }).reason, 'wrong_market');
  assert.equal(buyMarketStock(S(), { goodId: 'maize-bag', wallet: 9000, marketId: 'dawanau' }).reason, 'wrong_business');
});

test('stock purchase cannot proceed during a shift or beyond available cash', () => {
  const state = S(); state.tradingBusiness = 'provisions-kiosk';
  assert.equal(buyMarketStock(state, { goodId: 'provisions-carton', wallet: 10000, marketId: 'kwanar-singer', activeShift: true }).reason, 'shift_active');
  assert.equal(buyMarketStock(state, { goodId: 'provisions-carton', wallet: 1, marketId: 'kwanar-singer' }).reason, 'insufficient_wallet');
});

test('selling requires stock and decreases quantity while recording revenue and margin/loss', () => {
  const empty = S(); empty.tradingBusiness = 'grain-roots';
  assert.equal(sellMarketStock(empty, { goodId: 'maize-bag', wallet: 500, marketId: 'dawanau' }).reason, 'insufficient_stock');
  const bought = buyMarketStock(empty, { goodId: 'maize-bag', qty: 2, day: 1, wallet: 10000, marketId: 'dawanau' });
  const sold = sellMarketStock(bought.state, { goodId: 'maize-bag', qty: 1, day: 1, wallet: bought.wallet, marketId: 'dawanau' });
  assert.equal(sold.ok, true); assert.equal(sold.state.stockLots.reduce((n, x) => n + x.qty, 0), 1);
  assert.equal(sold.wallet, bought.wallet + sold.revenue); assert.equal(sold.state.ledger[0].type, 'stock_sale');
});

test('selling stock is blocked during shift, at wrong market or for incompatible trade', () => {
  const state = S(); state.tradingBusiness = 'grain-roots'; state.stockLots = [{ goodId: 'maize-bag', qty: 1, unitCost: 2200 }];
  assert.equal(sellMarketStock(state, { goodId: 'maize-bag', wallet: 0, marketId: 'dawanau', activeShift: true }).reason, 'shift_active');
  assert.equal(sellMarketStock(state, { goodId: 'maize-bag', wallet: 0, marketId: 'yankaba' }).reason, 'wrong_market');
  assert.equal(sellMarketStock(S(), { goodId: 'maize-bag', wallet: 0, marketId: 'dawanau' }).reason, 'wrong_business');
});

test('faith preference is optional and calendar responses match selected preference', () => {
  const muslim = setFaithPreference(S(), { preferenceId: 'muslim', day: 1 });
  const christian = setFaithPreference(S(), { preferenceId: 'christian', day: 1 });
  assert.equal(muslim.ok, true); assert.equal(currentCommunityCalendar(muslim.state, 5).id, 'friday-community');
  assert.equal(currentCommunityCalendar(christian.state, 1).id, 'sunday-community');
  assert.equal(currentCommunityCalendar(S(), 1).id, 'private-community');
  assert.equal(setFaithPreference(S(), { preferenceId: 'random' }).ok, false);
  assert.ok(FAITH_PREFERENCES.some(x => x.id === 'none'));
});

test('festival and family-calendar windows are clearly simulated', () => {
  assert.match(currentCommunityCalendar(S(), 28).note, /not a real religious calendar/);
  const muslim = setFaithPreference(S(), { preferenceId: 'muslim' }).state;
  assert.match(currentCommunityCalendar(muslim, 30).note, /not tied to the real lunar calendar/);
});

test('daily scenarios rotate through costs, civic accountability, tribal fairness, farming and street commerce', () => {
  assert.equal(scenarioForDay(1).id, 'power-bill'); assert.equal(scenarioForDay(4).id, 'election-promises');
  assert.equal(scenarioForDay(5).id, 'tribal-fairness'); assert.equal(scenarioForDay(6).id, 'farmer-supply');
  assert.equal(scenarioForDay(8).id, 'small-shop-restock');
  assert.ok(CIVIC_SCENARIOS.length >= 8);
});

test('respectful cross-tribe service raises trust while discriminatory choice reduces it', () => {
  const base = S();
  const fair = resolveCivicScenario(base, { day: 5, scenarioId: 'tribal-fairness', choiceId: 'serve-fairly', wallet: 500 });
  const discriminatory = resolveCivicScenario(base, { day: 5, scenarioId: 'tribal-fairness', choiceId: 'repeat-stereotype', wallet: 500 });
  assert.equal(fair.ok, true); assert.ok(fair.state.communityTrust > base.communityTrust);
  assert.ok(discriminatory.state.communityTrust < base.communityTrust);
});

test('political scenario is fictional, evidence-seeking choices strengthen civic confidence', () => {
  const scenario = CIVIC_SCENARIOS.find(x => x.id === 'election-promises');
  assert.match(scenario.body, /fictional local representative/); assert.match(scenario.body, /progress is unclear/);
  const outcome = resolveCivicScenario(S(), { day: 4, scenarioId: 'election-promises', choiceId: 'ask-records', wallet: 10 });
  assert.equal(outcome.ok, true); assert.ok(outcome.state.civicConfidence > 50);
  assert.match(outcome.choice.log, /unfulfilled campaign promises and asked for evidence/);
});

test('civic choices resolve once per in-game day and are blocked while driving', () => {
  const args = { day: 2, scenarioId: 'food-price-pressure', choiceId: 'compare-prices', wallet: 5000 };
  const first = resolveCivicScenario(S(), args); assert.equal(first.ok, true);
  assert.equal(resolveCivicScenario(first.state, args).reason, 'already_resolved_today');
  assert.equal(resolveCivicScenario(S(), { ...args, activeShift: true }).reason, 'shift_active');
});

test('unaffordable civic choice does not consume wallet or mark day resolved', () => {
  const out = resolveCivicScenario(S(), { day: 1, scenarioId: 'power-bill', choiceId: 'pay-share', wallet: 20 });
  assert.equal(out.reason, 'insufficient_wallet'); assert.equal(out.wallet, 20); assert.equal(out.state.lastScenarioDay, 0);
});

test('NEPA payment is once weekly and not duplicated by the matching civic scenario', () => {
  const paidByScenario = resolveCivicScenario(S(), { day: 1, scenarioId: 'power-bill', choiceId: 'pay-share', wallet: 5000 });
  assert.equal(paidByScenario.ok, true);
  assert.equal(payWeeklyBill(paidByScenario.state, { billId: 'electricity-share', day: 2, wallet: paidByScenario.wallet }).reason, 'already_paid_this_week');
  assert.equal(payWeeklyBill(paidByScenario.state, { billId: 'electricity-share', day: 8, wallet: paidByScenario.wallet }).ok, true);
});

test('unpaid bills create arrears only once per week, and payment is blocked during shifts', () => {
  const failed = payWeeklyBill(S(), { billId: 'electricity-share', day: 1, wallet: 10 });
  assert.equal(failed.reason, 'insufficient_wallet'); assert.equal(failed.stateWithArrears.arrears, 1300);
  const repeated = payWeeklyBill(failed.stateWithArrears, { billId: 'electricity-share', day: 2, wallet: 10 });
  assert.equal(repeated.stateWithArrears.arrears, 1300);
  assert.equal(payWeeklyBill(S(), { billId: 'electricity-share', day: 1, wallet: 9000, activeShift: true }).reason, 'shift_active');
});

test('market levy bill requires a selected trader side-business', () => {
  assert.equal(payWeeklyBill(S(), { billId: 'shop-levy', day: 1, wallet: 5000 }).reason, 'business_not_selected');
  const state = S(); state.tradingBusiness = 'provisions-kiosk';
  const paid = payWeeklyBill(state, { billId: 'shop-levy', day: 1, wallet: 1000 });
  assert.equal(paid.ok, true); assert.equal(paid.wallet, 600);
});

test('repeat attempts cannot pay the same weekly levy after it was recorded', () => {
  const state = S(); state.tradingBusiness = 'grain-roots';
  const paid = payWeeklyBill(state, { billId: 'shop-levy', day: 2, wallet: 1000 });
  assert.equal(paid.ok, true);
  assert.equal(payWeeklyBill(paid.state, { billId: 'shop-levy', day: 6, wallet: paid.wallet }).reason, 'already_paid_this_week');
});

test('public-levy scenario and weekly trader reserve cannot charge the same week twice', () => {
  const event = resolveCivicScenario(S(), { day: 3, scenarioId: 'public-levy', choiceId: 'pay-without-record', wallet: 1200 });
  assert.equal(event.ok, true); assert.equal(event.wallet, 800); assert.equal(event.state.billsPaid['shop-levy:1'], true);
  const trading = { ...event.state, tradingBusiness: 'provisions-kiosk' };
  assert.equal(payWeeklyBill(trading, { billId: 'shop-levy', day: 5, wallet: event.wallet }).reason, 'already_paid_this_week');
});

test('snapshot includes market index, active day scenario, calendar and frontage target', () => {
  const snap = snapshotSociety(S(), 9);
  assert.equal(snap.day, 9); assert.ok(snap.marketPriceIndex > 0); assert.ok(snap.activeScenario.id);
  assert.ok(snap.communityCalendar.label); assert.equal(snap.frontageDesignTarget, 0.70);
});
