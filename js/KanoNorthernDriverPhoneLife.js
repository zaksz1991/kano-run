/**
 * Kano Life — phone, calls and everyday communication.
 * All content is fictional roleplay. Phone actions are blocked during active driving.
 */
export const PHONE_LIFE_STORAGE_KEY = 'kano_northern_driver_phone_life_v1';
export const PHONE_TOP_UPS = Object.freeze([
  { id: 'airtime_100', amount: 100, label: '₦100 airtime' },
  { id: 'airtime_250', amount: 250, label: '₦250 airtime' },
  { id: 'airtime_500', amount: 500, label: '₦500 airtime' },
]);
export const PHONE_AIRTIME_CAP = 2000;
export const PHONE_ACTION_COSTS = Object.freeze({ call_back: 25, reply: 5, boundary: 5, ignore: 0 });
const CHANNELS = new Set(['call', 'message']);
const MESSAGE_STATES = new Set(['pending', 'resolved', 'expired']);
const BOND_KEYS = ['family', 'partner', 'market', 'park', 'work', 'community'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
const clean = (v, max = 220) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));
const safeDay = value => clamp(Math.floor(Number(value) || 1), 1, 999999);

export function createDefaultPhoneLifeState() {
  return {
    version: 1,
    lastGeneratedDay: 0,
    airtime: 100,
    inbox: [],
    bonds: { family: 50, partner: 50, market: 50, park: 50, work: 50, community: 50 },
    ledger: [],
    counters: { callsMade: 0, messagesSent: 0, boundariesSet: 0, ignored: 0, missedCalls: 0 },
  };
}

export function normalizePhoneLifeState(input = {}) {
  const defaults = createDefaultPhoneLifeState();
  const source = input && typeof input === 'object' ? input : {};
  const bonds = {};
  for (const key of BOND_KEYS) bonds[key] = Math.round(clamp(source.bonds?.[key] ?? 50, 0, 100));
  const inbox = Array.isArray(source.inbox) ? source.inbox.slice(-40).map((item, index) => ({
    id: clean(item?.id, 100) || `phone-message-${index + 1}`,
    day: safeDay(item?.day),
    contact: clean(item?.contact, 60) || 'Kano contact',
    contactId: clean(item?.contactId, 60) || 'community',
    bondKey: BOND_KEYS.includes(item?.bondKey) ? item.bondKey : 'community',
    category: clean(item?.category, 40) || 'daily_life',
    kind: CHANNELS.has(item?.kind) ? item.kind : 'message',
    title: clean(item?.title, 100) || 'A new message',
    body: clean(item?.body, 420),
    status: MESSAGE_STATES.has(item?.status) ? item.status : 'pending',
    relationshipStatus: clean(item?.relationshipStatus, 30) || 'single',
    action: clean(item?.action, 30),
  })) : [];
  const ledger = Array.isArray(source.ledger) ? source.ledger.slice(0, 80).map(item => ({
    day: safeDay(item?.day),
    text: clean(item?.text, 220),
    amount: Math.round(clamp(item?.amount ?? 0, -50000, 50000)),
  })) : [];
  const countersSource = source.counters || {};
  return {
    ...defaults,
    lastGeneratedDay: Math.floor(clamp(source.lastGeneratedDay ?? 0, 0, 999999)),
    airtime: Math.floor(clamp(source.airtime ?? defaults.airtime, 0, PHONE_AIRTIME_CAP)),
    inbox, bonds, ledger,
    counters: {
      callsMade: Math.floor(clamp(countersSource.callsMade ?? 0, 0, 999999)),
      messagesSent: Math.floor(clamp(countersSource.messagesSent ?? 0, 0, 999999)),
      boundariesSet: Math.floor(clamp(countersSource.boundariesSet ?? 0, 0, 999999)),
      ignored: Math.floor(clamp(countersSource.ignored ?? 0, 0, 999999)),
      missedCalls: Math.floor(clamp(countersSource.missedCalls ?? 0, 0, 999999)),
    },
  };
}

const scenarios = {
  family: {
    contact: 'Aunty Laraba', contactId: 'aunty-laraba', bondKey: 'family', category: 'family',
    title: 'Family check-in',
    body: 'Aunty Laraba wants to discuss a family gathering and transport arrangements. You can call back, send a short reply, set a respectful boundary, or leave it unanswered.',
  },
  single: {
    contact: 'Kabiru', contactId: 'kabiru-friend', bondKey: 'community', category: 'social_pressure',
    title: 'Questions about marriage',
    body: 'A friend says people at a gathering are asking when you will marry. You can reply calmly, set a boundary, or leave the conversation. Being single is not a failure.',
  },
  partner: {
    contact: 'Your partner', contactId: 'partner', bondKey: 'partner', category: 'relationship',
    title: 'A relationship check-in',
    body: 'Your partner says you had planned to talk today. A sincere reply, a safe call after work, or a clear boundary can each lead to a different conversation.',
  },
  separated: {
    contact: 'A relative', contactId: 'relative-after-separation', bondKey: 'family', category: 'relationship_boundary',
    title: 'Family contact after separation',
    body: 'A relative asks how you would like family contact to work after a separation or divorce. You can explain your needs privately or leave the message for later.',
  },
  market: {
    contact: 'Talatu', contactId: 'talatu-market', bondKey: 'market', category: 'market',
    title: 'Market stock update',
    body: 'Talatu says the price of a few market goods has changed and asks whether you still want to meet after your shift. Check your budget before agreeing to buy stock.',
  },
  park: {
    contact: 'Asabe', contactId: 'asabe-park', bondKey: 'park', category: 'park',
    title: 'Park and route coordination',
    body: 'Asabe asks whether you can confirm a park queue arrangement. Avoid replying while the keke is moving; the message can wait until you are safely stopped.',
  },
  work: {
    contact: 'Emeka', contactId: 'emeka-company-worker', bondKey: 'work', category: 'work',
    title: 'A colleague who moved to Kano',
    body: 'Emeka, a company worker who moved to Kano from another state, asks about a lift connection after his shift. Confirm only when your driving shift is over and the route is clear.',
  },
  utility: {
    contact: 'Your landlord', contactId: 'landlord', bondKey: 'family', category: 'household',
    title: 'Household bill reminder',
    body: 'Your landlord sends a reminder about a shared electricity or household contribution. Check the existing household budget before promising a payment.',
  },
  community: {
    contact: 'Neighbourhood group', contactId: 'neighbourhood-group', bondKey: 'community', category: 'community',
    title: 'Community occasion',
    body: 'A neighbourhood group shares details about a community visit or seasonal gathering. You can respond politely, explain that work is busy, or keep your time private.',
  },
};

export function phoneScenarioForDay(dayValue, relationshipStatus = 'single') {
  const day = safeDay(dayValue);
  const status = clean(relationshipStatus, 30).toLowerCase() || 'single';
  const slot = (day - 1) % 7;
  let key = ['family', 'single', 'market', 'park', 'work', 'utility', 'community'][slot];
  if (slot === 1) {
    if (['dating', 'engaged', 'married'].includes(status)) key = 'partner';
    else if (['separated', 'divorced'].includes(status)) key = 'separated';
    else key = 'single';
  }
  const scenario = scenarios[key];
  return {
    id: `phone-day-${day}`,
    day,
    contact: scenario.contact,
    contactId: scenario.contactId,
    bondKey: scenario.bondKey,
    category: scenario.category,
    kind: day % 3 === 0 || (slot === 1 && key === 'partner') ? 'call' : 'message',
    title: scenario.title,
    body: scenario.body,
    status: 'pending',
    relationshipStatus: status,
    action: '',
  };
}

export function ensureDailyPhoneMessages(input, { day: dayValue = 1, relationshipStatus = 'single' } = {}) {
  const state = normalizePhoneLifeState(input);
  const day = safeDay(dayValue);
  if (day <= state.lastGeneratedDay) return { ok: true, state, added: 0, reason: 'already_current' };
  const fromDay = Math.max(state.lastGeneratedDay + 1, day - 2);
  let added = 0;
  for (let nextDay = fromDay; nextDay <= day; nextDay += 1) {
    const message = phoneScenarioForDay(nextDay, relationshipStatus);
    if (state.inbox.some(item => item.id === message.id)) continue;
    state.inbox.unshift(message);
    if (message.kind === 'call') state.counters.missedCalls += 1;
    added += 1;
  }
  state.lastGeneratedDay = day;
  state.inbox = state.inbox.slice(0, 40);
  return { ok: true, state, added, reason: 'generated' };
}

export function topUpPhoneAirtime(input, { amount: amountValue, wallet: walletValue, activeShift = false } = {}) {
  const state = normalizePhoneLifeState(input);
  const amount = Math.floor(Number(amountValue));
  const wallet = Math.max(0, Math.floor(Number(walletValue) || 0));
  if (activeShift) return { ok: false, reason: 'shift_active', state, wallet, airtime: state.airtime };
  if (!PHONE_TOP_UPS.some(item => item.amount === amount)) return { ok: false, reason: 'invalid_top_up', state, wallet, airtime: state.airtime };
  if (state.airtime + amount > PHONE_AIRTIME_CAP) return { ok: false, reason: 'airtime_cap', state, wallet, airtime: state.airtime };
  if (wallet < amount) return { ok: false, reason: 'insufficient_wallet', state, wallet, airtime: state.airtime, required: amount };
  state.airtime += amount;
  state.ledger.unshift({ day: state.lastGeneratedDay || 1, text: `Bought ₦${amount} airtime`, amount: -amount });
  state.ledger = state.ledger.slice(0, 80);
  return { ok: true, reason: 'topped_up', state, wallet: wallet - amount, airtime: state.airtime };
}

export function resolvePhoneMessage(input, { messageId, action, day: dayValue = 1, airtime: airtimeValue, activeShift = false } = {}) {
  const state = normalizePhoneLifeState(input);
  const day = safeDay(dayValue);
  const airtime = Math.floor(clamp(airtimeValue ?? state.airtime, 0, PHONE_AIRTIME_CAP));
  const message = state.inbox.find(item => item.id === String(messageId));
  if (activeShift) return { ok: false, reason: 'shift_active', state, airtime };
  if (!message || message.status !== 'pending') return { ok: false, reason: 'message_not_pending', state, airtime };
  if (day - message.day > 2) {
    message.status = 'expired';
    state.bonds[message.bondKey] = Math.max(0, state.bonds[message.bondKey] - 1);
    state.ledger.unshift({ day, text: `Let an old message from ${message.contact} expire`, amount: 0 });
    state.ledger = state.ledger.slice(0, 80);
    return { ok: false, reason: 'message_expired', state, airtime };
  }
  if (!['call_back', 'reply', 'boundary', 'ignore'].includes(action)) return { ok: false, reason: 'invalid_action', state, airtime };
  const cost = PHONE_ACTION_COSTS[action];
  if (airtime < cost) return { ok: false, reason: 'insufficient_airtime', state, airtime, required: cost };
  const trustDelta = { call_back: 4, reply: 3, boundary: 2, ignore: -3 }[action];
  message.status = 'resolved'; message.action = action;
  state.airtime = airtime - cost;
  state.bonds[message.bondKey] = Math.round(clamp(state.bonds[message.bondKey] + trustDelta, 0, 100));
  if (action === 'call_back') state.counters.callsMade += 1;
  else if (action === 'reply' || action === 'boundary') state.counters.messagesSent += 1;
  if (action === 'boundary') state.counters.boundariesSet += 1;
  if (action === 'ignore') state.counters.ignored += 1;
  const descriptions = {
    call_back: `Called ${message.contact} back`,
    reply: `Sent a respectful reply to ${message.contact}`,
    boundary: `Set a clear boundary with ${message.contact}`,
    ignore: `Left ${message.contact}'s message unanswered`,
  };
  state.ledger.unshift({ day, text: descriptions[action], amount: -cost });
  state.ledger = state.ledger.slice(0, 80);
  return { ok: true, reason: 'resolved', state, airtime: state.airtime, cost, trustDelta, message: descriptions[action] };
}

export function getPhoneLifeReport(input, { day: dayValue = 1, relationshipStatus = 'single' } = {}) {
  const state = normalizePhoneLifeState(input);
  const day = safeDay(dayValue);
  return {
    state,
    day,
    relationshipStatus: clean(relationshipStatus, 30) || 'single',
    pending: state.inbox.filter(item => item.status === 'pending' && day - item.day <= 2),
    unreadCount: state.inbox.filter(item => item.status === 'pending' && day - item.day <= 2).length,
    expiredCount: state.inbox.filter(item => item.status === 'expired' || (item.status === 'pending' && day - item.day > 2)).length,
    recentLedger: state.ledger.slice(0, 8),
    bonds: { ...state.bonds },
    counters: { ...state.counters },
  };
}

export function exportPhoneLifeReport(input, context = {}) {
  const report = getPhoneLifeReport(input, context);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    day: report.day,
    relationshipStatus: report.relationshipStatus,
    airtime: report.state.airtime,
    pending: report.pending,
    bonds: report.bonds,
    counters: report.counters,
    ledger: report.state.ledger,
  };
}
