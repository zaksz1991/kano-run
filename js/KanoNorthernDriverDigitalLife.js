/**
 * Kano Life Step 64 — Mobile data, online opportunity and digital reputation.
 * Pure state helpers. No network requests, device contacts, real messages, or
 * automatic wallet deductions. Values are fictional gameplay balancing.
 */
export const DIGITAL_LIFE_STORAGE_KEY = 'kano-life-digital-life-v1';
export const DIGITAL_DATA_CAP_MB = 5000;
export const DIGITAL_DATA_BUNDLES = Object.freeze([
  Object.freeze({ id: 'small', label: 'Everyday data', mb: 250, price: 120 }),
  Object.freeze({ id: 'weekly', label: 'Weekly data', mb: 750, price: 300 }),
  Object.freeze({ id: 'work', label: 'Work and market data', mb: 1500, price: 550 }),
]);
export const DIGITAL_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'market-listing', title: 'A market trader asks for an online listing',
    body: 'A contact selling grains, provisions or second-hand clothes asks you to help them reach more customers. A clear listing can attract enquiries, but it does not guarantee a sale.',
    choices: Object.freeze([
      Object.freeze({ id: 'publish-listing', label: 'Post a clear listing with price and pickup point', dataMb: 80, effects: { digitalReputation: 3, communityTrust: 2, listingsPosted: 1 }, outcome: 'listing' }),
      Object.freeze({ id: 'check-details', label: 'Confirm stock, price and seller first', dataMb: 35, effects: { digitalReputation: 4, scamAwareness: 2 }, outcome: 'verified-listing' }),
      Object.freeze({ id: 'skip-listing', label: 'Leave it for another day', dataMb: 0, effects: {}, outcome: 'skip' }),
    ]),
  }),
  Object.freeze({
    id: 'company-offer', title: 'A company job message arrives',
    body: 'A new contact says a company in Kano is hiring people who recently moved from another state. The message promises quick employment but asks applicants to act fast.',
    choices: Object.freeze([
      Object.freeze({ id: 'verify-and-apply', label: 'Verify the employer, then submit an application', dataMb: 120, effects: { digitalReputation: 3, scamAwareness: 3, applicationsSubmitted: 1 }, outcome: 'application' }),
      Object.freeze({ id: 'ask-work-contact', label: 'Ask a known work contact for a reference', dataMb: 55, effects: { workConnections: 3, scamAwareness: 2 }, outcome: 'reference' }),
      Object.freeze({ id: 'pay-registration', label: 'Pay the fictional ₦250 registration fee without checking', dataMb: 10, walletCost: 250, effects: { digitalReputation: -4, scamAwareness: -5, scamLosses: 1 }, outcome: 'scam-payment' }),
      Object.freeze({ id: 'ignore-offer', label: 'Ignore the offer until it can be checked', dataMb: 0, effects: { scamAwareness: 1 }, outcome: 'skip' }),
    ]),
  }),
  Object.freeze({
    id: 'viral-claim', title: 'A dramatic claim spreads in a group chat',
    body: 'A forwarded post makes a strong claim about a public service and says everyone should share it. It provides no original notice or reliable source.',
    choices: Object.freeze([
      Object.freeze({ id: 'check-original-source', label: 'Look for the original notice or reliable reporting', dataMb: 35, effects: { digitalReputation: 5, civicLiteracy: 5, misinformationShared: 0 }, outcome: 'verified' }),
      Object.freeze({ id: 'ask-for-source', label: 'Ask politely for a source before sharing', dataMb: 15, effects: { digitalReputation: 3, civicLiteracy: 2 }, outcome: 'asked' }),
      Object.freeze({ id: 'forward-unchecked', label: 'Forward it as fact without checking', dataMb: 5, effects: { digitalReputation: -7, civicLiteracy: -5, misinformationShared: 1 }, outcome: 'unchecked' }),
    ]),
  }),
  Object.freeze({
    id: 'group-chat-bias', title: 'An insulting tribal post enters a group chat',
    body: 'Someone posts an insult about Hausa people or another Nigerian ethnic community. Friends are watching how you respond.',
    choices: Object.freeze([
      Object.freeze({ id: 'challenge-respectfully', label: 'Challenge the insult without attacking a group', dataMb: 20, effects: { digitalReputation: 4, communityTrust: 5, harmfulForwards: 0 }, outcome: 'respectful' }),
      Object.freeze({ id: 'report-abuse', label: 'Report the abusive post to the group moderator', dataMb: 15, effects: { communityTrust: 3 }, outcome: 'reported' }),
      Object.freeze({ id: 'forward-insult', label: 'Forward the insult to entertain friends', dataMb: 5, effects: { digitalReputation: -6, communityTrust: -8, harmfulForwards: 1 }, outcome: 'harmful' }),
    ]),
  }),
  Object.freeze({
    id: 'online-scam', title: 'A suspicious beauty or business advert appears',
    body: 'An advert promises guaranteed results or unusually high profit and pressures you to pay immediately. The advert gives no verifiable business details.',
    choices: Object.freeze([
      Object.freeze({ id: 'verify-advert', label: 'Check ingredients, seller identity or independent evidence', dataMb: 40, effects: { digitalReputation: 3, scamAwareness: 5 }, outcome: 'verified' }),
      Object.freeze({ id: 'warn-contacts', label: 'Warn contacts calmly and avoid forwarding the advert', dataMb: 20, effects: { digitalReputation: 4, scamAwareness: 4, communityTrust: 2 }, outcome: 'warned' }),
      Object.freeze({ id: 'buy-unverified', label: 'Pay the fictional ₦250 offer without checking', dataMb: 5, walletCost: 250, effects: { digitalReputation: -3, scamAwareness: -5, scamLosses: 1 }, outcome: 'scam-payment' }),
    ]),
  }),
  Object.freeze({
    id: 'online-business', title: 'A home business wants help reaching customers',
    body: 'A family member or neighbour sells gurasa, food provisions, fabrics or used shoes. They ask you to share a simple online advert with accurate prices and opening hours.',
    choices: Object.freeze([
      Object.freeze({ id: 'help-business', label: 'Create a truthful advert and list the contact hours', dataMb: 70, effects: { digitalReputation: 3, communityTrust: 3, listingsPosted: 1 }, outcome: 'listing' }),
      Object.freeze({ id: 'teach-safe-posting', label: 'Show the seller how to avoid fake payment screenshots', dataMb: 35, effects: { scamAwareness: 4, workConnections: 2 }, outcome: 'digital-help' }),
      Object.freeze({ id: 'decline-business', label: 'Decline politely because you are busy', dataMb: 0, effects: {}, outcome: 'skip' }),
    ]),
  }),
  Object.freeze({
    id: 'privacy-message', title: 'A private message is being pressured into public view',
    body: "Someone urges you to post another person's private relationship or family message into a public group to create drama.",
    choices: Object.freeze([
      Object.freeze({ id: 'protect-privacy', label: 'Keep the message private and talk directly if appropriate', dataMb: 10, effects: { digitalReputation: 4, relationshipBoundaries: 3, communityTrust: 2 }, outcome: 'private' }),
      Object.freeze({ id: 'ask-consent', label: 'Ask permission before sharing any private details', dataMb: 10, effects: { digitalReputation: 3, relationshipBoundaries: 4 }, outcome: 'consent' }),
      Object.freeze({ id: 'expose-message', label: 'Post the private message for entertainment', dataMb: 5, effects: { digitalReputation: -8, relationshipBoundaries: -6, communityTrust: -4 }, outcome: 'privacy-breach' }),
    ]),
  }),
]);

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
const finiteInt = (value, fallback = 0, min = 0, max = 1_000_000) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const safeId = value => String(value ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 60);
const boundedText = (value, max = 160) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);

export function createDefaultDigitalLifeState() {
  return {
    version: 1,
    dataMb: 0,
    digitalReputation: 50,
    communityTrust: 50,
    civicLiteracy: 50,
    scamAwareness: 35,
    workConnections: 20,
    relationshipBoundaries: 50,
    listingsPosted: 0,
    applicationsSubmitted: 0,
    scamLosses: 0,
    harmfulForwards: 0,
    misinformationShared: 0,
    currentScenarioId: '',
    currentScenarioDay: 0,
    currentScenarioStatus: 'none',
    lastResolvedDay: 0,
    lastSeenDay: 0,
    ledger: [],
    applications: [],
    listings: [],
    counters: { actionsResolved: 0, dataPurchasedMb: 0, dataUsedMb: 0, daysActive: 0 },
  };
}

export function normalizeDigitalLifeState(input = {}) {
  const base = createDefaultDigitalLifeState();
  const s = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = { ...base, ...s, version: 1 };
  out.dataMb = finiteInt(s.dataMb, 0, 0, DIGITAL_DATA_CAP_MB);
  for (const key of ['digitalReputation', 'communityTrust', 'civicLiteracy', 'scamAwareness', 'workConnections', 'relationshipBoundaries']) out[key] = clamp(s[key] ?? base[key]);
  for (const key of ['listingsPosted', 'applicationsSubmitted', 'scamLosses', 'harmfulForwards', 'misinformationShared']) out[key] = finiteInt(s[key], 0, 0, 1_000_000);
  out.currentScenarioId = safeId(s.currentScenarioId);
  out.currentScenarioDay = finiteInt(s.currentScenarioDay, 0, 0, 10_000_000);
  out.currentScenarioStatus = ['none', 'pending', 'resolved', 'expired'].includes(s.currentScenarioStatus) ? s.currentScenarioStatus : 'none';
  out.lastResolvedDay = finiteInt(s.lastResolvedDay, 0, 0, 10_000_000);
  out.lastSeenDay = finiteInt(s.lastSeenDay, 0, 0, 10_000_000);
  out.ledger = Array.isArray(s.ledger) ? s.ledger.filter(row => row && typeof row === 'object').slice(0, 100).map(row => ({
    day: finiteInt(row.day, 1, 1, 10_000_000),
    type: safeId(row.type),
    text: boundedText(row.text, 200),
    dataMb: finiteInt(row.dataMb, 0, 0, 10_000),
    amount: Math.max(-1_000_000, Math.min(1_000_000, Math.round(Number(row.amount) || 0))),
  })) : [];
  out.applications = Array.isArray(s.applications) ? s.applications.filter(row => row && typeof row === 'object').slice(0, 20).map(row => ({
    day: finiteInt(row.day, 1, 1, 10_000_000), dueDay: finiteInt(row.dueDay, 1, 1, 10_000_000),
    status: ['pending', 'interview', 'not-selected'].includes(row.status) ? row.status : 'pending',
    title: boundedText(row.title, 100),
  })) : [];
  out.listings = Array.isArray(s.listings) ? s.listings.filter(row => row && typeof row === 'object').slice(0, 30).map(row => ({
    day: finiteInt(row.day, 1, 1, 10_000_000), category: boundedText(row.category, 80), status: 'listed',
  })) : [];
  const c = s.counters && typeof s.counters === 'object' ? s.counters : {};
  out.counters = {
    actionsResolved: finiteInt(c.actionsResolved, 0, 0, 1_000_000),
    dataPurchasedMb: finiteInt(c.dataPurchasedMb, 0, 0, 10_000_000),
    dataUsedMb: finiteInt(c.dataUsedMb, 0, 0, 10_000_000),
    daysActive: finiteInt(c.daysActive, 0, 0, 10_000_000),
  };
  return out;
}

function addLedger(state, row) {
  state.ledger.unshift({ day: finiteInt(row.day, 1, 1, 10_000_000), type: safeId(row.type), text: boundedText(row.text, 200), dataMb: finiteInt(row.dataMb, 0, 0, 10_000), amount: Math.round(Number(row.amount) || 0) });
  state.ledger = state.ledger.slice(0, 100);
}

export function buyDigitalData(input, { bundleId, wallet = 0, activeShift = false } = {}) {
  const state = normalizeDigitalLifeState(input);
  const bundle = DIGITAL_DATA_BUNDLES.find(item => item.id === bundleId);
  const cash = finiteInt(wallet, 0, 0, 1_000_000_000);
  if (activeShift) return { ok: false, reason: 'active_shift', state, wallet: cash };
  if (!bundle) return { ok: false, reason: 'invalid_bundle', state, wallet: cash };
  if (cash < bundle.price) return { ok: false, reason: 'insufficient_wallet', required: bundle.price, state, wallet: cash };
  if (state.dataMb + bundle.mb > DIGITAL_DATA_CAP_MB) return { ok: false, reason: 'data_cap', state, wallet: cash };
  state.dataMb += bundle.mb;
  state.counters.dataPurchasedMb += bundle.mb;
  addLedger(state, { day: Math.max(1, state.lastSeenDay || 1), type: 'data_purchase', text: `Bought ${bundle.label} (${bundle.mb} MB)`, amount: -bundle.price });
  return { ok: true, state, wallet: cash - bundle.price, message: `Bought ${bundle.label}.` };
}

function dueOutcomes(state, day) {
  let changed = false;
  for (const application of state.applications) {
    if (application.status !== 'pending' || application.dueDay > day) continue;
    // Deterministic in-game result: outcomes depend on the day and civic/digital reliability, not random rerolls.
    const seed = (application.day * 7 + application.title.length * 3 + state.digitalReputation + state.workConnections) % 5;
    application.status = seed >= 2 ? 'interview' : 'not-selected';
    addLedger(state, { day, type: 'application_result', text: `${application.title}: ${application.status === 'interview' ? 'invited to interview' : 'not selected this time'}`, amount: 0 });
    changed = true;
  }
  return changed;
}

export function ensureDailyDigitalScenario(input, { day = 1 } = {}) {
  const state = normalizeDigitalLifeState(input);
  const currentDay = finiteInt(day, 1, 1, 10_000_000);
  if (state.lastSeenDay && currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state, scenario: null };
  dueOutcomes(state, currentDay);
  if (state.currentScenarioDay === currentDay && state.currentScenarioId) {
    state.lastSeenDay = currentDay;
    return { ok: true, added: false, state, scenario: DIGITAL_SCENARIOS.find(row => row.id === state.currentScenarioId) || null };
  }
  if (state.currentScenarioDay < currentDay && state.currentScenarioStatus === 'pending') {
    state.currentScenarioStatus = 'expired';
    addLedger(state, { day: currentDay, type: 'scenario_expired', text: 'A digital-life situation expired without a decision.', amount: 0 });
  }
  const priorSeenDay = state.lastSeenDay;
  const scenario = DIGITAL_SCENARIOS[(currentDay - 1) % DIGITAL_SCENARIOS.length];
  state.currentScenarioId = scenario.id;
  state.currentScenarioDay = currentDay;
  state.currentScenarioStatus = state.lastResolvedDay === currentDay ? 'resolved' : 'pending';
  state.lastSeenDay = currentDay;
  if (priorSeenDay !== currentDay) state.counters.daysActive += 1;
  return { ok: true, added: true, state, scenario };
}

export function resolveDigitalScenario(input, { choiceId, day = 1, activeShift = false, wallet = 0 } = {}) {
  const state = normalizeDigitalLifeState(input);
  const currentDay = finiteInt(day, 1, 1, 10_000_000);
  const cash = finiteInt(wallet, 0, 0, 1_000_000_000);
  if (activeShift) return { ok: false, reason: 'active_shift', state, wallet: cash };
  if (currentDay < state.currentScenarioDay || currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state, wallet: cash };
  if (state.currentScenarioStatus !== 'pending' || state.currentScenarioDay !== currentDay) return { ok: false, reason: 'scenario_not_pending', state, wallet: cash };
  const scenario = DIGITAL_SCENARIOS.find(item => item.id === state.currentScenarioId);
  const choice = scenario?.choices.find(item => item.id === choiceId);
  if (!choice) return { ok: false, reason: 'invalid_choice', state, wallet: cash };
  const dataCost = finiteInt(choice.dataMb, 0, 0, 10_000);
  const walletCost = finiteInt(choice.walletCost, 0, 0, 1_000_000);
  if (state.dataMb < dataCost) return { ok: false, reason: 'insufficient_data', requiredDataMb: dataCost, state, wallet: cash };
  if (cash < walletCost) return { ok: false, reason: 'insufficient_wallet', required: walletCost, state, wallet: cash };
  state.dataMb -= dataCost;
  state.counters.dataUsedMb += dataCost;
  for (const [key, delta] of Object.entries(choice.effects || {})) {
    if (['digitalReputation', 'communityTrust', 'civicLiteracy', 'scamAwareness', 'workConnections', 'relationshipBoundaries'].includes(key)) state[key] = clamp(state[key] + Number(delta || 0));
    else if (['listingsPosted', 'applicationsSubmitted', 'scamLosses', 'harmfulForwards', 'misinformationShared'].includes(key)) state[key] = finiteInt(state[key] + Number(delta || 0), state[key], 0, 1_000_000);
  }
  if (choice.outcome === 'listing' || choice.outcome === 'verified-listing') {
    const category = scenario.id === 'market-listing' ? 'Grains, provisions, used clothes or footwear' : 'Family or neighbourhood business';
    state.listings.unshift({ day: currentDay, category, status: 'listed' }); state.listings = state.listings.slice(0, 30);
  }
  if (choice.outcome === 'application') {
    state.applications.unshift({ day: currentDay, dueDay: currentDay + 2, status: 'pending', title: 'Kano company job application' });
    state.applications = state.applications.slice(0, 20);
  }
  state.currentScenarioStatus = 'resolved';
  state.lastResolvedDay = currentDay;
  state.counters.actionsResolved += 1;
  addLedger(state, { day: currentDay, type: 'scenario_choice', text: `${scenario.title}: ${choice.label}`, dataMb: dataCost, amount: -walletCost });
  const nextWallet = cash - walletCost;
  return { ok: true, state, wallet: nextWallet, dataCost, walletCost, message: 'Choice recorded. Your digital-life record was updated.' };
}

export function digitalLifeReport(input, { day = 1 } = {}) {
  const s = normalizeDigitalLifeState(input);
  return {
    version: 1,
    day: finiteInt(day, 1, 1, 10_000_000),
    balances: { dataMb: s.dataMb, digitalReputation: s.digitalReputation, communityTrust: s.communityTrust, civicLiteracy: s.civicLiteracy, scamAwareness: s.scamAwareness },
    outcomes: { listingsPosted: s.listingsPosted, applicationsSubmitted: s.applicationsSubmitted, scamLosses: s.scamLosses, harmfulForwards: s.harmfulForwards, misinformationShared: s.misinformationShared },
    counters: { ...s.counters },
    currentScenario: { id: s.currentScenarioId, day: s.currentScenarioDay, status: s.currentScenarioStatus },
    applications: s.applications.map(item => ({ ...item })),
    listings: s.listings.map(item => ({ ...item })),
    recentHistory: s.ledger.slice(0, 20).map(item => ({ ...item })),
    notice: 'Simulated digital life only. No real contacts, posts, messages, networks or political claims are accessed or shared.',
  };
}
