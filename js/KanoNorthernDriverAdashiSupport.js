/**
 * Kano Life Step 72 — Adashi & Neighbourhood Support.
 *
 * Pure state transitions. The host application owns the authoritative wallet;
 * this module returns proposed wallet balances and state without writing storage.
 * The UI commits both into the existing save object in one storage write.
 * All amounts and outcomes are fictional gameplay parameters, not financial advice.
 */

export const ADASHI_SUPPORT_SCHEMA_VERSION = 1;
export const ADASHI_SUPPORT_SAVE_FIELD = 'adashiSupportV1';
export const ADASHI_SUPPORT_CONTRIBUTIONS = Object.freeze([100, 250, 500, 1000]);
export const ADASHI_SUPPORT_MEMBER_COUNTS = Object.freeze([4, 5, 6, 7, 8]);
export const ADASHI_SUPPORT_MAX_HISTORY = 80;
export const ADASHI_SUPPORT_WEEK_DAYS = 7;

export const ADASHI_CONTACTS = Object.freeze([
  { id: 'amina', name: 'Amina', role: 'Market trader', trust: 50 },
  { id: 'musa', name: 'Musa', role: 'Keke driver', trust: 50 },
  { id: 'kabiru', name: 'Kabiru', role: 'Mechanic apprentice', trust: 50 },
  { id: 'zainab', name: 'Zainab', role: 'School-run parent', trust: 50 },
  { id: 'bashir', name: 'Bashir', role: 'Neighbourhood organiser', trust: 50 },
  { id: 'maryam', name: 'Maryam', role: 'Small-business owner', trust: 50 },
]);

export const ADASHI_SUPPORT_OFFER_TYPES = Object.freeze([
  { id: 'road-update', label: 'Share a road or traffic update', trustGain: 4 },
  { id: 'customer-referral', label: 'Refer a customer or market lead', trustGain: 5 },
  { id: 'practical-check-in', label: 'Check in and offer practical help', trustGain: 4 },
  { id: 'mechanic-lead', label: 'Share a mechanic or parts lead', trustGain: 5 },
]);

export const ADASHI_SUPPORT_REQUEST_TYPES = Object.freeze([
  { id: 'route-information', label: 'Ask for local route information' },
  { id: 'mechanic-information', label: 'Ask for a mechanic or parts lead' },
  { id: 'customer-lead', label: 'Ask about a possible customer lead' },
  { id: 'household-check-in', label: 'Ask for a practical household check-in' },
]);

const NPC_ROSTER = Object.freeze(['Amina', 'Musa', 'Kabiru', 'Zainab', 'Bashir', 'Maryam', 'Sani']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const nonNegativeInt = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
};
const safeDay = value => Math.max(1, nonNegativeInt(value, 1));
const safeText = (value, max = 120) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const findOption = (options, id) => options.find(option => option.id === id);

function normaliseEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const allowed = new Set(['circle-created', 'circle-closed', 'contribution-paid', 'turn-settled', 'support-offered', 'support-requested']);
  const type = allowed.has(event.type) ? event.type : null;
  if (!type) return null;
  return {
    id: safeText(event.id, 100),
    type,
    day: safeDay(event.day),
    message: safeText(event.message, 260),
    amount: nonNegativeInt(event.amount),
    trustDelta: clamp(nonNegativeInt(event.trustDelta), 0, 100),
    cycle: nonNegativeInt(event.cycle, 1),
    week: nonNegativeInt(event.week, 1),
    contactId: safeText(event.contactId, 50),
  };
}

function normaliseContact(input, fallback) {
  const row = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    id: fallback.id,
    name: fallback.name,
    role: fallback.role,
    trust: clamp(nonNegativeInt(row.trust, fallback.trust), 0, 100),
    lastSupportDay: row.lastSupportDay == null ? null : safeDay(row.lastSupportDay),
    lastHelpRequestDay: row.lastHelpRequestDay == null ? null : safeDay(row.lastHelpRequestDay),
    helpOffered: nonNegativeInt(row.helpOffered),
    helpReceived: nonNegativeInt(row.helpReceived),
    helpRequests: nonNegativeInt(row.helpRequests),
  };
}

function normaliseCircle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const contributionAmount = ADASHI_SUPPORT_CONTRIBUTIONS.includes(Number(input.contributionAmount))
    ? Number(input.contributionAmount) : 250;
  const memberCount = ADASHI_SUPPORT_MEMBER_COUNTS.includes(Number(input.memberCount))
    ? Number(input.memberCount) : 6;
  const playerPosition = clamp(nonNegativeInt(input.playerPosition, 3), 1, memberCount);
  const names = [];
  let npcIndex = 0;
  for (let position = 1; position <= memberCount; position += 1) {
    if (position === playerPosition) names.push({ position, name: 'You', isPlayer: true });
    else {
      names.push({ position, name: NPC_ROSTER[npcIndex % NPC_ROSTER.length], isPlayer: false });
      npcIndex += 1;
    }
  }
  const currentWeek = clamp(nonNegativeInt(input.currentWeek, 1), 1, memberCount);
  const status = input.status === 'active' ? 'active' : 'active';
  return {
    name: safeText(input.name, 80) || 'Kano Cooperative Circle',
    contributionAmount,
    memberCount,
    playerPosition,
    roster: names,
    status,
    cycleNumber: Math.max(1, nonNegativeInt(input.cycleNumber, 1)),
    currentWeek,
    startDay: safeDay(input.startDay),
    nextDueDay: safeDay(input.nextDueDay ?? input.startDay),
    lastSettledDay: input.lastSettledDay == null ? null : safeDay(input.lastSettledDay),
    paidThisWeek: input.paidThisWeek === true,
    payoutEligible: input.payoutEligible !== false,
    consecutivePayments: nonNegativeInt(input.consecutivePayments),
    ledger: Array.isArray(input.ledger) ? input.ledger.map(row => ({
      cycle: Math.max(1, nonNegativeInt(row?.cycle, 1)),
      week: Math.max(1, nonNegativeInt(row?.week, 1)),
      recipient: safeText(row?.recipient, 80),
      playerPaid: row?.playerPaid === true,
      contribution: nonNegativeInt(row?.contribution),
      pot: nonNegativeInt(row?.pot),
      playerPayout: nonNegativeInt(row?.playerPayout),
      day: safeDay(row?.day),
      missed: row?.missed === true,
    })).slice(-ADASHI_SUPPORT_MAX_HISTORY) : [],
  };
}

export function createDefaultAdashiSupportState() {
  return {
    schemaVersion: ADASHI_SUPPORT_SCHEMA_VERSION,
    circle: null,
    completedCircles: [],
    contacts: ADASHI_CONTACTS.map(contact => normaliseContact({}, contact)),
    lastSocialActionDay: null,
    reputation: 50,
    stats: {
      contributionsPaid: 0,
      contributionsMissed: 0,
      totalContributed: 0,
      payoutsReceived: 0,
      totalPayouts: 0,
      turnsSettled: 0,
      supportOffered: 0,
      supportRequested: 0,
      supportReceived: 0,
    },
    history: [],
  };
}

export function normalizeAdashiSupportState(input) {
  const defaults = createDefaultAdashiSupportState();
  const row = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const stats = row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
  const contactsById = new Map((Array.isArray(row.contacts) ? row.contacts : []).map(contact => [String(contact?.id ?? ''), contact]));
  return {
    schemaVersion: ADASHI_SUPPORT_SCHEMA_VERSION,
    circle: normaliseCircle(row.circle),
    completedCircles: Array.isArray(row.completedCircles) ? row.completedCircles.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(-12).map(item => ({
      name: safeText(item.name, 80) || 'Kano Cooperative Circle',
      contributionAmount: ADASHI_SUPPORT_CONTRIBUTIONS.includes(Number(item.contributionAmount)) ? Number(item.contributionAmount) : 250,
      memberCount: ADASHI_SUPPORT_MEMBER_COUNTS.includes(Number(item.memberCount)) ? Number(item.memberCount) : 6,
      playerPosition: Math.max(1, nonNegativeInt(item.playerPosition, 1)),
      cycleNumber: Math.max(1, nonNegativeInt(item.cycleNumber, 1)),
      closedAtDay: safeDay(item.closedAtDay),
      ledger: Array.isArray(item.ledger) ? item.ledger.slice(-30).filter(row => row && typeof row === 'object').map(row => ({ cycle: Math.max(1, nonNegativeInt(row.cycle, 1)), week: Math.max(1, nonNegativeInt(row.week, 1)), recipient: safeText(row.recipient, 80), playerPaid: row.playerPaid === true, contribution: nonNegativeInt(row.contribution), pot: nonNegativeInt(row.pot), playerPayout: nonNegativeInt(row.playerPayout), day: safeDay(row.day), missed: row.missed === true })) : [],
    })) : [],
    contacts: ADASHI_CONTACTS.map(contact => normaliseContact(contactsById.get(contact.id), contact)),
    lastSocialActionDay: row.lastSocialActionDay == null ? null : safeDay(row.lastSocialActionDay),
    reputation: clamp(nonNegativeInt(row.reputation, defaults.reputation), 0, 100),
    stats: Object.fromEntries(Object.keys(defaults.stats).map(key => [key, nonNegativeInt(stats[key], defaults.stats[key])])),
    history: Array.isArray(row.history) ? row.history.map(normaliseEvent).filter(Boolean).slice(-ADASHI_SUPPORT_MAX_HISTORY) : [],
  };
}

export function createAdashiCircle(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const amount = Number(options.contributionAmount);
  const count = Number(options.memberCount);
  const position = Number(options.playerPosition);
  if (!ADASHI_SUPPORT_CONTRIBUTIONS.includes(amount)) return { ok: false, state, message: 'Choose a supported fictional game contribution amount.' };
  if (!ADASHI_SUPPORT_MEMBER_COUNTS.includes(count)) return { ok: false, state, message: 'Choose a circle with 4–8 members.' };
  if (!Number.isInteger(position) || position < 1 || position > count) return { ok: false, state, message: 'Choose a payout position within the selected circle size.' };
  if (state.circle) return { ok: false, state, message: 'A circle is already active. Complete the current circle and close it before creating another.' };
  const day = safeDay(options.day);
  state.circle = normaliseCircle({
    name: safeText(options.name, 80) || 'Kano Cooperative Circle',
    contributionAmount: amount,
    memberCount: count,
    playerPosition: position,
    cycleNumber: 1,
    currentWeek: 1,
    startDay: day,
    nextDueDay: day,
    paidThisWeek: false,
    ledger: [],
  });
  addHistory(state, { type: 'circle-created', day, message: `Joined ${state.circle.name}: ${count} members, ${formatMoney(amount)} each week. Payout position ${position}.`, cycle: 1, week: 1 });
  return { ok: true, state, message: 'Adashi circle created. No money was deducted.' };
}

export function closeAdashiCircle(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const circle = state.circle;
  const day = safeDay(options.day);
  if (!circle) return { ok: false, state, message: 'There is no active circle to close.' };
  if (circle.currentWeek !== 1 || circle.paidThisWeek || circle.ledger.length === 0 || circle.ledger.length % circle.memberCount !== 0) {
    return { ok: false, state, message: 'A circle can be closed only after a complete cycle, before the next contribution is paid.' };
  }
  state.completedCircles.push({
    name: circle.name,
    contributionAmount: circle.contributionAmount,
    memberCount: circle.memberCount,
    playerPosition: circle.playerPosition,
    cycleNumber: Math.max(1, circle.cycleNumber - (circle.ledger.length ? 1 : 0)),
    closedAtDay: day,
    ledger: circle.ledger.slice(-30),
  });
  state.completedCircles = state.completedCircles.slice(-12);
  state.circle = null;
  const message = `Adashi circle closed between cycles. Its summary remains in your local game record; no extra wallet transaction was made.`;
  addHistory(state, { type: 'circle-closed', day, message });
  return { ok: true, state, message };
}

export function getAdashiSnapshot(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const circle = state.circle;
  const day = safeDay(options.day);
  const wallet = nonNegativeInt(options.wallet);
  if (!circle) return { state, circle: null, day, wallet, due: false, playerTurn: false, canPay: false, canSettle: false, currentRecipient: null, pot: 0, daysUntilDue: null };
  const currentRecipient = circle.roster.find(member => member.position === circle.currentWeek) || null;
  const due = day >= circle.nextDueDay;
  return {
    state, circle, day, wallet, due,
    playerTurn: circle.currentWeek === circle.playerPosition,
    canPay: due && !circle.paidThisWeek && wallet >= circle.contributionAmount,
    canSettle: due,
    currentRecipient,
    pot: circle.contributionAmount * circle.memberCount,
    daysUntilDue: Math.max(0, circle.nextDueDay - day),
    playerTrust: state.reputation,
  };
}

export function payAdashiContribution(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const circle = state.circle;
  const day = safeDay(options.day);
  const wallet = nonNegativeInt(options.wallet);
  if (!circle) return { ok: false, state, wallet, message: 'Create an Adashi circle first.' };
  if (day < circle.nextDueDay) return { ok: false, state, wallet, message: `The next weekly contribution is due on simulation day ${circle.nextDueDay}.` };
  if (circle.paidThisWeek) return { ok: false, state, wallet, message: 'This week’s contribution has already been recorded.' };
  if (wallet < circle.contributionAmount) return { ok: false, state, wallet, message: `Not enough banked funds. The contribution is ${formatMoney(circle.contributionAmount)}; your wallet is ${formatMoney(wallet)}.` };
  circle.paidThisWeek = true;
  state.stats.contributionsPaid += 1;
  state.stats.totalContributed += circle.contributionAmount;
  addHistory(state, { type: 'contribution-paid', day, amount: circle.contributionAmount, message: `Weekly Adashi contribution paid: ${formatMoney(circle.contributionAmount)}.`, cycle: circle.cycleNumber, week: circle.currentWeek });
  return {
    ok: true, state, wallet: wallet - circle.contributionAmount,
    message: `Contribution of ${formatMoney(circle.contributionAmount)} recorded. The existing wallet was debited once.`,
  };
}

export function settleAdashiWeek(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const circle = state.circle;
  const day = safeDay(options.day);
  const wallet = nonNegativeInt(options.wallet);
  if (!circle) return { ok: false, state, wallet, message: 'Create an Adashi circle first.' };
  if (day < circle.nextDueDay) return { ok: false, state, wallet, message: `This turn is not due until simulation day ${circle.nextDueDay}.` };
  const playerPaid = circle.paidThisWeek;
  const recipient = circle.roster.find(member => member.position === circle.currentWeek) || { name: 'Circle member', isPlayer: false };
  const pot = circle.contributionAmount * (circle.memberCount - (playerPaid ? 0 : 1));
  let nextWallet = wallet;
  let playerPayout = 0;
  let message;
  if (!playerPaid) {
    state.stats.contributionsMissed += 1;
    state.reputation = clamp(state.reputation - 8, 0, 100);
    message = recipient.isPlayer
      ? `The player’s payout turn was missed because the contribution was not paid. ${formatMoney(pot)} remains a simulated group pot; no cash was credited.`
      : `Contribution missed. The ${recipient.name} turn closes with an illustrative partial pot of ${formatMoney(pot)}; no money was deducted from the wallet.`;
  } else if (recipient.isPlayer && circle.payoutEligible) {
    playerPayout = circle.contributionAmount * circle.memberCount;
    nextWallet += playerPayout;
    state.stats.payoutsReceived += 1;
    state.stats.totalPayouts += playerPayout;
    state.reputation = clamp(state.reputation + 3, 0, 100);
    message = `Your Adashi turn paid ${formatMoney(playerPayout)} into the existing wallet after your ${formatMoney(circle.contributionAmount)} contribution. This is a rotation payout, not new external money.`;
  } else if (recipient.isPlayer && !circle.payoutEligible) {
    message = `Your payout is withheld after an earlier missed contribution. Make two consecutive on-time contributions to restore eligibility for a future turn.`;
  } else {
    state.reputation = clamp(state.reputation + 1, 0, 100);
    message = `${recipient.name} receives the simulated circle payout of ${formatMoney(pot)}. Your ${formatMoney(circle.contributionAmount)} contribution was already debited.`;
  }
  if (playerPaid) {
    circle.consecutivePayments += 1;
    if (circle.consecutivePayments >= 2) circle.payoutEligible = true;
  } else {
    circle.consecutivePayments = 0;
    circle.payoutEligible = false;
  }
  circle.ledger.push({
    cycle: circle.cycleNumber, week: circle.currentWeek, recipient: recipient.name,
    playerPaid, contribution: playerPaid ? circle.contributionAmount : 0,
    pot, playerPayout, day, missed: !playerPaid,
  });
  circle.ledger = circle.ledger.slice(-ADASHI_SUPPORT_MAX_HISTORY);
  state.stats.turnsSettled += 1;
  const settledCycle = circle.cycleNumber;
  const settledWeek = circle.currentWeek;
  if (circle.currentWeek >= circle.memberCount) {
    circle.cycleNumber += 1;
    circle.currentWeek = 1;
  } else {
    circle.currentWeek += 1;
  }
  circle.paidThisWeek = false;
  circle.lastSettledDay = day;
  circle.nextDueDay = day + ADASHI_SUPPORT_WEEK_DAYS;
  addHistory(state, { type: 'turn-settled', day, amount: playerPayout, message, cycle: settledCycle, week: settledWeek });
  return { ok: true, state, wallet: nextWallet, payout: playerPayout, recipient: recipient.name, missed: !playerPaid, message };
}

export function offerNeighbourSupport(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const day = safeDay(options.day);
  const contact = state.contacts.find(item => item.id === options.contactId);
  if (!contact) return { ok: false, state, message: 'Choose a valid neighbourhood contact.' };
  if (options.activeShift) return { ok: false, state, message: 'Finish the driving shift before recording a community interaction.' };
  if (state.lastSocialActionDay === day) return { ok: false, state, message: 'One social support action is available per simulation day.' };
  const action = findOption(ADASHI_SUPPORT_OFFER_TYPES, options.offerType);
  if (!action) return { ok: false, state, message: 'Choose a valid practical support action.' };
  contact.trust = clamp(contact.trust + action.trustGain, 0, 100);
  contact.lastSupportDay = day;
  contact.helpOffered += 1;
  state.lastSocialActionDay = day;
  state.stats.supportOffered += 1;
  state.reputation = clamp(state.reputation + 1, 0, 100);
  const message = `You offered ${action.label.toLowerCase()} to ${contact.name}. Trust increased; no money or vehicle state changed.`;
  addHistory(state, { type: 'support-offered', day, trustDelta: action.trustGain, contactId: contact.id, message });
  return { ok: true, state, contact, message };
}

export function requestNeighbourSupport(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const day = safeDay(options.day);
  const contact = state.contacts.find(item => item.id === options.contactId);
  if (!contact) return { ok: false, state, message: 'Choose a valid neighbourhood contact.' };
  if (options.activeShift) return { ok: false, state, message: 'Finish the driving shift before recording a community interaction.' };
  if (state.lastSocialActionDay === day) return { ok: false, state, message: 'One social support action is available per simulation day.' };
  const request = findOption(ADASHI_SUPPORT_REQUEST_TYPES, options.requestType);
  if (!request) return { ok: false, state, message: 'Choose a valid support request.' };
  if (contact.lastHelpRequestDay != null && day - contact.lastHelpRequestDay < 3) {
    return { ok: false, state, message: `${contact.name} was asked recently. Give this contact three simulation days before requesting again.` };
  }
  const readiness = contact.trust * 0.7 + state.reputation * 0.3;
  const received = readiness >= 60;
  contact.lastHelpRequestDay = day;
  contact.helpRequests += 1;
  state.lastSocialActionDay = day;
  state.stats.supportRequested += 1;
  let message;
  if (received) {
    contact.helpReceived += 1;
    contact.trust = clamp(contact.trust + 2, 0, 100);
    state.stats.supportReceived += 1;
    message = `${contact.name} responds to “${request.label.toLowerCase()}”. The support is narrative guidance only; no cash, item, passenger, or vehicle state was granted.`;
  } else {
    message = `${contact.name} is not available for this request today. Trust is unchanged; try another contact or build the relationship first.`;
  }
  addHistory(state, { type: 'support-requested', day, contactId: contact.id, trustDelta: received ? 2 : 0, message });
  return { ok: true, state, contact, received, message };
}

export function exportAdashiSupportReport(stateInput, options = {}) {
  const state = normalizeAdashiSupportState(stateInput);
  const circle = state.circle;
  return {
    reportType: 'kano-life-adashi-neighbourhood-support',
    schemaVersion: ADASHI_SUPPORT_SCHEMA_VERSION,
    exportedAt: new Date(options.now ?? Date.now()).toISOString(),
    simulationDay: safeDay(options.day),
    disclosure: 'Fictional game simulation. Contributions and payout amounts use game currency. This file is not a financial statement, real savings account, or financial advice.',
    completedCircles: state.completedCircles.map(item => ({ ...item, ledger: item.ledger.slice(-15) })),
    circle: circle ? {
      name: circle.name,
      contributionAmount: circle.contributionAmount,
      memberCount: circle.memberCount,
      playerPosition: circle.playerPosition,
      cycleNumber: circle.cycleNumber,
      currentWeek: circle.currentWeek,
      nextDueDay: circle.nextDueDay,
      ledger: circle.ledger.slice(-30),
    } : null,
    contacts: state.contacts.map(({ id, name, role, trust, helpOffered, helpReceived, helpRequests }) => ({ id, name, role, trust, helpOffered, helpReceived, helpRequests })),
    stats: { ...state.stats, reputation: state.reputation },
    recentHistory: state.history.slice(-30),
    privacy: 'Contains only fictional game contact names, game activity and game-currency amounts; no real address, telephone number, or bank details are collected by this module.',
  };
}

function addHistory(state, event) {
  const id = `ads-${safeDay(event.day)}-${state.history.length + 1}-${event.type}`;
  state.history.push(normaliseEvent({ id, ...event }));
  state.history = state.history.filter(Boolean).slice(-ADASHI_SUPPORT_MAX_HISTORY);
}

function formatMoney(amount) {
  return `₦${nonNegativeInt(amount).toLocaleString('en-NG')}`;
}
