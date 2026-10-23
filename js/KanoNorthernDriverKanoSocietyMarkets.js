/**
 * Kano Life Step 58: civic, markets, street commerce and cost-of-living systems.
 * Prices are fictional balancing values, not current market quotations.
 */
export const SOCIETY_STORAGE_KEY = 'kano-life-society-markets-v1';

export const KANO_MARKETS = Object.freeze([
  { id: 'dawanau', name: 'Dawanau International Grains Market', specialty: 'Grains and farm produce', goods: ['Maize', 'Millet', 'Sorghum', 'Rice', 'Beans', 'Groundnuts', 'Sweet potatoes'], note: 'Farmers, aggregators, loaders and grain traders connect rural supply to wholesale buyers.' },
  { id: 'yankaba', name: 'Yankaba Market', specialty: 'Vegetables, spices and fresh produce', goods: ['Tomatoes', 'Peppers', 'Onions', 'Leafy vegetables', 'Seasonal produce'], note: 'Fresh produce choices can vary with season and supply.' },
  { id: 'yan-lemo', name: "Yan Lemo (Naibawa)", specialty: 'Fruit and seasonal produce', goods: ['Bananas', 'Oranges', 'Mangoes', 'Plantain', 'Seasonal fruit'], note: 'Fruit prices and availability fluctuate in the game with the season.' },
  { id: 'kantin-kwari', name: 'Kantin Kwari Market', specialty: 'Textiles and fabrics', goods: ['Fabrics', 'Atamfa', 'Sewing materials', 'Ready-to-sew clothing'], note: 'A clothing errand can involve bargaining, tailoring deadlines and family celebrations.' },
  { id: 'kofar-wambai', name: 'Kofar Wambai Market', specialty: 'Second-hand clothes, footwear and mixed household goods', goods: ['Thrift clothing', 'Shoes', 'Bags', 'Household items'], note: 'Thrift items vary in condition; a low price is not always the best value.' },
  { id: 'kurmi', name: 'Kurmi Market', specialty: 'Crafts, leather goods and traditional merchandise', goods: ['Leather goods', 'Crafts', 'Household items', 'Souvenirs'], note: 'The market story includes craftspeople and traders with different specialities.' },
  { id: 'sabon-gari', name: 'Sabon Gari / Abubakar Rimi Market', specialty: 'General merchandise and food provisions', goods: ['Packaged food', 'Beverages', 'Tinned food', 'Clothing', 'Household goods'], note: 'A mixed trading area with businesses serving different customers and communities.' },
  { id: 'kwanar-singer', name: 'Kwanar Singer', specialty: 'Groceries and provisions', goods: ['Salt', 'Flour', 'Cooking oil', 'Packaged staples', 'Provisions'], note: 'Small shops and kiosks can restock essential items here.' },
  { id: 'farm-centre', name: 'Farm Centre', specialty: 'Phones, electronics and services', goods: ['Phone accessories', 'Chargers', 'Data accessories', 'Repair services'], note: 'Includes a non-food errand option for repairs and work connectivity.' },
]);

export const STREET_COMMERCE_DENSITY = Object.freeze({
  targetCommercialFrontageShare: 0.70,
  frontageMix: Object.freeze([
    { id: 'permanent-shop', label: 'Permanent shopfront', share: 0.38 },
    { id: 'front-room-shop', label: 'Front-room / provisions shop', share: 0.16 },
    { id: 'kiosk', label: 'Kiosk or small plaza unit', share: 0.10 },
    { id: 'roadside-table', label: 'Roadside table or display', share: 0.06 },
    { id: 'residential-other', label: 'Residential, closed or other frontage', share: 0.30 },
  ]),
  note: 'This target mix is consumed by the additive Renderer3D hook to dress selected building slots without replacing renderer3d.js.',
});

export const FAITH_PREFERENCES = Object.freeze([
  { id: 'private', label: 'Keep faith/private routine private' },
  { id: 'muslim', label: 'Muslim family/community calendar' },
  { id: 'christian', label: 'Christian family/community calendar' },
  { id: 'other', label: 'Other/traditional/personal practice' },
  { id: 'none', label: 'No religious routine selected' },
]);

export const STYLE_CATALOG = Object.freeze([
  { id: 'kaftan', name: 'Simple Hausa kaftan', category: 'clothing', cost: 3500, description: 'Comfortable everyday traditional wear.' },
  { id: 'babban-riga', name: 'Babban riga / formal outfit', category: 'clothing', cost: 9500, description: 'Formal wear for ceremonies and important visits.' },
  { id: 'abaya', name: 'Abaya or modest long outfit', category: 'clothing', cost: 8000, description: 'A modest outfit option.' },
  { id: 'atamfa-set', name: 'Atamfa / Ankara set', category: 'clothing', cost: 7000, description: 'A fabric outfit for visits, work or celebrations.' },
  { id: 'work-polo', name: 'Polo and durable trousers', category: 'clothing', cost: 4500, description: 'Practical everyday clothing.' },
  { id: 'thrift-outfit', name: 'Second-hand outfit', category: 'clothing', cost: 1800, description: 'Lower-cost clothing; condition varies.' },
  { id: 'headscarf', name: 'Headscarf / hijab', category: 'clothing', cost: 1200, description: 'Optional personal style choice.' },
  { id: 'leather-sandals', name: 'Leather sandals', category: 'footwear', cost: 2200, description: 'Everyday footwear.' },
  { id: 'sneakers', name: 'Sneakers', category: 'footwear', cost: 5200, description: 'Casual footwear.' },
  { id: 'dress-shoes', name: 'Formal shoes', category: 'footwear', cost: 5000, description: 'For ceremonies and formal occasions.' },
  { id: 'durable-slippers', name: 'Durable slippers', category: 'footwear', cost: 900, description: 'A lower-cost everyday option.' },
  { id: 'low-cut', name: 'Low-cut haircut', category: 'grooming', cost: 900, description: 'Barber service; appearance preference only in this build.' },
  { id: 'braids', name: 'Braids / protective styling', category: 'grooming', cost: 3800, description: 'Hair styling service; appearance preference only in this build.' },
  { id: 'natural-style', name: 'Natural hair styling', category: 'grooming', cost: 1500, description: 'Hair styling service; appearance preference only in this build.' },
  { id: 'beard-trim', name: 'Beard trim', category: 'grooming', cost: 600, description: 'Optional grooming service.' },
  { id: 'simple-makeup', name: 'Everyday makeup kit', category: 'grooming', cost: 2400, description: 'Optional personal style choice.' },
]);

export const MARKET_GOODS = Object.freeze([
  { id: 'maize-bag', name: 'Maize grain pack', group: 'grains-roots', market: 'dawanau', buy: 2200, sell: 2450, note: 'Simulated trading pack; not a literal standard bag or quoted price.' },
  { id: 'millet-bag', name: 'Millet grain pack', group: 'grains-roots', market: 'dawanau', buy: 2350, sell: 2650, note: 'Simulated trading pack; not a literal standard bag or quoted price.' },
  { id: 'sweet-potato-basket', name: 'Sweet potato basket', group: 'grains-roots', market: 'dawanau', buy: 1700, sell: 1950, note: 'Game unit; weight and price are fictional.' },
  { id: 'rice-wake-pack', name: 'Rice and beans food pack', group: 'provisions', market: 'sabon-gari', buy: 2600, sell: 2950, note: 'Small shop stock unit, not a fixed real-world quantity.' },
  { id: 'provisions-carton', name: 'Mixed provisions stock carton', group: 'provisions', market: 'kwanar-singer', buy: 4200, sell: 4700, note: 'Mixed stock unit used for game economy.' },
  { id: 'vegetable-crate', name: 'Vegetable crate', group: 'fresh-produce', market: 'yankaba', buy: 1850, sell: 2150, note: 'Perishability and demand are abstracted in this build.' },
  { id: 'fruit-basket', name: 'Seasonal fruit basket', group: 'fresh-produce', market: 'yan-lemo', buy: 2000, sell: 2350, note: 'Seasonal availability is simulated.' },
  { id: 'thrift-bundle', name: 'Second-hand clothes bundle', group: 'thrift', market: 'kofar-wambai', buy: 2500, sell: 2950, note: 'Condition varies; resale price is not guaranteed.' },
  { id: 'footwear-bundle', name: 'Mixed footwear bundle', group: 'thrift', market: 'kofar-wambai', buy: 3200, sell: 3650, note: 'Mixed stock unit; quality can affect story outcomes.' },
  { id: 'fabric-pack', name: 'Fabric pieces pack', group: 'textiles', market: 'kantin-kwari', buy: 3600, sell: 4050, note: 'Simulated fabric stock unit.' },
]);

export const CIVIC_SCENARIOS = Object.freeze([
  {
    id: 'power-bill', title: 'The NEPA bill arrives', category: 'Cost of living',
    body: 'A household electricity bill arrives just as food and fuel cost more. Relatives disagree over how to share the bill. The amount and tariff are fictional game values.',
    choices: [
      { id: 'pay-share', label: 'Pay a share now', walletDelta: -1300, communityTrust: 2, wellbeing: 1, log: 'Contributed to the household electricity bill.' },
      { id: 'agree-split', label: 'Agree a fair split and set a date', communityTrust: 3, civicConfidence: 1, log: 'Agreed a clear household bill-sharing plan.' },
      { id: 'delay', label: 'Ask for a short extension', communityTrust: -1, wellbeing: -1, arrearsDelta: 1300, log: 'Asked to delay an electricity contribution; a simulated arrear was recorded.' },
    ],
  },
  {
    id: 'food-price-pressure', title: 'Market prices have jumped', category: 'Cost of living',
    body: 'A family member says the weekly basket costs more than last time. Sellers cite supply and transport costs; customers are under pressure too.',
    choices: [
      { id: 'compare-prices', label: 'Compare two stalls and buy essentials only', marketTrust: 2, wellbeing: 1, log: 'Compared prices before buying essentials.' },
      { id: 'bulk-buy', label: 'Coordinate a bulk purchase with neighbours', walletDelta: -900, communityTrust: 3, marketTrust: 1, log: 'Joined a shared staple-food purchase.' },
      { id: 'blame-seller', label: 'Accuse a seller without checking', marketTrust: -3, communityTrust: -2, log: 'A confrontation with a seller weakened trust.' },
    ],
  },
  {
    id: 'public-levy', title: 'A levy is requested from traders', category: 'Civic life',
    body: 'A roadside seller says a collection agent requested a fee. Nobody is sure whether the request is official or what receipt should be issued.',
    choices: [
      { id: 'ask-receipt', label: 'Ask politely for the official rate and receipt', civicConfidence: 3, marketTrust: 1, log: 'Asked for a clear rate and a receipt before paying a trading levy.' },
      { id: 'verify-quietly', label: 'Check with the market association first', civicConfidence: 2, communityTrust: 2, log: 'Verified the levy with the market association.' },
      { id: 'pay-without-record', label: 'Pay to avoid a dispute, without a receipt', walletDelta: -400, civicConfidence: -1, log: 'Paid a simulated levy without obtaining a receipt.' },
    ],
  },
  {
    id: 'election-promises', title: 'Promises and public accountability', category: 'Civic discussion',
    body: 'Residents say a fictional local representative promised better street lighting, drainage and roads, but progress is unclear. People disagree on what has been delivered.',
    choices: [
      { id: 'ask-records', label: 'Ask for a public progress report and evidence', civicConfidence: 4, communityTrust: 1, log: 'Raised questions about unfulfilled campaign promises and asked for evidence.' },
      { id: 'community-forum', label: 'Join a peaceful, issue-based residents meeting', civicConfidence: 3, communityTrust: 3, log: 'Joined a peaceful community discussion about public services.' },
      { id: 'unverified-rumour', label: 'Repeat an unverified claim of election rigging', civicConfidence: -3, communityTrust: -2, log: 'Repeated an unverified electoral allegation; other residents questioned the claim.' },
      { id: 'avoid-politics', label: 'Avoid the argument and return to work', wellbeing: 1, log: 'Chose not to join a heated political conversation.' },
    ],
  },
  {
    id: 'tribal-fairness', title: 'A customer from another state', category: 'Community relationships',
    body: 'A customer whose language or state of origin differs from yours asks for a ride. Another person makes a tribal stereotype and pressures you to agree.',
    choices: [
      { id: 'serve-fairly', label: 'Offer the same fair service and fare rules', communityTrust: 4, marketTrust: 1, wellbeing: 1, log: 'Treated a customer fairly regardless of tribe or state of origin.' },
      { id: 'de-escalate', label: 'Reject the stereotype and calm the conversation', communityTrust: 3, civicConfidence: 1, log: 'De-escalated a tribal stereotype without escalating the dispute.' },
      { id: 'repeat-stereotype', label: 'Join the stereotype', communityTrust: -5, marketTrust: -2, wellbeing: -1, log: 'A discriminatory remark harmed community trust.' },
    ],
  },
  {
    id: 'farmer-supply', title: 'A farmer brings produce to town', category: 'Markets and farming',
    body: 'A farmer has brought maize, millet and sweet potatoes to sell. The offer is attractive, but you still need to compare quality, transport and how much stock you can afford.',
    choices: [
      { id: 'buy-staples', label: 'Buy a small staple pack for home', walletDelta: -1700, communityTrust: 2, marketTrust: 2, log: 'Bought a small produce pack directly from a farmer.' },
      { id: 'introduce-trader', label: 'Connect the farmer with a market trader', communityTrust: 3, marketTrust: 2, log: 'Connected a farmer with a local trader.' },
      { id: 'decline', label: 'Decline because the budget is tight', wellbeing: 1, log: 'Kept to the budget and declined the produce offer.' },
    ],
  },
  {
    id: 'festival-invitation', title: 'A festival or family invitation', category: 'Faith and community',
    body: 'A family, neighbour or friend invites you to a celebration. You can join, contribute modestly, arrange a visit later or keep the occasion private. No belief or attendance is compulsory.',
    choices: [
      { id: 'attend-simple', label: 'Attend simply and help with a small task', walletDelta: -800, communityTrust: 3, wellbeing: 2, log: 'Joined a family or community celebration modestly.' },
      { id: 'send-greeting', label: 'Send greetings and visit another day', communityTrust: 2, wellbeing: 1, log: 'Sent respectful greetings and arranged a later visit.' },
      { id: 'work-first', label: 'Work today and save for the household', wellbeing: -1, civicConfidence: 1, log: 'Worked instead of attending the celebration.' },
    ],
  },
  {
    id: 'small-shop-restock', title: 'A roadside shop needs restocking', category: 'Street commerce',
    body: 'A small provision shop at the front of a building is running low on salt, flour and packaged food. The owner asks if you can help organise a restock errand after your shift.',
    choices: [
      { id: 'help-stock', label: 'Help plan a stock list and compare suppliers', communityTrust: 3, marketTrust: 3, log: 'Helped a neighbourhood provision shop compare wholesale suppliers.' },
      { id: 'help-farmer', label: 'Offer to connect the shop with a local farmer', communityTrust: 3, marketTrust: 2, log: 'Helped a shop consider locally supplied grains and roots.' },
      { id: 'decline-restock', label: 'Decline; protect time for home responsibilities', wellbeing: 2, log: 'Protected time for home responsibilities.' },
    ],
  },
]);

export const TRADING_BUSINESSES = Object.freeze([
  { id: 'none', label: 'No side trade right now', eligibleGroups: [] },
  { id: 'provisions-kiosk', label: 'Family provisions shop / kiosk', eligibleGroups: ['provisions'] },
  { id: 'grain-roots', label: 'Grains, maize, millet and roots', eligibleGroups: ['grains-roots'] },
  { id: 'fresh-produce', label: 'Vegetables and fruit table', eligibleGroups: ['fresh-produce'] },
  { id: 'thrift-table', label: 'Second-hand clothes and footwear table', eligibleGroups: ['thrift'] },
  { id: 'textile-table', label: 'Fabrics / clothing pieces', eligibleGroups: ['textiles'] },
]);

export function marketPriceIndex(day = 1) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  // A repeatable weekly swing avoids random test results or prices changing within one day.
  const wave = [0.98, 1.00, 1.03, 1.07, 1.12, 1.09, 1.02][(d - 1) % 7];
  const seasonal = 1 + ((Math.floor((d - 1) / 7) % 5) - 2) * 0.018;
  return Math.max(0.88, Math.min(1.18, Math.round(wave * seasonal * 1000) / 1000));
}

export function marketGoodPrice(goodId, day = 1, type = 'buy') {
  const good = MARKET_GOODS.find(item => item.id === goodId);
  if (!good) return null;
  const base = type === 'sell' ? good.sell : good.buy;
  const demandWave = type === 'sell' ? [0.96, 1.00, 1.06, 1.02, 1.10, 0.94, 1.00][(Math.max(1, Math.floor(Number(day) || 1)) - 1) % 7] : 1;
  return Math.max(1, Math.round(base * marketPriceIndex(day) * demandWave));
}

export function createDefaultSocietyState() {
  return {
    version: 1,
    faithPreference: 'private',
    equipped: { clothing: 'work-polo', footwear: 'durable-slippers', grooming: 'low-cut' },
    ownedStyles: [],
    selectedMarket: 'dawanau',
    tradingBusiness: 'none',
    stockLots: [],
    pantry: {},
    civicConfidence: 50,
    communityTrust: 50,
    marketTrust: 50,
    wellbeing: 65,
    arrears: 0,
    billsPaid: {},
    billsMissed: {},
    lastScenarioDay: 0,
    lastScenarioId: '',
    visitCounts: {},
    ledger: [],
  };
}

export function normalizeSocietyState(raw) {
  const base = createDefaultSocietyState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const result = {
    ...base,
    ...src,
    version: 1,
    faithPreference: FAITH_PREFERENCES.some(x => x.id === src.faithPreference) ? src.faithPreference : 'private',
    equipped: { ...base.equipped, ...(src.equipped && typeof src.equipped === 'object' ? src.equipped : {}) },
    ownedStyles: Array.isArray(src.ownedStyles) ? [...new Set(src.ownedStyles.filter(id => STYLE_CATALOG.some(x => x.id === id)))] .slice(0, 80) : [],
    selectedMarket: KANO_MARKETS.some(x => x.id === src.selectedMarket) ? src.selectedMarket : 'dawanau',
    tradingBusiness: TRADING_BUSINESSES.some(x => x.id === src.tradingBusiness) ? src.tradingBusiness : 'none',
    stockLots: Array.isArray(src.stockLots) ? src.stockLots.filter(lot => lot && MARKET_GOODS.some(x => x.id === lot.goodId) && Number(lot.qty) > 0).slice(-200).map(lot => ({ goodId: lot.goodId, qty: Math.min(500, Math.floor(Number(lot.qty))), unitCost: Math.max(1, Math.floor(Number(lot.unitCost) || 1)) })) : [],
    pantry: src.pantry && typeof src.pantry === 'object' ? Object.fromEntries(Object.entries(src.pantry).filter(([k,v]) => MARKET_GOODS.some(x => x.id === k) && Number(v) > 0).map(([k,v]) => [k, Math.min(999, Math.floor(Number(v)))])) : {},
    civicConfidence: bounded(src.civicConfidence, 0, 100, 50),
    communityTrust: bounded(src.communityTrust, 0, 100, 50),
    marketTrust: bounded(src.marketTrust, 0, 100, 50),
    wellbeing: bounded(src.wellbeing, 0, 100, 65),
    arrears: Math.max(0, Math.floor(Number(src.arrears) || 0)),
    billsPaid: src.billsPaid && typeof src.billsPaid === 'object' ? src.billsPaid : {},
    billsMissed: src.billsMissed && typeof src.billsMissed === 'object' ? src.billsMissed : {},
    lastScenarioDay: Math.max(0, Math.floor(Number(src.lastScenarioDay) || 0)),
    lastScenarioId: typeof src.lastScenarioId === 'string' ? src.lastScenarioId.slice(0, 80) : '',
    visitCounts: src.visitCounts && typeof src.visitCounts === 'object' ? src.visitCounts : {},
    ledger: Array.isArray(src.ledger) ? src.ledger.slice(0, 100).map(x => ({ day: Math.max(1, Math.floor(Number(x.day) || 1)), type: String(x.type || 'note').slice(0, 60), text: String(x.text || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220), amount: Math.floor(Number(x.amount) || 0) })) : [],
  };
  for (const [category, styleId] of Object.entries(result.equipped)) {
    if (!STYLE_CATALOG.some(item => item.id === styleId && item.category === category)) result.equipped[category] = base.equipped[category];
  }
  return result;
}
function bounded(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function log(state, day, type, text, amount = 0) {
  state.ledger.unshift({ day: Math.max(1, Math.floor(Number(day) || 1)), type, text: String(text).slice(0, 220), amount: Math.floor(Number(amount) || 0) });
  state.ledger = state.ledger.slice(0, 100);
}
function result(ok, reason, state, wallet, extra = {}) { return { ok, reason, state: normalizeSocietyState(state), wallet: Math.max(0, Math.floor(Number(wallet) || 0)), ...extra }; }

export function buyStyle(rawState, { styleId, day = 1, wallet = 0, activeShift = false } = {}) {
  const state = normalizeSocietyState(rawState); const style = STYLE_CATALOG.find(item => item.id === styleId); const cash = Math.max(0, Math.floor(Number(wallet) || 0));
  if (!style) return result(false, 'unknown_style', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  const current = state.equipped[style.category];
  if (state.ownedStyles.includes(style.id)) {
    state.equipped[style.category] = style.id;
    log(state, day, 'style_equipped', `Equipped previously purchased ${style.name}.`);
    return result(true, null, state, cash, { item: style, cost: 0, previousStyle: current, equippedOnly: true });
  }
  if (cash < style.cost) return result(false, 'insufficient_wallet', state, cash, { required: style.cost });
  state.ownedStyles.push(style.id);
  state.equipped[style.category] = style.id;
  log(state, day, 'style_purchase', `Bought ${style.name}.`, -style.cost);
  return result(true, null, state, cash - style.cost, { item: style, cost: style.cost, previousStyle: current });
}

export function equipOwnedStyle(rawState, { styleId } = {}) {
  const state = normalizeSocietyState(rawState); const style = STYLE_CATALOG.find(item => item.id === styleId);
  if (!style) return { ok: false, reason: 'unknown_style', state };
  if (style.id !== state.equipped[style.category] && !state.ownedStyles.includes(style.id)) return { ok: false, reason: 'not_owned', state };
  state.equipped[style.category] = style.id;
  return { ok: true, state, item: style };
}

export function buyMarketStock(rawState, { goodId, qty = 1, day = 1, wallet = 0, activeShift = false, marketId = null } = {}) {
  const state = normalizeSocietyState(rawState); const good = MARKET_GOODS.find(item => item.id === goodId); const cash = Math.max(0, Math.floor(Number(wallet) || 0)); const quantity = bounded(Math.floor(Number(qty) || 1), 1, 10, 1);
  if (!good) return result(false, 'unknown_good', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  if (marketId && marketId !== good.market) return result(false, 'wrong_market', state, cash, { good });
  const business = TRADING_BUSINESSES.find(x => x.id === state.tradingBusiness) || TRADING_BUSINESSES[0];
  if (!business.eligibleGroups.includes(good.group)) return result(false, 'wrong_business', state, cash, { good, business });
  const unitCost = marketGoodPrice(good.id, day, 'buy'); const total = unitCost * quantity;
  if (cash < total) return result(false, 'insufficient_wallet', state, cash, { required: total, unitCost });
  const existing = state.stockLots.find(lot => lot.goodId === good.id && lot.unitCost === unitCost);
  if (existing) existing.qty = Math.min(500, existing.qty + quantity);
  else state.stockLots.push({ goodId: good.id, qty: quantity, unitCost });
  log(state, day, 'stock_purchase', `Bought ${quantity} unit(s) of ${good.name} for trading.`, -total);
  return result(true, null, state, cash - total, { good, qty: quantity, unitCost, total });
}

export function sellMarketStock(rawState, { goodId, qty = 1, day = 1, wallet = 0, activeShift = false, marketId = null } = {}) {
  const state = normalizeSocietyState(rawState); const good = MARKET_GOODS.find(item => item.id === goodId); const cash = Math.max(0, Math.floor(Number(wallet) || 0)); const quantity = bounded(Math.floor(Number(qty) || 1), 1, 10, 1);
  if (!good) return result(false, 'unknown_good', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  if (marketId && marketId !== good.market) return result(false, 'wrong_market', state, cash, { good });
  const business = TRADING_BUSINESSES.find(x => x.id === state.tradingBusiness) || TRADING_BUSINESSES[0];
  if (!business.eligibleGroups.includes(good.group)) return result(false, 'wrong_business', state, cash);
  const available = state.stockLots.filter(lot => lot.goodId === good.id).reduce((sum, lot) => sum + lot.qty, 0);
  if (available < quantity) return result(false, 'insufficient_stock', state, cash, { available });
  let remain = quantity; let costBasis = 0;
  for (const lot of state.stockLots.filter(lot => lot.goodId === good.id)) {
    if (remain <= 0) break;
    const take = Math.min(remain, lot.qty); costBasis += take * lot.unitCost; lot.qty -= take; remain -= take;
  }
  state.stockLots = state.stockLots.filter(lot => lot.qty > 0);
  const unitSale = marketGoodPrice(good.id, day, 'sell'); const revenue = unitSale * quantity;
  const profit = revenue - costBasis;
  log(state, day, 'stock_sale', `Sold ${quantity} unit(s) of ${good.name}; ${profit >= 0 ? 'simulated margin' : 'simulated loss'} ${Math.abs(profit)}.`, revenue);
  state.marketTrust = bounded(state.marketTrust + 1, 0, 100, 50);
  return result(true, null, state, cash + revenue, { good, qty: quantity, unitSale, revenue, costBasis, profit });
}

export function buyPantryGoods(rawState, { goodId, qty = 1, day = 1, wallet = 0, activeShift = false, marketId = null } = {}) {
  const state = normalizeSocietyState(rawState); const good = MARKET_GOODS.find(item => item.id === goodId); const cash = Math.max(0, Math.floor(Number(wallet) || 0)); const quantity = bounded(Math.floor(Number(qty) || 1), 1, 10, 1);
  if (!good) return result(false, 'unknown_good', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  if (marketId && marketId !== good.market) return result(false, 'wrong_market', state, cash, { good });
  const unitCost = marketGoodPrice(good.id, day, 'buy'); const total = unitCost * quantity;
  if (cash < total) return result(false, 'insufficient_wallet', state, cash, { required: total, unitCost });
  state.pantry[good.id] = Math.min(999, (Number(state.pantry[good.id]) || 0) + quantity);
  log(state, day, 'pantry_purchase', `Bought ${quantity} household unit(s) of ${good.name}.`, -total);
  return result(true, null, state, cash - total, { good, qty: quantity, unitCost, total });
}

export function setFaithPreference(rawState, { preferenceId, day = 1 } = {}) {
  const state = normalizeSocietyState(rawState);
  if (!FAITH_PREFERENCES.some(item => item.id === preferenceId)) return { ok: false, reason: 'unknown_preference', state };
  state.faithPreference = preferenceId;
  log(state, day, 'faith_preference', `Set preferred community calendar to ${FAITH_PREFERENCES.find(item => item.id === preferenceId).label}.`);
  return { ok: true, state };
}

export function currentCommunityCalendar(rawState, day = 1) {
  const state = normalizeSocietyState(rawState); const d = Math.max(1, Math.floor(Number(day) || 1)); const weekDay = (d - 1) % 7;
  if (d % 28 === 0) return { id: 'family-ceremony', label: 'Family naming, wedding or reunion season', note: 'An optional family or community gathering may appear. The schedule is fictional and not a real religious calendar.' };
  if (state.faithPreference === 'muslim') {
    if (d % 30 === 10) return { id: 'ramadan-preparation', label: 'Ramadan preparation', note: 'Plan household food and time; fasting or participation is a player choice in this roleplay.' };
    if (d % 30 === 0) return { id: 'eid-period', label: 'Eid family and community period', note: 'An illustrative Eid gathering; dates are not tied to the real lunar calendar.' };
    if (weekDay === 4) return { id: 'friday-community', label: 'Friday community routine', note: 'Choose prayer, visiting, rest or work according to your character’s preference.' };
  }
  if (state.faithPreference === 'christian') {
    if (d % 30 === 0) return { id: 'christian-community', label: 'Community or church celebration period', note: 'An illustrative gathering, not a real liturgical calendar.' };
    if (weekDay === 0) return { id: 'sunday-community', label: 'Sunday community routine', note: 'Choose worship, visiting, rest or work according to your character’s preference.' };
  }
  if (state.faithPreference === 'other') return { id: 'personal-community', label: 'Personal or traditional community day', note: 'Choose the practices meaningful to your character; no specific belief is assumed.' };
  if (state.faithPreference === 'none') return { id: 'open-community', label: 'Neighbourhood and family calendar', note: 'Community events are available without selecting a religious routine.' };
  return { id: 'private-community', label: 'Private or shared community occasion', note: 'Keep belief private or choose a family/community event when it suits your character.' };
}

export function scenarioForDay(day = 1) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  return CIVIC_SCENARIOS[(d - 1) % CIVIC_SCENARIOS.length];
}

export function resolveCivicScenario(rawState, { day = 1, scenarioId, choiceId, wallet = 0, activeShift = false } = {}) {
  const state = normalizeSocietyState(rawState); const d = Math.max(1, Math.floor(Number(day) || 1)); const cash = Math.max(0, Math.floor(Number(wallet) || 0));
  const scenario = CIVIC_SCENARIOS.find(x => x.id === scenarioId); const choice = scenario?.choices.find(x => x.id === choiceId);
  if (!scenario || !choice) return result(false, 'unknown_choice', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  if (state.lastScenarioDay === d) return result(false, 'already_resolved_today', state, cash);
  const week = Math.floor((d - 1) / 7) + 1;
  const electricityKey = `electricity-share:${week}`;
  const levyKey = `shop-levy:${week}`;
  if (scenarioId === 'power-bill' && choiceId === 'pay-share' && state.billsPaid[electricityKey]) return result(false, 'already_paid_this_week', state, cash);
  if (scenarioId === 'public-levy' && choiceId === 'pay-without-record' && state.billsPaid[levyKey]) return result(false, 'already_paid_this_week', state, cash);
  const delta = Math.floor(Number(choice.walletDelta) || 0);
  if (delta < 0 && cash < -delta) return result(false, 'insufficient_wallet', state, cash, { required: -delta });
  state.civicConfidence = bounded(state.civicConfidence + (Number(choice.civicConfidence) || 0), 0, 100, 50);
  state.communityTrust = bounded(state.communityTrust + (Number(choice.communityTrust) || 0), 0, 100, 50);
  state.marketTrust = bounded(state.marketTrust + (Number(choice.marketTrust) || 0), 0, 100, 50);
  state.wellbeing = bounded(state.wellbeing + (Number(choice.wellbeing) || 0), 0, 100, 65);
  state.arrears = Math.max(0, state.arrears + (Number(choice.arrearsDelta) || 0));
  if (scenarioId === 'power-bill' && choiceId === 'pay-share') state.billsPaid[electricityKey] = true;
  if (scenarioId === 'power-bill' && choiceId === 'delay') state.billsMissed[electricityKey] = true;
  if (scenarioId === 'public-levy' && choiceId === 'pay-without-record') state.billsPaid[levyKey] = true;
  state.lastScenarioDay = d; state.lastScenarioId = scenario.id;
  log(state, d, scenario.category, choice.log, delta);
  return result(true, null, state, cash + delta, { scenario, choice, walletDelta: delta });
}

export const WEEKLY_BILLS = Object.freeze([
  { id: 'electricity-share', label: 'NEPA / household electricity contribution', amount: 1300, description: 'A fictional share of household power cost; actual billing arrangements vary.' },
  { id: 'shop-levy', label: 'Small-trader fee/levy reserve', amount: 400, description: 'A fictional reserve for an optional kiosk/table business; verify real fees and receipts in real life.' },
]);
export function payWeeklyBill(rawState, { billId, day = 1, wallet = 0, activeShift = false } = {}) {
  const state = normalizeSocietyState(rawState); const bill = WEEKLY_BILLS.find(x => x.id === billId); const d = Math.max(1, Math.floor(Number(day) || 1)); const cash = Math.max(0, Math.floor(Number(wallet) || 0));
  if (!bill) return result(false, 'unknown_bill', state, cash);
  if (activeShift) return result(false, 'shift_active', state, cash);
  if (billId === 'shop-levy' && state.tradingBusiness === 'none') return result(false, 'business_not_selected', state, cash);
  const week = Math.floor((d - 1) / 7) + 1; const key = `${billId}:${week}`;
  if (state.billsPaid[key]) return result(false, 'already_paid_this_week', state, cash);
  if (cash < bill.amount) {
    if (!state.billsMissed[key]) { state.arrears += bill.amount; state.billsMissed[key] = true; log(state, d, 'bill_unpaid', `Could not pay ${bill.label}; simulated arrears recorded.`, 0); }
    return result(false, 'insufficient_wallet', state, cash, { required: bill.amount, stateWithArrears: normalizeSocietyState(state) });
  }
  state.billsPaid[key] = true; state.arrears = Math.max(0, state.arrears - bill.amount);
  log(state, d, 'bill_payment', `Paid ${bill.label}.`, -bill.amount);
  return result(true, null, state, cash - bill.amount, { bill, cost: bill.amount, week });
}

export function snapshotSociety(rawState, day = 1) {
  const state = normalizeSocietyState(rawState); const d = Math.max(1, Math.floor(Number(day) || 1));
  return {
    ...state,
    day: d,
    marketPriceIndex: marketPriceIndex(d),
    activeScenario: scenarioForDay(d),
    communityCalendar: currentCommunityCalendar(state, d),
    inventorySummary: state.stockLots.reduce((acc, lot) => { acc[lot.goodId] = (acc[lot.goodId] || 0) + lot.qty; return acc; }, {}),
    frontageDesignTarget: STREET_COMMERCE_DENSITY.targetCommercialFrontageShare,
  };
}
