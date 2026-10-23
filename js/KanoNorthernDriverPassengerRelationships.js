/**
 * Kano Life — persistent passenger relationships built from real in-game trips.
 * This module records reputation only; it never changes the game wallet or fare.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const count = (value) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));
const safeName = (value) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const keyFor = (name) => safeName(name).toLocaleLowerCase('en-US');
const safeDay = (value) => clamp(Math.floor(Number(value) || 1), 1, 999999);
const safeMinute = (value) => ((Math.floor(Number(value) || 0) % 1440) + 1440) % 1440;
const finiteMoney = (value) => Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0));
const clone = (value) => JSON.parse(JSON.stringify(value));

const TOTAL_DEFAULTS = Object.freeze({ boardings: 0, trips: 0, correctStops: 0, safeTrips: 0, roughTrips: 0, repeatTrips: 0 });

function freshState() {
  return {
    version: 1,
    reputation: 50,
    totals: { ...TOTAL_DEFAULTS },
    people: {},
    processedTripIds: [],
    lastTrip: null,
    ledger: [],
  };
}

function normalizePerson(input = {}, fallbackName = 'Passenger') {
  return {
    name: safeName(input.name) || fallbackName,
    trust: clamp(Math.round(Number.isFinite(Number(input.trust)) ? Number(input.trust) : 50), 0, 100),
    boardings: count(input.boardings),
    rides: count(input.rides),
    safeTrips: count(input.safeTrips),
    correctStops: count(input.correctStops),
    roughTrips: count(input.roughTrips),
    lastSeenDay: input.lastSeenDay == null ? null : safeDay(input.lastSeenDay),
    lastSeenMinute: input.lastSeenMinute == null ? null : safeMinute(input.lastSeenMinute),
  };
}

function normalizeState(input = {}) {
  const result = freshState();
  result.reputation = clamp(Math.round(Number.isFinite(Number(input.reputation)) ? Number(input.reputation) : 50), 0, 100);
  result.totals = { ...TOTAL_DEFAULTS, ...(input.totals || {}) };
  for (const key of Object.keys(TOTAL_DEFAULTS)) result.totals[key] = count(result.totals[key]);
  if (input.people && typeof input.people === 'object' && !Array.isArray(input.people)) {
    for (const [key, person] of Object.entries(input.people).slice(-80)) {
      const safeKey = keyFor(key);
      if (safeKey) result.people[safeKey] = normalizePerson(person, safeName(key));
    }
  }
  result.processedTripIds = Array.isArray(input.processedTripIds)
    ? [...new Set(input.processedTripIds.map(v => String(v).slice(0, 120)).filter(Boolean))].slice(-100)
    : [];
  result.lastTrip = input.lastTrip && typeof input.lastTrip === 'object' ? { ...input.lastTrip } : null;
  result.ledger = Array.isArray(input.ledger)
    ? input.ledger.filter(row => row && typeof row === 'object').slice(-80).map(row => ({ ...row }))
    : [];
  return result;
}

export class KanoNorthernDriverPassengerRelationships {
  constructor({ storage = globalThis.localStorage ?? null, storageKey = 'kano-life-passenger-relationships-v1', now = () => Date.now() } = {}) {
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

  recordBoarding(passenger, { day = 1, minute = 408 } = {}) {
    const name = safeName(passenger?.name);
    const key = keyFor(name);
    if (!key) return { ok: false, reason: 'missing_passenger_name' };
    const normalizedDay = safeDay(day);
    const normalizedMinute = safeMinute(minute);
    const person = this.state.people[key] || normalizePerson({ name, trust: 50 });
    const returning = person.rides > 0;
    person.name = name;
    person.boardings += 1;
    person.lastSeenDay = normalizedDay;
    person.lastSeenMinute = normalizedMinute;
    this.state.people[key] = person;
    this.state.totals.boardings += 1;
    const fareMultiplier = returning && person.trust >= 75 ? 1.03 : returning && person.trust <= 25 ? 0.97 : 1;
    this._record('passenger_boarded', 0, {
      name,
      returning,
      trust: person.trust,
      fareMultiplier,
      day: normalizedDay,
      minute: normalizedMinute,
      passengerClass: safeName(passenger?.class || 'passenger'),
    });
    this._trimPeople();
    this.save();
    return { ok: true, returning, trust: person.trust, fareMultiplier, person: { ...person } };
  }

  recordTrip({
    tripId, passenger, matched = false, safeTrip = false, fareEarned = 0,
    day = 1, minute = 408, distance = 0, destination = '', returning = false,
  } = {}) {
    const name = safeName(passenger?.name);
    const key = keyFor(name);
    if (!key) return { ok: false, reason: 'missing_passenger_name' };
    const id = String(tripId ?? '').trim().slice(0, 120);
    if (id && this.state.processedTripIds.includes(id)) return { ok: false, reason: 'trip_already_recorded' };

    const person = this.state.people[key] || normalizePerson({ name, trust: 50 });
    const didMatch = Boolean(matched);
    const didDriveSafely = Boolean(safeTrip);
    // Service reputation rewards a correct, incident-free drop-off; it never pays extra cash.
    const trustDelta = didMatch && didDriveSafely ? 6 : didMatch ? -3 : didDriveSafely ? -2 : -7;
    const reputationDelta = didMatch && didDriveSafely ? 2 : didMatch ? -1 : didDriveSafely ? -1 : -3;
    const wasReturning = Boolean(returning || person.rides > 0);
    person.name = name;
    person.rides += 1;
    if (didMatch) person.correctStops += 1;
    if (didDriveSafely) person.safeTrips += 1;
    else person.roughTrips += 1;
    person.trust = clamp(person.trust + trustDelta, 0, 100);
    person.lastSeenDay = safeDay(day);
    person.lastSeenMinute = safeMinute(minute);
    this.state.people[key] = person;

    this.state.totals.trips += 1;
    if (didMatch) this.state.totals.correctStops += 1;
    if (didDriveSafely) this.state.totals.safeTrips += 1;
    else this.state.totals.roughTrips += 1;
    if (wasReturning) this.state.totals.repeatTrips += 1;
    this.state.reputation = clamp(this.state.reputation + reputationDelta, 0, 100);

    const report = {
      id,
      name,
      day: safeDay(day),
      minute: safeMinute(minute),
      matched: didMatch,
      safeTrip: didDriveSafely,
      trustDelta,
      trust: person.trust,
      reputation: this.state.reputation,
      returning: wasReturning,
      fareEarned: finiteMoney(fareEarned),
      distance: Math.max(0, Math.round((Number(distance) || 0) * 1000) / 1000),
      destination: safeName(destination).slice(0, 60),
      message: this._serviceMessage({ name, matched: didMatch, safeTrip: didDriveSafely, returning: wasReturning, trust: person.trust }),
    };
    this.state.lastTrip = report;
    if (id) {
      this.state.processedTripIds.push(id);
      this.state.processedTripIds = [...new Set(this.state.processedTripIds)].slice(-100);
    }
    this._record('passenger_trip_completed', report.fareEarned, report);
    this._trimPeople();
    this.save();
    return { ok: true, report: { ...report }, snapshot: this.getSnapshot() };
  }

  getPassenger(name) {
    const person = this.state.people[keyFor(name)];
    return person ? { ...person } : null;
  }

  getSnapshot() {
    const people = Object.values(this.state.people).map(person => ({ ...person }));
    const regulars = people
      .filter(person => person.rides > 0)
      .sort((a, b) => b.rides - a.rides || b.trust - a.trust || a.name.localeCompare(b.name))
      .slice(0, 5);
    return {
      reputation: this.state.reputation,
      totals: { ...this.state.totals },
      lastTrip: this.state.lastTrip ? { ...this.state.lastTrip } : null,
      regulars,
      ledger: this.state.ledger.slice(-8).reverse().map(row => ({ ...row, details: { ...(row.details || {}) } })),
    };
  }

  exportReport() {
    return JSON.stringify({ version: 1, ...this.getSnapshot() }, null, 2);
  }

  _serviceMessage({ name, matched, safeTrip, returning, trust }) {
    if (matched && safeTrip) return returning
      ? `${name} had another good trip with you. Their confidence in your service grew.`
      : `${name} reached the right stop safely. A good first impression.`;
    if (!matched && !safeTrip) return `${name}'s trip ended roughly and at the wrong stop. Your reputation took a hit.`;
    if (!matched) return `${name} was dropped at the wrong stop. Confirm destinations more carefully.`;
    return `${name} reached the destination, but the trip was rough. Drive with more care next time.`;
  }

  _record(type, amount, details = {}) {
    this.state.ledger.push({
      id: `passenger-${Number(this.now()).toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type, amount: Math.round(Number(amount) || 0), details: clone(details), at: new Date(this.now()).toISOString(),
    });
    if (this.state.ledger.length > 80) this.state.ledger.splice(0, this.state.ledger.length - 80);
  }

  _trimPeople() {
    const entries = Object.entries(this.state.people);
    if (entries.length <= 80) return;
    entries.sort((a, b) => (b[1].lastSeenDay || 0) - (a[1].lastSeenDay || 0));
    this.state.people = Object.fromEntries(entries.slice(0, 80));
  }
}

export default KanoNorthernDriverPassengerRelationships;
