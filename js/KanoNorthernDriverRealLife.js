/**
 * Kano Life — persistent social relationships and everyday choices.
 * All amounts are game-balance values, not current Nigerian market-price claims.
 * Faith routine prompts are opt-in and can be changed or disabled by the player.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
const money = (v) => Math.max(0, Math.round(Number.isFinite(Number(v)) ? Number(v) : 0));
const dayNumber = (v) => clamp(Math.floor(Number(v) || 1), 1, 999999);
const minuteOfDay = (v) => ((Math.floor(Number(v) || 0) % 1440) + 1440) % 1440;
const clone = (v) => JSON.parse(JSON.stringify(v));
const ROUTINE_STYLES = new Set(['islamic_prayer', 'personal_breaks', 'none']);
const METER_DEFAULTS = Object.freeze({ familyTrust: 58, parkStanding: 52, passengerRespect: 50, communityTrust: 48, vehicleCare: 60, wellbeing: 55 });
const TOTAL_DEFAULTS = Object.freeze({ eventsResolved: 0, parkContributions: 0, familySupport: 0, fareNegotiations: 0, charitableGiving: 0, routinesRecorded: 0, prayerBreaks: 0, personalBreaks: 0, maintenanceChecks: 0 });

const PRAYER_WINDOWS = Object.freeze([
  { id: 'fajr', label: 'Fajr', start: 300, end: 390, display: '05:00–06:30' },
  { id: 'dhuhr', label: 'Dhuhr', start: 735, end: 825, display: '12:15–13:45' },
  { id: 'asr', label: 'Asr', start: 930, end: 1020, display: '15:30–17:00' },
  { id: 'maghrib', label: 'Maghrib', start: 1095, end: 1155, display: '18:15–19:15' },
  { id: 'isha', label: 'Isha', start: 1185, end: 1275, display: '19:45–21:15' },
]);
const PERSONAL_WINDOWS = Object.freeze([
  { id: 'midday', label: 'Midday pause', start: 690, end: 780, display: '11:30–13:00' },
  { id: 'afternoon', label: 'Afternoon reset', start: 930, end: 1020, display: '15:30–17:00' },
  { id: 'evening', label: 'Evening pause', start: 1110, end: 1200, display: '18:30–20:00' },
]);

const EVENT_DECK = Object.freeze([
  {
    id: 'family_request', title: 'A request from home', kicker: 'FAMILY & RESPONSIBILITY',
    body: 'Someone at home needs help with a small household expense. You have to balance care for your family against keeping enough cash for fuel and your own obligations.',
    choices: [
      { id: 'family_120', label: 'Send ₦120', walletDelta: -120, effects: { familyTrust: 8, communityTrust: 1 }, totals: { familySupport: 120 }, message: 'You sent support home. The family appreciates the effort.' },
      { id: 'family_40', label: 'Send what you can · ₦40', walletDelta: -40, effects: { familyTrust: 4 }, totals: { familySupport: 40 }, message: 'A smaller contribution still helps.' },
      { id: 'family_explain', label: 'Explain and agree to revisit it', walletDelta: 0, effects: { familyTrust: -1 }, message: 'You explain the pressure on your cash. The request can be revisited.' },
    ],
  },
  {
    id: 'park_contribution', title: 'At the keke park', kicker: 'PARK ASSOCIATION',
    body: 'A park representative reminds drivers about a shared cleaning and queue contribution. Paying keeps you in good standing, but you also need to protect today’s working cash.',
    choices: [
      { id: 'park_60', label: 'Pay the contribution · ₦60', walletDelta: -60, effects: { parkStanding: 8, communityTrust: 1 }, totals: { parkContributions: 60 }, message: 'You contribute to the park and keep a good standing.' },
      { id: 'park_25', label: 'Offer a smaller amount · ₦25', walletDelta: -25, effects: { parkStanding: 3 }, totals: { parkContributions: 25 }, message: 'The smaller contribution is accepted for this encounter.' },
      { id: 'park_defer', label: 'Explain and defer', walletDelta: 0, effects: { parkStanding: -3 }, message: 'You keep your cash for now; your standing slips slightly.' },
    ],
  },
  {
    id: 'passenger_fare', title: 'A passenger negotiates the fare', kicker: 'FARE NEGOTIATION',
    body: 'A passenger wants to travel across town but offers less than you expected. A reasonable agreement protects your income and the reputation that brings repeat customers.',
    choices: [
      { id: 'fare_fair', label: 'Agree on a fair fare · +₦115', walletDelta: 115, effects: { passengerRespect: 6, communityTrust: 1 }, totals: { fareNegotiations: 1 }, message: 'You agree on a fair fare. The passenger leaves satisfied.' },
      { id: 'fare_quick', label: 'Take a quick lower fare · +₦75', walletDelta: 75, effects: { passengerRespect: 3 }, totals: { fareNegotiations: 1 }, message: 'The trip is worth less, but both sides accept the agreement.' },
      { id: 'fare_decline', label: 'Politely decline', walletDelta: 0, effects: { passengerRespect: -1 }, message: 'You decline politely and keep looking for a suitable passenger.' },
    ],
  },
  {
    id: 'mechanic_warning', title: 'A mechanic spots a warning sign', kicker: 'VEHICLE CARE',
    body: 'A familiar mechanic notices a small issue during a quick inspection. Dealing with it now costs money, but postponing every small problem can become expensive later.',
    choices: [
      { id: 'mechanic_check', label: 'Pay for an inspection · ₦45', walletDelta: -45, effects: { vehicleCare: 5 }, totals: { maintenanceChecks: 1 }, message: 'You pay for an inspection and get clearer advice before the next shift.' },
      { id: 'mechanic_service', label: 'Do the basic service · ₦100', walletDelta: -100, effects: { vehicleCare: 12 }, totals: { maintenanceChecks: 1 }, message: 'You deal with the warning early and improve your maintenance readiness.' },
      { id: 'mechanic_wait', label: 'Wait until cash improves', walletDelta: 0, effects: { vehicleCare: -5 }, message: 'You postpone the work. Keep the issue in mind before longer trips.' },
    ],
  },
  {
    id: 'community_request', title: 'A neighbour asks for a hand', kicker: 'COMMUNITY & REPUTATION',
    body: 'Someone nearby needs a small favour while you are preparing for the day. You cannot solve every problem, but small choices shape how people remember you.',
    choices: [
      { id: 'community_help', label: 'Contribute ₦40', walletDelta: -40, effects: { communityTrust: 8, familyTrust: 1 }, totals: { charitableGiving: 40 }, message: 'You help with a small contribution. Your neighbour remembers it.' },
      { id: 'community_advice', label: 'Offer practical help instead', walletDelta: 0, effects: { communityTrust: 4 }, message: 'You help with advice and time instead of money.' },
      { id: 'community_pass', label: 'Say you cannot today', walletDelta: 0, effects: { communityTrust: -1 }, message: 'You explain that you cannot help today.' },
    ],
  },
  {
    id: 'evening_balance', title: 'Work another hour or go home?', kicker: 'WORK & HOME LIFE',
    body: 'The day is getting late. Another trip may bring more income, but people at home also expect your time and you need enough rest for tomorrow.',
    choices: [
      { id: 'evening_home', label: 'Head home and check in', walletDelta: 0, effects: { familyTrust: 5, wellbeing: 5 }, message: 'You make time for home and give yourself room to recover.' },
      { id: 'evening_support', label: 'Send a household contribution · ₦80', walletDelta: -80, effects: { familyTrust: 8 }, totals: { familySupport: 80 }, message: 'You send a contribution and let home know you are thinking of them.' },
      { id: 'evening_work', label: 'Take one more opportunity', walletDelta: 55, effects: { passengerRespect: 1, familyTrust: -2, wellbeing: -3 }, totals: { fareNegotiations: 1 }, message: 'You earn a little more, but give up some time to rest and connect with family.' },
    ],
  },
  {
    id: 'rain_preparation', title: 'Clouds gather over the city', kicker: 'PREPARATION & SAFETY',
    body: 'A roadside seller is offering a low-cost cover and a mechanic advises checking the tyres before the weather changes. You can prepare now or save the cash.',
    choices: [
      { id: 'rain_prepare', label: 'Prepare the keke · ₦55', walletDelta: -55, effects: { vehicleCare: 7, wellbeing: 1 }, message: 'You make a small preparation before the weather turns.' },
      { id: 'rain_check', label: 'Check the tyres yourself', walletDelta: 0, effects: { vehicleCare: 3 }, message: 'You take a moment to check the tyres and avoid an unnecessary purchase.' },
      { id: 'rain_skip', label: 'Keep the cash for now', walletDelta: 0, effects: { vehicleCare: -2 }, message: 'You keep your cash. Remember to drive carefully if conditions change.' },
    ],
  },
]);

function freshState() {
  return {
    version: 1,
    routineStyle: 'islamic_prayer',
    meters: { ...METER_DEFAULTS },
    totals: { ...TOTAL_DEFAULTS },
    lastEventDay: null,
    pendingEvent: null,
    resolvedEventDays: [],
    routineLog: {},
    ledger: [],
  };
}

function normalizeState(input = {}) {
  const fresh = freshState();
  const state = { ...fresh, ...input };
  state.version = 1;
  state.routineStyle = ROUTINE_STYLES.has(input.routineStyle) ? input.routineStyle : fresh.routineStyle;
  state.meters = { ...METER_DEFAULTS, ...(input.meters || {}) };
  for (const key of Object.keys(METER_DEFAULTS)) state.meters[key] = clamp(state.meters[key], 0, 100);
  state.totals = { ...TOTAL_DEFAULTS, ...(input.totals || {}) };
  for (const key of Object.keys(TOTAL_DEFAULTS)) state.totals[key] = money(state.totals[key]);
  state.lastEventDay = Number.isFinite(Number(input.lastEventDay)) ? dayNumber(input.lastEventDay) : null;
  state.pendingEvent = input.pendingEvent && typeof input.pendingEvent === 'object' ? { ...input.pendingEvent } : null;
  state.resolvedEventDays = Array.isArray(input.resolvedEventDays) ? [...new Set(input.resolvedEventDays.map(dayNumber))].slice(-120) : [];
  state.routineLog = input.routineLog && typeof input.routineLog === 'object' ? { ...input.routineLog } : {};
  state.ledger = Array.isArray(input.ledger) ? input.ledger.filter(row => row && typeof row === 'object').slice(-100).map(row => ({ ...row })) : [];
  return state;
}

function normalizeProfile(profile = {}) {
  return {
    householdRole: ['independent', 'contribute', 'provider'].includes(profile.householdRole) ? profile.householdRole : 'contribute',
    ownership: ['owned', 'daily_hire', 'hire_purchase'].includes(profile.ownership) ? profile.ownership : 'daily_hire',
  };
}

function buildEvent(dayInput, minutes, profile = {}) {
  const day = dayNumber(dayInput);
  const profileSafe = normalizeProfile(profile);
  const index = (day - 1) % EVENT_DECK.length;
  let template = EVENT_DECK[index];
  // A private household context changes only the framing, not the player's identity.
  if (template.id === 'family_request' && profileSafe.householdRole === 'independent') {
    template = {
      ...template,
      body: 'A close relative or friend asks for help with a small expense. You are mostly self-supporting, so you need to balance generosity against your own working cash.',
    };
  }
  if (template.id === 'park_contribution' && profileSafe.ownership === 'owned') {
    template = {
      ...template,
      body: 'A park representative reminds drivers about a shared cleaning and queue contribution. Even with your own keke, you need to balance community participation against working cash.',
    };
  }
  const minute = minuteOfDay(minutes);
  const phase = minute < 660 ? 'morning' : minute < 960 ? 'afternoon' : 'evening';
  return {
    id: `day-${day}-${template.id}`,
    day,
    phase,
    type: template.id,
    title: template.title,
    kicker: template.kicker,
    body: template.body,
    choices: template.choices.map(choice => ({ id: choice.id, label: choice.label })),
  };
}

export class KanoNorthernDriverRealLife {
  constructor({ storage = null, storageKey = 'kano-life-northern-social-life-v1', now = () => Date.now() } = {}) {
    if (storage === null) {
      try { storage = globalThis.localStorage ?? null; } catch { storage = null; }
    }
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.state = freshState();
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || typeof parsed !== 'object') return false;
      this.state = normalizeState(parsed);
      return true;
    } catch {
      this.state = freshState();
      return false;
    }
  }

  save() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.state)); return Boolean(this.storage); }
    catch { return false; }
  }

  setRoutineStyle(style) {
    if (!ROUTINE_STYLES.has(style)) return { ok: false, reason: 'invalid_routine_style' };
    this.state.routineStyle = style;
    this._record('routine_preference', 0, { style });
    this.save();
    return { ok: true, routineStyle: style };
  }

  getDailyEvent(dayInput = 1, minutes = 408, profile = {}) {
    const day = dayNumber(dayInput);
    if (this.state.resolvedEventDays.includes(day)) return null;
    if (this.state.pendingEvent && this.state.pendingEvent.day === day) return clone(this.state.pendingEvent);
    if (this.state.pendingEvent && this.state.pendingEvent.day < day) this.state.pendingEvent = null;
    const event = buildEvent(day, minutes, profile);
    this.state.pendingEvent = event;
    this.state.lastEventDay = day;
    this.save();
    return clone(event);
  }

  resolveDailyEvent({ day: dayInput = 1, choiceId, wallet = 0 } = {}) {
    const day = dayNumber(dayInput);
    const available = money(wallet);
    const event = this.state.pendingEvent;
    if (!event || event.day !== day) return { ok: false, reason: 'no_event_for_day', wallet: available };
    if (this.state.resolvedEventDays.includes(day)) return { ok: false, reason: 'already_resolved', wallet: available };
    const template = EVENT_DECK.find(item => item.id === event.type);
    const choice = template?.choices.find(item => item.id === choiceId);
    if (!choice) return { ok: false, reason: 'invalid_choice', wallet: available };
    const delta = Number(choice.walletDelta) || 0;
    if (delta < 0 && available < Math.abs(delta)) {
      return { ok: false, reason: 'insufficient_wallet', required: Math.abs(delta), wallet: available };
    }
    const newWallet = money(available + delta);
    for (const [key, change] of Object.entries(choice.effects || {})) {
      if (Object.hasOwn(METER_DEFAULTS, key)) this.state.meters[key] = clamp(this.state.meters[key] + Number(change || 0), 0, 100);
    }
    for (const [key, change] of Object.entries(choice.totals || {})) {
      if (Object.hasOwn(TOTAL_DEFAULTS, key)) this.state.totals[key] = money(this.state.totals[key] + Number(change || 0));
    }
    this.state.totals.eventsResolved += 1;
    this.state.resolvedEventDays.push(day);
    this.state.resolvedEventDays = [...new Set(this.state.resolvedEventDays)].slice(-120);
    this.state.pendingEvent = null;
    const resolved = { day, eventId: event.id, type: event.type, choiceId, walletDelta: delta, message: String(choice.message || ''), at: new Date(this.now()).toISOString() };
    this._record('daily_choice', delta, resolved);
    this.save();
    return { ok: true, wallet: newWallet, walletDelta: delta, event: clone(event), choiceId, message: resolved.message, snapshot: this.getSnapshot() };
  }

  getRoutineStatus(day = 1, minutes = 408) {
    const normalizedDay = dayNumber(day);
    const minute = minuteOfDay(minutes);
    const windows = this.state.routineStyle === 'islamic_prayer'
      ? PRAYER_WINDOWS
      : this.state.routineStyle === 'personal_breaks' ? PERSONAL_WINDOWS : [];
    if (!windows.length) return { style: this.state.routineStyle, available: false, current: null, next: null, recordedToday: 0, totalToday: 0 };
    const todaysLog = this.state.routineLog[String(normalizedDay)] || {};
    const current = windows.find(w => minute >= w.start && minute < w.end && !todaysLog[w.id]) || null;
    const next = windows.find(w => minute < w.start && !todaysLog[w.id]) || null;
    const recordedToday = windows.filter(w => todaysLog[w.id]).length;
    return {
      style: this.state.routineStyle,
      available: Boolean(current),
      current: current ? { ...current } : null,
      next: next ? { ...next } : null,
      recordedToday,
      totalToday: windows.length,
      alreadyRecorded: windows.some(w => minute >= w.start && minute < w.end && todaysLog[w.id]),
    };
  }

  recordRoutine({ day: dayInput = 1, minutes = 408 } = {}) {
    const day = dayNumber(dayInput);
    const minute = minuteOfDay(minutes);
    const status = this.getRoutineStatus(day, minute);
    if (this.state.routineStyle === 'none') return { ok: false, reason: 'routine_prompts_disabled' };
    if (!status.current) return { ok: false, reason: status.alreadyRecorded ? 'already_recorded' : 'outside_window', status };
    const key = String(day);
    if (!this.state.routineLog[key]) this.state.routineLog[key] = {};
    this.state.routineLog[key][status.current.id] = true;
    this.state.meters.wellbeing = clamp(this.state.meters.wellbeing + (this.state.routineStyle === 'personal_breaks' ? 4 : 2), 0, 100);
    this.state.totals.routinesRecorded += 1;
    if (this.state.routineStyle === 'personal_breaks') this.state.totals.personalBreaks += 1;
    if (this.state.routineStyle === 'islamic_prayer') this.state.totals.prayerBreaks += 1;
    this._record('routine_recorded', 0, { day, routineStyle: this.state.routineStyle, slot: status.current.id, label: status.current.label, wellbeingGain: this.state.routineStyle === 'personal_breaks' ? 4 : 2 });
    // This records a roleplay choice; it deliberately does not force-jump the game's world clock.
    this.save();
    return { ok: true, slot: { ...status.current }, status: this.getRoutineStatus(day, minute), snapshot: this.getSnapshot() };
  }

  recordPassengerService({ name = '', matched = false, safeTrip = false, day = 1, fareEarned = 0 } = {}) {
    const didMatch = Boolean(matched);
    const didDriveSafely = Boolean(safeTrip);
    const trustDelta = didMatch && didDriveSafely ? 3 : didMatch ? -2 : didDriveSafely ? -2 : -5;
    this.state.meters.passengerRespect = clamp(this.state.meters.passengerRespect + trustDelta, 0, 100);
    const details = {
      name: String(name ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 60),
      day: dayNumber(day),
      matched: didMatch,
      safeTrip: didDriveSafely,
      trustDelta,
      passengerRespect: this.state.meters.passengerRespect,
      fareEarned: money(fareEarned),
    };
    this._record('passenger_service', 0, details);
    this.save();
    return { ok: true, ...details };
  }

  getSnapshot() {
    return {
      routineStyle: this.state.routineStyle,
      meters: { ...this.state.meters },
      totals: { ...this.state.totals },
      pendingEvent: this.state.pendingEvent ? clone(this.state.pendingEvent) : null,
      eventsResolvedToday: this.state.resolvedEventDays.includes(dayNumber(this.state.lastEventDay)),
      routineLog: clone(this.state.routineLog),
      ledger: this.state.ledger.slice(-6).reverse().map(row => ({ ...row, details: { ...(row.details || {}) } })),
    };
  }

  _record(type, amount, details = {}) {
    this.state.ledger.push({ id: `social-${Number(this.now()).toString(36)}-${Math.random().toString(36).slice(2, 7)}`, type, amount: Math.round(Number(amount) || 0), details: clone(details), at: new Date(this.now()).toISOString() });
    if (this.state.ledger.length > 100) this.state.ledger.splice(0, this.state.ledger.length - 100);
  }
}

export { ROUTINE_STYLES, PRAYER_WINDOWS, PERSONAL_WINDOWS, EVENT_DECK };
export default KanoNorthernDriverRealLife;
