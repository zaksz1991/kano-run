/**
 * Kano Life Step 59: culturally optional festival/seasonal market price rhythm.
 * All dates are a fictional in-game cycle, never real lunar or liturgical dates.
 */
const clampDay = value => Math.max(1, Math.floor(Number(value) || 1));
const validFaith = new Set(['private', 'muslim', 'christian', 'other', 'none']);

const SEASONS = Object.freeze({
  ordinary: Object.freeze({
    id: 'ordinary-market', label: 'Ordinary market rhythm',
    note: 'Usual simulated market demand. No festival observance is assumed.',
    rules: Object.freeze({}),
  }),
  harvest: Object.freeze({
    id: 'harvest-arrivals', label: 'Farm produce arrivals',
    note: 'Simulated arrival of maize, millet, roots and fresh produce can increase supply and soften buying prices.',
    rules: Object.freeze({
      'grains-roots': Object.freeze({ buy: 0.94, sell: 0.97 }),
      'fresh-produce': Object.freeze({ buy: 0.94, sell: 0.97 }),
    }),
  }),
  ceremonyPrep: Object.freeze({
    id: 'family-occasion-preparation', label: 'Family occasion preparation',
    note: 'Some households plan food, transport, fabrics and shoes for a wedding, naming ceremony or reunion.',
    rules: Object.freeze({
      textiles: Object.freeze({ buy: 1.04, sell: 1.09 }),
      thrift: Object.freeze({ buy: 1.04, sell: 1.09 }),
      provisions: Object.freeze({ buy: 1.02, sell: 1.05 }),
      'fresh-produce': Object.freeze({ buy: 1.02, sell: 1.05 }),
    }),
  }),
  familyCeremony: Object.freeze({
    id: 'family-ceremony', label: 'Family ceremony and visitor demand',
    note: 'An illustrative family gathering can raise demand for food and clothing. Participation is optional.',
    rules: Object.freeze({
      textiles: Object.freeze({ buy: 1.09, sell: 1.14 }),
      thrift: Object.freeze({ buy: 1.09, sell: 1.14 }),
      provisions: Object.freeze({ buy: 1.06, sell: 1.11 }),
      'fresh-produce': Object.freeze({ buy: 1.06, sell: 1.11 }),
      'grains-roots': Object.freeze({ buy: 1.03, sell: 1.06 }),
    }),
  }),
  ramadanPrep: Object.freeze({
    id: 'ramadan-preparation', label: 'Ramadan household preparation',
    note: 'Illustrative food planning and evening-market demand for a character who selects the Muslim community calendar.',
    rules: Object.freeze({
      provisions: Object.freeze({ buy: 1.04, sell: 1.09 }),
      'fresh-produce': Object.freeze({ buy: 1.04, sell: 1.09 }),
      'grains-roots': Object.freeze({ buy: 1.03, sell: 1.06 }),
      textiles: Object.freeze({ buy: 1.02, sell: 1.04 }),
      thrift: Object.freeze({ buy: 1.02, sell: 1.04 }),
    }),
  }),
  eidPrep: Object.freeze({
    id: 'eid-preparation', label: 'Eid / Sallah preparation',
    note: 'A fictional preparation window for food, visits, clothing and transport. Dates are not based on the actual lunar calendar.',
    rules: Object.freeze({
      provisions: Object.freeze({ buy: 1.08, sell: 1.12 }),
      'fresh-produce': Object.freeze({ buy: 1.08, sell: 1.12 }),
      'grains-roots': Object.freeze({ buy: 1.06, sell: 1.08 }),
      textiles: Object.freeze({ buy: 1.10, sell: 1.16 }),
      thrift: Object.freeze({ buy: 1.10, sell: 1.16 }),
    }),
  }),
  eidPeriod: Object.freeze({
    id: 'eid-community-period', label: 'Eid / Sallah community period',
    note: 'An illustrative Eid-period market cycle. A character may work, visit, rest or keep observance private.',
    rules: Object.freeze({
      provisions: Object.freeze({ buy: 1.06, sell: 1.11 }),
      'fresh-produce': Object.freeze({ buy: 1.06, sell: 1.11 }),
      'grains-roots': Object.freeze({ buy: 1.04, sell: 1.07 }),
      textiles: Object.freeze({ buy: 1.08, sell: 1.13 }),
      thrift: Object.freeze({ buy: 1.08, sell: 1.13 }),
    }),
  }),
  christianPrep: Object.freeze({
    id: 'christian-community-preparation', label: 'Community celebration preparation',
    note: 'Illustrative household food, clothing and travel preparation for a character who selects the Christian community calendar.',
    rules: Object.freeze({
      provisions: Object.freeze({ buy: 1.05, sell: 1.10 }),
      'fresh-produce': Object.freeze({ buy: 1.05, sell: 1.10 }),
      textiles: Object.freeze({ buy: 1.07, sell: 1.13 }),
      thrift: Object.freeze({ buy: 1.07, sell: 1.13 }),
    }),
  }),
  christianPeriod: Object.freeze({
    id: 'christian-community-period', label: 'Christian/community celebration period',
    note: 'An illustrative community celebration period; there is no forced attendance or religious choice.',
    rules: Object.freeze({
      provisions: Object.freeze({ buy: 1.06, sell: 1.11 }),
      'fresh-produce': Object.freeze({ buy: 1.06, sell: 1.11 }),
      textiles: Object.freeze({ buy: 1.08, sell: 1.13 }),
      thrift: Object.freeze({ buy: 1.08, sell: 1.13 }),
    }),
  }),
});

/** Returns the current deterministic, fictional season matching the Step 58 calendar precedence. */
export function marketSeasonForDay(day = 1, faithPreference = 'private') {
  const d = clampDay(day);
  const faith = validFaith.has(faithPreference) ? faithPreference : 'private';
  const monthDay = d % 30 || 30;
  const cycle28 = ((d - 1) % 28) + 1;
  const cycle84 = ((d - 1) % 84) + 1;

  // Step 58 treats every 28th day as a broad family-ceremony window first.
  if (d % 28 === 0) return { ...SEASONS.familyCeremony, day: d, faithPreference: faith, cycleDay: cycle28 };

  if (faith === 'muslim') {
    if (monthDay >= 27 && monthDay <= 29) return { ...SEASONS.eidPrep, day: d, faithPreference: faith, cycleDay: monthDay };
    if (monthDay === 30) return { ...SEASONS.eidPeriod, day: d, faithPreference: faith, cycleDay: monthDay };
    if (monthDay >= 8 && monthDay <= 10) return { ...SEASONS.ramadanPrep, day: d, faithPreference: faith, cycleDay: monthDay };
  }
  if (faith === 'christian') {
    if (monthDay >= 27 && monthDay <= 29) return { ...SEASONS.christianPrep, day: d, faithPreference: faith, cycleDay: monthDay };
    if (monthDay === 30) return { ...SEASONS.christianPeriod, day: d, faithPreference: faith, cycleDay: monthDay };
  }
  if (cycle84 >= 7 && cycle84 <= 11) return { ...SEASONS.harvest, day: d, faithPreference: faith, cycleDay: cycle84 };
  if (cycle28 >= 23 && cycle28 <= 27) return { ...SEASONS.ceremonyPrep, day: d, faithPreference: faith, cycleDay: cycle28 };
  return { ...SEASONS.ordinary, day: d, faithPreference: faith, cycleDay: cycle84 };
}

/** Seasonal factor for a market category and buy/sell side. Existing base and weekly price logic remains authoritative. */
export function seasonalMarketMultiplier(group, day = 1, type = 'buy', faithPreference = 'private') {
  const season = marketSeasonForDay(day, faithPreference);
  const rule = season.rules?.[String(group || '')];
  if (!rule) return 1;
  return Number(type === 'sell' ? rule.sell : rule.buy) || 1;
}

export function seasonalPriceEffectPercent(group, day = 1, type = 'buy', faithPreference = 'private') {
  return Math.round((seasonalMarketMultiplier(group, day, type, faithPreference) - 1) * 100);
}

export function nextMarketSeason(day = 1, faithPreference = 'private', maxLookahead = 84) {
  const start = clampDay(day);
  const limit = Math.max(1, Math.min(168, Math.floor(Number(maxLookahead) || 84)));
  for (let offset = 1; offset <= limit; offset += 1) {
    const season = marketSeasonForDay(start + offset, faithPreference);
    if (season.id !== 'ordinary-market') return { ...season, daysUntil: offset };
  }
  return null;
}

export function normalizeFestivalBudget(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const amount = value => Math.max(0, Math.min(250000, Math.floor(Number(value) || 0)));
  const occasions = new Set(['family-gathering', 'wedding', 'eid-sallah', 'ramadan', 'christian-celebration', 'harvest-market', 'school-term', 'general']);
  return {
    version: 1,
    occasion: occasions.has(src.occasion) ? src.occasion : 'general',
    food: amount(src.food ?? 3500),
    clothing: amount(src.clothing ?? 2500),
    transport: amount(src.transport ?? 1200),
    gifts: amount(src.gifts ?? 1000),
    household: amount(src.household ?? 1500),
    updatedDay: Math.max(0, Math.floor(Number(src.updatedDay) || 0)),
  };
}

export function festivalBudgetSummary(raw, wallet = 0) {
  const budget = normalizeFestivalBudget(raw);
  const total = budget.food + budget.clothing + budget.transport + budget.gifts + budget.household;
  const cash = Math.max(0, Math.floor(Number(wallet) || 0));
  return { ...budget, total, wallet: cash, gap: Math.max(0, total - cash), remainingIfPaid: cash - total, affordable: total <= cash };
}
