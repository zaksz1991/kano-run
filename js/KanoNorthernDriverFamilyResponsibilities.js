/**
 * Kano Life Step 62 — family responsibilities, time commitments and unexpected events.
 * Financial amounts are fictional game-balance values. This module never auto-debits money.
 */
export const FAMILY_RESPONSIBILITIES_STORAGE_KEY = 'kano-life-family-responsibilities-v1';
export const MAX_FAMILY_COMMITMENTS = 12;
export const MAX_FAMILY_HISTORY = 120;

const clampInt = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const dayNumber = value => clampInt(value, 1, 1000000, 1);
const walletAmount = value => clampInt(value, 0, 1000000000, 0);
const cleanText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180);
const clone = value => JSON.parse(JSON.stringify(value));
const RELATIONSHIP_STATUSES = new Set(['single', 'dating', 'engaged', 'married', 'separated', 'divorced']);

const EVENTS = Object.freeze([
  Object.freeze({ id: 'school-needs', category: 'Family & education', title: 'A younger relative needs school support', body: 'Someone in the family needs help with transport, stationery or an exam-related expense. You have to balance support with the cash needed to keep working.', amount: 300, promiseAmount: 250, dueDays: 3, timeTask: 'Call home and help work out the school plan.', timeDueDays: 1 }),
  Object.freeze({ id: 'aure-invitation', category: 'Aure & family ceremony', title: 'A relative is preparing for Aure', body: 'A family wedding is approaching. Relatives are discussing a contribution, clothes and who can help with preparations. Your circumstances may not match everyone else’s expectations.', amount: 420, promiseAmount: 350, dueDays: 4, timeTask: 'Speak with the family and agree what you can realistically do.', timeDueDays: 2 }),
  Object.freeze({ id: 'suna-ceremony', category: 'Family & community', title: 'A suna / naming ceremony invitation', body: 'A family has invited you to a naming ceremony. A modest gift is customary in this fictional scenario, but respectful attendance or a call can also matter.', amount: 280, promiseAmount: 220, dueDays: 3, timeTask: 'Call the family and confirm whether you can attend.', timeDueDays: 1 }),
  Object.freeze({ id: 'elder-visit', category: 'Care & responsibility', title: 'An older relative needs company and transport', body: 'An older relative asks for help arranging a visit and getting to an appointment. The situation needs practical coordination, not a diagnosis from the game.', amount: 260, promiseAmount: 200, dueDays: 2, timeTask: 'Arrange a suitable visit or transport plan.', timeDueDays: 1 }),
  Object.freeze({ id: 'home-repair', category: 'Unexpected household cost', title: 'Something at home needs repair', body: 'A household repair cannot be ignored forever. The family is deciding whether to fix it immediately, collect more information or share the cost gradually.', amount: 500, promiseAmount: 400, dueDays: 4, timeTask: 'Get a clear estimate and discuss a realistic repair date.', timeDueDays: 2 }),
  Object.freeze({ id: 'market-help', category: 'Family trade & market life', title: 'A family seller needs help before market opens', body: 'A relative selling provisions, grains, vegetables or used clothing needs help with a busy market morning. Time and transport are valuable even when cash is tight.', amount: 220, promiseAmount: 180, dueDays: 3, timeTask: 'Help plan stock transport or arrange a time to assist.', timeDueDays: 1 }),
  Object.freeze({ id: 'condolence', category: 'Community & condolence', title: 'A bereaved family requests support', body: 'A family in your wider circle has had a loss. You can offer a modest contribution, practical help or a respectful message; the game does not treat grief as a score.', amount: 300, promiseAmount: 220, dueDays: 3, timeTask: 'Call or visit at a suitable time and offer practical support.', timeDueDays: 2 }),
  Object.freeze({ id: 'living-costs', category: 'Cost of living', title: 'The household is short on essentials', body: 'Food, power and household prices are putting pressure on the family budget. A contribution may help, but keeping enough for your own fuel, bills and basic needs matters too.', amount: 350, promiseAmount: 250, dueDays: 3, timeTask: 'Review the household priorities with the family before spending.', timeDueDays: 1 }),
  Object.freeze({ id: 'family-journey', category: 'Family scheduling', title: 'Two family plans clash with your workday', body: 'A family visit and a busy earning period fall at the same time. You can coordinate a different time, contribute towards transport or explain your limits respectfully.', amount: 180, promiseAmount: 150, dueDays: 2, timeTask: 'Agree on a family visit time that does not interrupt a driving shift.', timeDueDays: 1 }),
  Object.freeze({ id: 'partner-check-in', category: 'Relationship & communication', title: 'Someone close says you have been unavailable', body: 'A partner or former partner says work and money worries have left little room for conversation. You can set a time to talk, make a practical gesture or explain your boundaries honestly.', amount: 100, promiseAmount: 80, dueDays: 2, timeTask: 'Make time for a calm, honest conversation.', timeDueDays: 1, statuses: ['dating', 'engaged', 'married', 'separated', 'divorced'] }),
  Object.freeze({ id: 'friend-pressure', category: 'Friends & social pressure', title: 'Friends make comments about your life choices', body: 'Friends compare earnings, relationships, marriage plans or household progress. You can keep your own timeline, ask for a respectful conversation or offer a small contribution to an agreed group plan.', amount: 150, promiseAmount: 120, dueDays: 3, timeTask: 'Set a respectful boundary and reconnect with a supportive person.', timeDueDays: 1, statuses: ['single'] }),
  Object.freeze({ id: 'auntie-visit', category: 'Family connection', title: 'Your auntie wants a visit or phone call', body: 'A relative has been checking in and would like to see you. A short visit can matter, but you can agree a realistic time instead of promising what your work schedule cannot support.', amount: 120, promiseAmount: 100, dueDays: 2, timeTask: 'Call or visit your relative at the agreed time.', timeDueDays: 1 }),
]);

export function createDefaultFamilyResponsibilitiesState() {
  return {
    version: 1,
    lastEventDay: 0,
    currentEventId: null,
    resolvedDays: [],
    commitments: [],
    counters: { eventsResolved: 0, financialSupport: 0, commitmentsMade: 0, commitmentsKept: 0, commitmentsRenegotiated: 0, boundariesSet: 0, timeCommitmentsMade: 0 },
    ledger: [],
  };
}

export function normalizeFamilyResponsibilitiesState(raw = {}) {
  const base = createDefaultFamilyResponsibilitiesState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const statuses = new Set(['pending', 'paid', 'completed', 'cancelled']);
  const commitments = Array.isArray(src.commitments) ? src.commitments.slice(0, 60).filter(row => row && typeof row === 'object').map((row, index) => ({
    id: cleanText(row.id || `family-commitment-${index + 1}`).slice(0, 80),
    createdDay: dayNumber(row.createdDay),
    dueDay: dayNumber(row.dueDay),
    amount: clampInt(row.amount, 0, 1000000, 0),
    kind: row.kind === 'time' ? 'time' : 'financial',
    category: cleanText(row.category || 'Family responsibility'),
    label: cleanText(row.label || 'Family commitment'),
    status: statuses.has(row.status) ? row.status : 'pending',
    renegotiations: clampInt(row.renegotiations, 0, 3, 0),
    settledDay: row.settledDay == null ? null : dayNumber(row.settledDay),
  })) : [];
  const counters = src.counters && typeof src.counters === 'object' ? src.counters : {};
  const ledger = Array.isArray(src.ledger) ? src.ledger.slice(0, MAX_FAMILY_HISTORY).filter(row => row && typeof row === 'object').map(row => ({
    day: dayNumber(row.day),
    type: String(row.type || 'note').replace(/[^a-z0-9-]/gi, '').slice(0, 36) || 'note',
    text: cleanText(row.text),
    amount: clampInt(row.amount, -1000000, 1000000, 0),
    commitmentId: row.commitmentId == null ? null : cleanText(row.commitmentId).slice(0, 80),
  })) : [];
  return {
    version: 1,
    lastEventDay: clampInt(src.lastEventDay, 0, 1000000, 0),
    currentEventId: EVENTS.some(event => event.id === src.currentEventId) ? src.currentEventId : null,
    resolvedDays: Array.isArray(src.resolvedDays) ? [...new Set(src.resolvedDays.map(dayNumber))].slice(-180) : [],
    commitments,
    counters: Object.fromEntries(Object.keys(base.counters).map(key => [key, clampInt(counters[key], 0, 10000000, 0)])),
    ledger,
  };
}

function addLedger(state, { day, type, text, amount = 0, commitmentId = null }) {
  state.ledger.unshift({ day: dayNumber(day), type, text: cleanText(text), amount: clampInt(amount, -1000000, 1000000, 0), commitmentId: commitmentId ? cleanText(commitmentId).slice(0, 80) : null });
  state.ledger = state.ledger.slice(0, MAX_FAMILY_HISTORY);
}
function statusValue(status) { return RELATIONSHIP_STATUSES.has(status) ? status : 'single'; }
function eventForId(id) { return EVENTS.find(event => event.id === id) || null; }

export function availableFamilyEvents(relationshipStatus = 'single') {
  const status = statusValue(relationshipStatus);
  return EVENTS.filter(event => !event.statuses || event.statuses.includes(status)).map(event => ({ ...event, statuses: event.statuses ? [...event.statuses] : null }));
}

export function familyEventForDay(rawState, { day = 1, relationshipStatus = 'single' } = {}) {
  const state = normalizeFamilyResponsibilitiesState(rawState);
  const d = dayNumber(day);
  if (state.lastEventDay > d) return { ok: false, reason: 'clock_rollback', state, event: null };
  if (state.lastEventDay === d && state.currentEventId) {
    const existing = eventForId(state.currentEventId);
    return { ok: Boolean(existing), reason: null, state, event: existing ? { ...existing, day: d, choices: makeChoices(existing) } : null, resolved: state.resolvedDays.includes(d) };
  }
  if (state.lastEventDay > 0 && !state.resolvedDays.includes(state.lastEventDay)) {
    state.resolvedDays.push(state.lastEventDay);
    addLedger(state, { day: state.lastEventDay, type: 'event-lapsed', text: 'A prior family situation passed without a recorded decision; no money was taken.' });
  }
  const deck = availableFamilyEvents(relationshipStatus);
  if (!deck.length) return { ok: false, reason: 'no_events', state, event: null };
  const index = (d - 1) % deck.length;
  const selected = deck[index];
  state.lastEventDay = d;
  state.currentEventId = selected.id;
  return { ok: true, reason: null, state, event: { ...selected, day: d, choices: makeChoices(selected) }, resolved: false };
}

function makeChoices(event) {
  return [
    { id: 'contribute', label: `Contribute now · ₦${event.amount.toLocaleString('en-NG')}`, walletDelta: -event.amount },
    { id: 'promise', label: `Promise ₦${event.promiseAmount.toLocaleString('en-NG')} by day +${event.dueDays}`, walletDelta: 0 },
    { id: 'time', label: 'Offer time or practical help', walletDelta: 0 },
    { id: 'boundary', label: 'Explain your limits respectfully', walletDelta: 0 },
  ];
}

export function getFamilyResponsibilitiesReport(rawState, { day = 1, relationshipStatus = 'single' } = {}) {
  const ensured = familyEventForDay(rawState, { day, relationshipStatus });
  const state = ensured.state;
  const pending = state.commitments.filter(item => item.status === 'pending').sort((a, b) => a.dueDay - b.dueDay || a.createdDay - b.createdDay);
  return {
    day: dayNumber(day),
    ok: ensured.ok,
    event: ensured.event ? { ...ensured.event, choices: ensured.event.choices.map(choice => ({ ...choice })) } : null,
    eventResolved: Boolean(ensured.resolved),
    walletRequiredForContribution: ensured.event?.amount || 0,
    pendingCommitments: pending.map(item => ({ ...item, overdue: item.dueDay < dayNumber(day), dueInDays: item.dueDay - dayNumber(day) })),
    summary: {
      pending: pending.length,
      overdue: pending.filter(item => item.dueDay < dayNumber(day)).length,
      dueToday: pending.filter(item => item.dueDay === dayNumber(day)).length,
      completed: state.counters.commitmentsKept,
      made: state.counters.commitmentsMade,
      eventsResolved: state.counters.eventsResolved,
      financialSupport: state.counters.financialSupport,
      renegotiated: state.counters.commitmentsRenegotiated,
      boundariesSet: state.counters.boundariesSet,
    },
    ledger: state.ledger.slice(0, 10).map(row => ({ ...row })),
    state,
  };
}

export function resolveFamilyResponsibilityEvent(rawState, { day = 1, relationshipStatus = 'single', eventId, choiceId, wallet = 0, activeShift = false } = {}) {
  const ensured = familyEventForDay(rawState, { day, relationshipStatus });
  const state = ensured.state;
  const cash = walletAmount(wallet);
  const d = dayNumber(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state, wallet: cash };
  if (!ensured.event || eventId !== ensured.event.id) return { ok: false, reason: 'stale_event', state, wallet: cash };
  if (state.resolvedDays.includes(d)) return { ok: false, reason: 'already_resolved', state, wallet: cash };
  const event = ensured.event;
  const choice = makeChoices(event).find(item => item.id === choiceId);
  if (!choice) return { ok: false, reason: 'invalid_choice', state, wallet: cash };
  if (choiceId === 'contribute' && cash < event.amount) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: event.amount };
  if ((choiceId === 'promise' || choiceId === 'time') && state.commitments.filter(item => item.status === 'pending').length >= MAX_FAMILY_COMMITMENTS) {
    return { ok: false, reason: 'too_many_commitments', state, wallet: cash, limit: MAX_FAMILY_COMMITMENTS };
  }
  let nextWallet = cash;
  let message = '';
  let amount = 0;
  if (choiceId === 'contribute') {
    nextWallet -= event.amount; amount = event.amount; state.counters.financialSupport += event.amount;
    message = `Contributed ₦${event.amount.toLocaleString('en-NG')} towards: ${event.title}.`;
    addLedger(state, { day: d, type: 'family-contribution', text: message, amount: -event.amount });
  } else if (choiceId === 'promise') {
    const commitment = {
      id: `fam-${d}-${event.id}`,
      createdDay: d,
      dueDay: d + event.dueDays,
      amount: event.promiseAmount,
      kind: 'financial',
      category: event.category,
      label: event.title,
      status: 'pending',
      renegotiations: 0,
      settledDay: null,
    };
    if (state.commitments.some(item => item.id === commitment.id)) return { ok: false, reason: 'duplicate_commitment', state, wallet: cash };
    state.commitments.unshift(commitment); state.commitments = state.commitments.slice(0, 60);
    state.counters.commitmentsMade += 1; amount = event.promiseAmount;
    message = `Promise recorded for ₦${event.promiseAmount.toLocaleString('en-NG')}, due on in-game day ${commitment.dueDay}. No money was taken today.`;
    addLedger(state, { day: d, type: 'family-promise', text: message, amount: 0, commitmentId: commitment.id });
  } else if (choiceId === 'time') {
    const commitment = {
      id: `fam-time-${d}-${event.id}`,
      createdDay: d,
      dueDay: d + event.timeDueDays,
      amount: 0,
      kind: 'time',
      category: event.category,
      label: event.timeTask,
      status: 'pending',
      renegotiations: 0,
      settledDay: null,
    };
    if (state.commitments.some(item => item.id === commitment.id)) return { ok: false, reason: 'duplicate_commitment', state, wallet: cash };
    state.commitments.unshift(commitment); state.commitments = state.commitments.slice(0, 60);
    state.counters.commitmentsMade += 1; state.counters.timeCommitmentsMade += 1;
    message = `Time commitment recorded for day ${commitment.dueDay}. Complete it when safely off shift.`;
    addLedger(state, { day: d, type: 'family-time-promise', text: message, amount: 0, commitmentId: commitment.id });
  } else {
    state.counters.boundariesSet += 1;
    message = 'You explained your limits respectfully. No money was taken, and no promise was created.';
    addLedger(state, { day: d, type: 'family-boundary', text: message, amount: 0 });
  }
  state.resolvedDays.push(d); state.resolvedDays = [...new Set(state.resolvedDays)].slice(-180);
  state.counters.eventsResolved += 1;
  return { ok: true, state, wallet: nextWallet, walletDelta: nextWallet - cash, amount, event: { ...event, choices: makeChoices(event) }, choiceId, message };
}

export function completeFamilyCommitment(rawState, { commitmentId, day = 1, wallet = 0, activeShift = false } = {}) {
  const state = normalizeFamilyResponsibilitiesState(rawState); const d = dayNumber(day); const cash = walletAmount(wallet);
  if (activeShift) return { ok: false, reason: 'shift_active', state, wallet: cash };
  const item = state.commitments.find(row => row.id === commitmentId && row.status === 'pending');
  if (!item) return { ok: false, reason: 'commitment_not_pending', state, wallet: cash };
  if (item.amount > cash) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: item.amount };
  item.status = item.kind === 'time' ? 'completed' : 'paid'; item.settledDay = d;
  state.counters.commitmentsKept += 1;
  const newWallet = cash - item.amount;
  const text = item.kind === 'time' ? `Completed: ${item.label}.` : `Paid ₦${item.amount.toLocaleString('en-NG')} for: ${item.label}.`;
  addLedger(state, { day: d, type: item.kind === 'time' ? 'family-time-completed' : 'family-commitment-paid', text, amount: -item.amount, commitmentId: item.id });
  return { ok: true, state, wallet: newWallet, amountPaid: item.amount, commitment: { ...item }, message: text };
}

export function renegotiateFamilyCommitment(rawState, { commitmentId, day = 1, activeShift = false } = {}) {
  const state = normalizeFamilyResponsibilitiesState(rawState); const d = dayNumber(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  const item = state.commitments.find(row => row.id === commitmentId && row.status === 'pending');
  if (!item) return { ok: false, reason: 'commitment_not_pending', state };
  if (item.renegotiations >= 3) return { ok: false, reason: 'renegotiation_limit', state, limit: 3 };
  const previousDue = item.dueDay;
  item.dueDay = Math.max(item.dueDay + 1, d + 2);
  item.renegotiations += 1;
  state.counters.commitmentsRenegotiated += 1;
  const text = `Renegotiated “${item.label}” from day ${previousDue} to day ${item.dueDay}; no money was taken.`;
  addLedger(state, { day: d, type: 'family-commitment-renegotiated', text, amount: 0, commitmentId: item.id });
  return { ok: true, state, commitment: { ...item }, message: text };
}

export function exportFamilyResponsibilitiesReport(rawState, options = {}) {
  const report = getFamilyResponsibilitiesReport(rawState, options);
  delete report.state;
  return { version: 1, ...report };
}
