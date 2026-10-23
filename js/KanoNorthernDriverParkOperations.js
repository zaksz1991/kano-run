/**
 * Kano Life — persistent keke-park routines and dispatch records.
 * This roleplay system records stand choices and real pickup/drop outcomes.
 * The daily token is optional, explicitly paid, and uses the existing banked wallet.
 */

export const KANO_PARK_STANDS = Object.freeze([
  { id: 'sabon-gari', label: 'Sabon Gari', routeName: 'Sabon Gari', note: 'Market-side loading and short connections.' },
  { id: 'farm-centre', label: 'Farm Centre', routeName: 'Farm Centre', note: 'Shopping and evening activity.' },
  { id: 'hotoro', label: 'Hotoro', routeName: 'Hotoro', note: 'Residential and cross-town journeys.' },
  { id: 'kofar-ruwa', label: 'Kofar Ruwa', routeName: 'Kofar Ruwa', note: 'Busy junction and market traffic.' },
  { id: 'buk-gate', label: 'BUK Gate', routeName: 'BUK Gate', note: 'Student and campus-area journeys.' },
  { id: 'kofar-wambai', label: 'Kofar Wambai', routeName: 'Kofar Wambai', note: 'Old-city market connections.' },
  { id: 'kofar-mata', label: 'Kofar Mata', routeName: 'Kofar Mata', note: 'Old-city trips and short errands.' },
  { id: 'yankaba-market', label: 'Yankaba Market', routeName: 'Yankaba Market', note: 'Market-day and produce traffic.' },
]);

export const KANO_PARK_WORK_STYLES = Object.freeze([
  { id: 'official_queue', label: 'Join an organised park queue', description: 'Queue position and an optional daily token are tracked.' },
  { id: 'roadside_loading', label: 'Load from the roadside', description: 'No park token is required; orderly, safe loading still affects standing.' },
  { id: 'independent_roaming', label: 'Roam independently', description: 'Work across the city without entering an organised queue.' },
]);

export const KANO_PARK_DAILY_TOKEN = 40; // Tuned gameplay value, not a claim about real park tariffs.

const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : min));
const count = v => Math.max(0, Math.floor(Number.isFinite(Number(v)) ? Number(v) : 0));
const money = v => Math.max(0, Math.round(Number.isFinite(Number(v)) ? Number(v) : 0));
const safeDay = v => clamp(Math.floor(Number(v) || 1), 1, 999999);
const safeMinute = v => ((Math.floor(Number(v) || 0) % 1440) + 1440) % 1440;
const safeText = (v, max = 80) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const clone = v => JSON.parse(JSON.stringify(v));
const STAND_IDS = new Set(KANO_PARK_STANDS.map(x => x.id));
const STYLE_IDS = new Set(KANO_PARK_WORK_STYLES.map(x => x.id));

const TOTAL_DEFAULTS = Object.freeze({
  workdaysStarted: 0, shiftsStarted: 0, standEntries: 0, parkTokensPaid: 0,
  parkContributions: 0, boardings: 0, completedTrips: 0, safeTrips: 0,
  matchedTrips: 0, repeatCustomerTrips: 0, grossFares: 0, distanceKm: 0,
});

function normalizePlan(input = {}) {
  return {
    standId: STAND_IDS.has(input.standId) ? input.standId : 'sabon-gari',
    workStyle: STYLE_IDS.has(input.workStyle) ? input.workStyle : 'official_queue',
  };
}

function freshDay(day, plan) {
  return {
    day: safeDay(day),
    standId: plan.standId,
    workStyle: plan.workStyle,
    onDuty: false,
    enteredMinute: null,
    queuePosition: null,
    tokenPaid: false,
    tokenAmount: 0,
    shiftsStarted: 0,
    runIds: [],
    boardings: 0,
    completedTrips: 0,
    safeTrips: 0,
    matchedTrips: 0,
    roughTrips: 0,
    repeatCustomerTrips: 0,
    grossFares: 0,
    distanceKm: 0,
    dispatched: false,
    lastPassenger: '',
    lastDestination: '',
    lastTripMessage: '',
  };
}

function normalizeDay(input, fallbackDay, defaultPlan) {
  const day = safeDay(input?.day ?? fallbackDay);
  const plan = normalizePlan({ standId: input?.standId, workStyle: input?.workStyle });
  const d = freshDay(day, plan);
  d.onDuty = Boolean(input?.onDuty);
  d.enteredMinute = input?.enteredMinute == null ? null : safeMinute(input.enteredMinute);
  d.queuePosition = input?.queuePosition == null ? null : clamp(Math.floor(Number(input.queuePosition) || 1), 1, 8);
  d.tokenPaid = Boolean(input?.tokenPaid);
  d.tokenAmount = d.tokenPaid ? money(input?.tokenAmount || KANO_PARK_DAILY_TOKEN) : 0;
  for (const k of ['shiftsStarted','boardings','completedTrips','safeTrips','matchedTrips','roughTrips','repeatCustomerTrips']) d[k] = count(input?.[k]);
  d.runIds = Array.isArray(input?.runIds) ? [...new Set(input.runIds.map(v => safeText(v, 120)).filter(Boolean))].slice(-20) : [];
  d.grossFares = money(input?.grossFares);
  d.distanceKm = Math.max(0, Math.round((Number(input?.distanceKm) || 0) * 1000) / 1000);
  d.dispatched = Boolean(input?.dispatched);
  d.lastPassenger = safeText(input?.lastPassenger, 60);
  d.lastDestination = safeText(input?.lastDestination, 80);
  d.lastTripMessage = safeText(input?.lastTripMessage, 180);
  // If an older stored day was created before on-duty tracking, retain only safe fields.
  if (!d.onDuty) d.queuePosition = null;
  return d;
}

function freshState() {
  return {
    version: 1,
    plan: { standId: 'sabon-gari', workStyle: 'official_queue' },
    standing: 50,
    totals: { ...TOTAL_DEFAULTS },
    days: {},
    processedTripIds: [],
    processedRunIds: [],
    ledger: [],
  };
}

function normalizeState(input = {}) {
  const state = freshState();
  state.plan = normalizePlan(input.plan || {});
  state.standing = clamp(Math.round(Number(input.standing) || 50), 0, 100);
  state.totals = { ...TOTAL_DEFAULTS, ...(input.totals || {}) };
  for (const k of Object.keys(TOTAL_DEFAULTS)) {
    state.totals[k] = k === 'distanceKm'
      ? Math.max(0, Math.round((Number(state.totals[k]) || 0) * 1000) / 1000)
      : money(state.totals[k]);
  }
  if (input.days && typeof input.days === 'object' && !Array.isArray(input.days)) {
    const entries = Object.entries(input.days).slice(-60);
    for (const [key, value] of entries) {
      const day = safeDay(key);
      state.days[String(day)] = normalizeDay(value, day, state.plan);
    }
  }
  state.processedTripIds = Array.isArray(input.processedTripIds)
    ? [...new Set(input.processedTripIds.map(v => safeText(v, 120)).filter(Boolean))].slice(-200)
    : [];
  state.processedRunIds = Array.isArray(input.processedRunIds)
    ? [...new Set(input.processedRunIds.map(v => safeText(v, 120)).filter(Boolean))].slice(-100)
    : [];
  state.ledger = Array.isArray(input.ledger)
    ? input.ledger.filter(x => x && typeof x === 'object').slice(-100).map(x => ({ ...x, details: x.details && typeof x.details === 'object' ? { ...x.details } : {} }))
    : [];
  return state;
}

export class KanoNorthernDriverParkOperations {
  constructor({ storage = globalThis.localStorage ?? null, storageKey = 'kano-life-park-operations-v1', now = () => Date.now() } = {}) {
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

  setWorkPlan({ standId = this.state.plan.standId, workStyle = this.state.plan.workStyle } = {}) {
    if (!STAND_IDS.has(standId)) return { ok: false, reason: 'invalid_stand' };
    if (!STYLE_IDS.has(workStyle)) return { ok: false, reason: 'invalid_work_style' };
    this.state.plan = { standId, workStyle };
    this._record('work_plan_saved', 0, { ...this.state.plan, stand: this._stand(standId).label, workStyleLabel: this._style(workStyle).label });
    this.save();
    return { ok: true, plan: { ...this.state.plan }, snapshot: this.getSnapshot() };
  }

  startWorkday({ day = 1, minute = 408 } = {}) {
    const d = this._ensureDay(day);
    if (d.onDuty) return { ok: false, reason: 'already_on_duty', day: clone(d) };
    d.standId = this.state.plan.standId;
    d.workStyle = this.state.plan.workStyle;
    d.onDuty = true;
    d.enteredMinute = safeMinute(minute);
    d.queuePosition = d.workStyle === 'official_queue' ? this._queuePosition(d.day, d.enteredMinute, d.standId) : null;
    this.state.totals.workdaysStarted += 1;
    if (d.workStyle === 'official_queue') this.state.totals.standEntries += 1;
    this._record('workday_started', 0, {
      day: d.day, standId: d.standId, stand: this._stand(d.standId).label,
      workStyle: d.workStyle, queuePosition: d.queuePosition, minute: d.enteredMinute,
    });
    this.save();
    return { ok: true, day: clone(d), snapshot: this.getSnapshot(d.day) };
  }

  startShift({ day = 1, minute = 408, runId = '', routeName = '', mode = 'career' } = {}) {
    if (!['career', 'freeRoam'].includes(mode)) return { ok: false, reason: 'mode_not_simulated' };
    const id = safeText(runId, 120);
    if (id && this.state.processedRunIds.includes(id)) return { ok: false, reason: 'shift_already_recorded' };
    const d = this._ensureDay(day);
    if (!d.onDuty) {
      d.standId = this.state.plan.standId;
      d.workStyle = this.state.plan.workStyle;
      d.onDuty = true;
      d.enteredMinute = safeMinute(minute);
      d.queuePosition = d.workStyle === 'official_queue' ? this._queuePosition(d.day, d.enteredMinute, d.standId) : null;
      this.state.totals.workdaysStarted += 1;
      if (d.workStyle === 'official_queue') this.state.totals.standEntries += 1;
      this._record('workday_started', 0, {
        day: d.day, standId: d.standId, stand: this._stand(d.standId).label,
        workStyle: d.workStyle, queuePosition: d.queuePosition, minute: d.enteredMinute, autoStarted: true,
      });
    }
    d.shiftsStarted += 1;
    if (id) {
      d.runIds.push(id);
      d.runIds = [...new Set(d.runIds)].slice(-20);
      this.state.processedRunIds.push(id);
      this.state.processedRunIds = [...new Set(this.state.processedRunIds)].slice(-100);
    }
    this.state.totals.shiftsStarted += 1;
    this._record('driving_shift_started', 0, { day: d.day, standId: d.standId, workStyle: d.workStyle, routeName: safeText(routeName, 80), mode, runId: id });
    this.save();
    return { ok: true, day: clone(d), snapshot: this.getSnapshot(d.day) };
  }

  payDailyToken({ day = 1, wallet = 0 } = {}) {
    const d = this._ensureDay(day);
    const available = money(wallet);
    if (!d.onDuty) return { ok: false, reason: 'not_on_duty', wallet: available };
    if (d.workStyle !== 'official_queue') return { ok: false, reason: 'token_not_required', wallet: available };
    if (d.tokenPaid) return { ok: false, reason: 'already_paid', wallet: available };
    if (available < KANO_PARK_DAILY_TOKEN) return { ok: false, reason: 'insufficient_wallet', required: KANO_PARK_DAILY_TOKEN, wallet: available };
    d.tokenPaid = true;
    d.tokenAmount = KANO_PARK_DAILY_TOKEN;
    this.state.totals.parkTokensPaid += 1;
    this.state.totals.parkContributions += KANO_PARK_DAILY_TOKEN;
    this.state.standing = clamp(this.state.standing + 3, 0, 100);
    this._record('park_token_paid', -KANO_PARK_DAILY_TOKEN, { day: d.day, standId: d.standId, stand: this._stand(d.standId).label, amount: KANO_PARK_DAILY_TOKEN, standing: this.state.standing });
    this.save();
    return { ok: true, wallet: available - KANO_PARK_DAILY_TOKEN, amount: KANO_PARK_DAILY_TOKEN, standing: this.state.standing, snapshot: this.getSnapshot(d.day) };
  }

  recordBoarding({ day = 1, name = '', returning = false } = {}) {
    const d = this._ensureDay(day);
    d.boardings += 1;
    d.lastPassenger = safeText(name, 60);
    this.state.totals.boardings += 1;
    // Repeat-customer totals are counted only when a trip completes, not at boarding.
    let dispatchedNow = false;
    if (d.workStyle === 'official_queue' && d.onDuty && !d.dispatched) {
      d.dispatched = true;
      d.queuePosition = null;
      dispatchedNow = true;
    }
    this._record('passenger_boarded', 0, { day: d.day, name: d.lastPassenger, returning: Boolean(returning), standId: d.standId, workStyle: d.workStyle, dispatchedNow });
    this.save();
    return { ok: true, dispatchedNow, day: clone(d), snapshot: this.getSnapshot(d.day) };
  }

  recordTrip({ tripId, day = 1, matched = false, safeTrip = false, fareEarned = 0, distance = 0, destination = '', returning = false, name = '' } = {}) {
    const id = safeText(tripId, 120);
    if (!id) return { ok: false, reason: 'missing_trip_id' };
    if (this.state.processedTripIds.includes(id)) return { ok: false, reason: 'trip_already_recorded' };
    const d = this._ensureDay(day);
    const didMatch = Boolean(matched);
    const didDriveSafely = Boolean(safeTrip);
    const fare = money(fareEarned);
    const km = Math.max(0, Math.round((Number(distance) || 0) * 1000) / 1000);
    d.completedTrips += 1;
    if (didDriveSafely) { d.safeTrips += 1; this.state.totals.safeTrips += 1; }
    else d.roughTrips += 1;
    if (didMatch) { d.matchedTrips += 1; this.state.totals.matchedTrips += 1; }
    if (returning) { d.repeatCustomerTrips += 1; this.state.totals.repeatCustomerTrips += 1; }
    d.grossFares += fare;
    d.distanceKm = Math.round((d.distanceKm + km) * 1000) / 1000;
    d.lastPassenger = safeText(name || d.lastPassenger, 60);
    d.lastDestination = safeText(destination, 80);
    d.lastTripMessage = didMatch && didDriveSafely ? 'Correct stop · safe journey' : !didMatch && !didDriveSafely ? 'Wrong stop · rough journey' : didMatch ? 'Correct stop · rough journey' : 'Wrong stop · safe driving';

    this.state.totals.completedTrips += 1;
    this.state.totals.grossFares += fare;
    this.state.totals.distanceKm = Math.round((this.state.totals.distanceKm + km) * 1000) / 1000;
    // Park standing reflects the driver's service record, not a cash reward.
    const standingDelta = didMatch && didDriveSafely ? 2 : (!didMatch && !didDriveSafely ? -2 : -1);
    this.state.standing = clamp(this.state.standing + standingDelta, 0, 100);
    this.state.processedTripIds.push(id);
    this.state.processedTripIds = [...new Set(this.state.processedTripIds)].slice(-200);
    this._record('passenger_trip_completed', 0, {
      id, day: d.day, name: d.lastPassenger, destination: d.lastDestination,
      matched: didMatch, safeTrip: didDriveSafely, fareEarned: fare, distanceKm: km,
      standingDelta, standing: this.state.standing, returning: Boolean(returning),
    });
    this.save();
    return { ok: true, standingDelta, day: clone(d), snapshot: this.getSnapshot(d.day) };
  }

  getSnapshot(day = 1) {
    const d = this.state.days[String(safeDay(day))];
    const daily = d ? clone(d) : { ...freshDay(day, this.state.plan), standId: this.state.plan.standId, workStyle: this.state.plan.workStyle };
    return {
      plan: { ...this.state.plan },
      standing: this.state.standing,
      today: daily,
      totals: { ...this.state.totals },
      recentDays: Object.values(this.state.days).sort((a, b) => b.day - a.day).slice(0, 5).map(x => clone(x)),
      ledger: this.state.ledger.slice(-8).reverse().map(row => ({ ...row, details: { ...(row.details || {}) } })),
      dailyTokenCost: KANO_PARK_DAILY_TOKEN,
    };
  }

  exportReport(day = 1) { return JSON.stringify({ version: 1, ...this.getSnapshot(day) }, null, 2); }

  _ensureDay(day) {
    const key = String(safeDay(day));
    if (!this.state.days[key]) this.state.days[key] = freshDay(Number(key), this.state.plan);
    const record = this.state.days[key];
    if (!record.standId || !STAND_IDS.has(record.standId)) record.standId = this.state.plan.standId;
    if (!record.workStyle || !STYLE_IDS.has(record.workStyle)) record.workStyle = this.state.plan.workStyle;
    const entries = Object.entries(this.state.days).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [oldKey] of entries.slice(0, Math.max(0, entries.length - 60))) delete this.state.days[oldKey];
    return record;
  }

  _queuePosition(day, minute, standId) {
    const standIndex = KANO_PARK_STANDS.findIndex(x => x.id === standId);
    return 1 + ((safeDay(day) * 7 + safeMinute(minute) + Math.max(0, standIndex) * 3) % 6);
  }
  _stand(id) { return KANO_PARK_STANDS.find(x => x.id === id) || KANO_PARK_STANDS[0]; }
  _style(id) { return KANO_PARK_WORK_STYLES.find(x => x.id === id) || KANO_PARK_WORK_STYLES[0]; }
  _record(type, amount, details = {}) {
    const timestamp = Number(this.now()) || Date.now();
    this.state.ledger.push({ id: `park-${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, type, amount: Math.round(Number(amount) || 0), details: clone(details), at: new Date(timestamp).toISOString() });
    if (this.state.ledger.length > 100) this.state.ledger.splice(0, this.state.ledger.length - 100);
  }
}

export default KanoNorthernDriverParkOperations;
