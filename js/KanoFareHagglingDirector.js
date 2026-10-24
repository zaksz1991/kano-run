/**
 * KANO LIFE — Passenger Fare Negotiation Director
 * Additive simulation module; deliberately does not mutate the game's wallet.
 * The host must commit payment through its authoritative wallet first.
 */
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const money = n => Math.round(Math.max(0, Number(n) || 0));
const text = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 100);
const PERSONALITIES = Object.freeze({
  trader:  { label: 'Market trader', factor: 0.96, patience: 3, opening: 0.78, haggle: 0.82 },
  student: { label: 'Student', factor: 0.78, patience: 2, opening: 0.68, haggle: 0.90 },
  worker:  { label: 'Worker', factor: 0.94, patience: 2, opening: 0.84, haggle: 0.72 },
  elder:   { label: 'Elder passenger', factor: 1.00, patience: 3, opening: 0.92, haggle: 0.42 },
  family:  { label: 'Family passenger', factor: 1.08, patience: 3, opening: 0.92, haggle: 0.46 },
  visitor: { label: 'Visitor', factor: 1.12, patience: 1, opening: 0.96, haggle: 0.50 },
  regular: { label: 'Regular customer', factor: 0.92, patience: 3, opening: 0.86, haggle: 0.60 },
  hurried: { label: 'Hurried passenger', factor: 1.12, patience: 1, opening: 1.04, haggle: 0.25 },
});
const HAUSA = Object.freeze({
  greeting: ['Ina za ka je, direba?', 'Sannu, direba. Nawa zuwa can?', 'Don Allah, nawa ne kudin zuwa?'],
  offer: ['Ka rage kadan mana.', 'Ai wannan ya yi yawa.', 'A yi min sauki, don Allah.', 'Mu daidaita farashin.'],
  accept: ['To, mun daidaita.', 'Madalla, mu tafi.', 'Na yarda. Allah ya sa a dace.'],
  reject: ['A’a, wannan ya yi yawa gare ni.', 'Yi hakuri, ba zan iya biya haka ba.', 'Zan jira wani keke.'],
  driver: ['To, mu tafi.', 'Na ji. Mu tafi lafiya.', 'Mun daidaita.'],
});
const pick = (list, seed) => list[Math.abs(Number(seed) || 0) % list.length];

export class KanoFareHagglingDirector {
  constructor(options = {}) {
    this.options = { minFare: 50, maxFare: 10000, baseFare: 100, perKm: 75, demandMultiplier: 1, marketDayMultiplier: 1, ...options };
    this.sessions = new Map();
    this.sequence = 0;
    this.listeners = new Set();
  }
  onChange(fn) { if (typeof fn !== 'function') throw new TypeError('listener must be a function'); this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { const event = { type, ...data }; for (const fn of this.listeners) { try { fn(event); } catch (_) {} } return event; }
  quoteFare(input = {}) {
    const km = clamp(input.distanceKm, 0.1, 250);
    const routeFactor = clamp(input.routeFactor ?? 1, 0.5, 3);
    const demand = clamp(input.demandMultiplier ?? this.options.demandMultiplier, 0.6, 2.5);
    const market = clamp(input.marketDayMultiplier ?? this.options.marketDayMultiplier, 0.8, 1.6);
    const time = clamp(input.timeMultiplier ?? 1, 0.8, 1.5);
    const suggested = money((this.options.baseFare + km * this.options.perKm) * routeFactor * demand * market * time);
    return { suggestedFare: clamp(suggested, this.options.minFare, this.options.maxFare), distanceKm: Number(km.toFixed(1)), factors: { route: routeFactor, demand, marketDay: market, time } };
  }
  startNegotiation(input = {}) {
    const id = text(input.passengerId, `passenger-${++this.sequence}`);
    if (this.sessions.has(id) && this.sessions.get(id).status === 'negotiating') return { ok: false, reason: 'negotiation_already_active' };
    const personality = PERSONALITIES[input.personality] ? input.personality : 'regular';
    const profile = PERSONALITIES[personality];
    const quote = this.quoteFare(input);
    const target = money(clamp(input.suggestedFare ?? quote.suggestedFare, this.options.minFare, this.options.maxFare));
    const seed = ++this.sequence;
    const offer = money(clamp(Math.round(target * profile.opening), this.options.minFare, this.options.maxFare));
    const session = {
      id, passengerId: id, passengerName: text(input.passengerName, 'Fasinja'), personality,
      personalityLabel: profile.label, origin: text(input.origin, 'Tashar keke'), destination: text(input.destination, 'Kano'),
      distanceKm: quote.distanceKm, suggestedFare: target, passengerOffer: offer, currentOffer: offer,
      rounds: 0, maxRounds: 3, status: 'negotiating', createdAt: Date.now(), acceptedFare: null,
      history: [{ speaker: 'passenger', amount: offer, text: this._dialogue('offer', seed) }],
      quoteFactors: quote.factors,
    };
    this.sessions.set(id, session);
    this.emit('negotiation_started', this.snapshot(id));
    return { ok: true, session: this.snapshot(id), dialogue: this._dialogue('greeting', seed + 1) };
  }
  counterOffer(id, amount) {
    const s = this.sessions.get(String(id));
    if (!s || s.status !== 'negotiating') return { ok: false, reason: 'negotiation_not_active' };
    if (!Number.isFinite(Number(amount))) return { ok: false, reason: 'invalid_fare' };
    const fare = money(clamp(Number(amount), this.options.minFare, this.options.maxFare));
    s.rounds += 1;
    s.currentOffer = fare;
    const fair = fare <= s.suggestedFare * 1.12 && fare >= s.suggestedFare * 0.78;
    s.history.push({ speaker: 'driver', amount: fare, text: this._dialogue('driver', s.rounds) });
    if (fair && s.rounds >= 1) {
      s.status = 'accepted'; s.acceptedFare = fare;
      s.history.push({ speaker: 'passenger', amount: fare, text: this._dialogue('accept', s.rounds + 1) });
      this.emit('fare_agreed', this.snapshot(id));
      return { ok: true, status: s.status, fare, dialogue: this._dialogue('accept', s.rounds + 1), session: this.snapshot(id) };
    }
    if (s.rounds >= s.maxRounds || fare > s.suggestedFare * 1.45 || fare < s.suggestedFare * 0.45) {
      s.status = 'rejected';
      s.history.push({ speaker: 'passenger', text: this._dialogue('reject', s.rounds + 2) });
      this.emit('fare_rejected', this.snapshot(id));
      return { ok: true, status: s.status, dialogue: this._dialogue('reject', s.rounds + 2), session: this.snapshot(id) };
    }
    const p = PERSONALITIES[s.personality];
    const next = money(clamp(Math.round((s.currentOffer + s.suggestedFare) / 2 * p.haggle + s.suggestedFare * (1 - p.haggle)), this.options.minFare, this.options.maxFare));
    s.passengerOffer = next;
    s.history.push({ speaker: 'passenger', amount: next, text: this._dialogue('offer', s.rounds + 3) });
    this.emit('counter_offer', this.snapshot(id));
    return { ok: true, status: s.status, passengerOffer: next, dialogue: this._dialogue('offer', s.rounds + 3), session: this.snapshot(id) };
  }
  acceptPassengerOffer(id) {
    const s = this.sessions.get(String(id));
    if (!s || s.status !== 'negotiating') return { ok: false, reason: 'negotiation_not_active' };
    s.acceptedFare = money(s.passengerOffer); s.status = 'accepted';
    s.history.push({ speaker: 'driver', amount: s.acceptedFare, text: this._dialogue('driver', s.rounds + 5) });
    this.emit('fare_agreed', this.snapshot(id));
    return { ok: true, status: s.status, fare: s.acceptedFare, session: this.snapshot(id) };
  }
  refusePassenger(id) {
    const s = this.sessions.get(String(id));
    if (!s || s.status !== 'negotiating') return { ok: false, reason: 'negotiation_not_active' };
    s.status = 'rejected'; s.history.push({ speaker: 'driver', text: this._dialogue('reject', s.rounds + 7) });
    this.emit('fare_rejected', this.snapshot(id));
    return { ok: true, status: s.status, session: this.snapshot(id) };
  }
  /** Call only after the authoritative game wallet successfully commits the fare. */
  async settle(id, commitFare) {
    const s = this.sessions.get(String(id));
    if (!s || s.status !== 'accepted') return { ok: false, reason: 'fare_not_accepted' };
    if (s.status === 'paid') return { ok: false, reason: 'fare_already_paid' };
    if (typeof commitFare !== 'function') return { ok: false, reason: 'wallet_commit_required' };
    let committed;
    try { committed = await commitFare({ passengerId: s.passengerId, amount: s.acceptedFare, source: 'passenger_fare', destination: s.destination }); }
    catch (error) { return { ok: false, reason: 'wallet_commit_failed', error: text(error?.message, 'wallet_error') }; }
    if (committed !== true && committed?.ok !== true) return { ok: false, reason: 'wallet_commit_failed' };
    s.status = 'paid'; s.paidAt = Date.now();
    this.emit('fare_paid', this.snapshot(id));
    return { ok: true, amount: s.acceptedFare, session: this.snapshot(id) };
  }
  snapshot(id) { const s = this.sessions.get(String(id)); return s ? JSON.parse(JSON.stringify(s)) : null; }
  getActive() { return [...this.sessions.values()].filter(s => s.status === 'negotiating').map(s => this.snapshot(s.id)); }
  _dialogue(kind, seed) { return pick(HAUSA[kind] || HAUSA.offer, seed); }
}

export { PERSONALITIES as KANO_PASSENGER_PERSONALITIES };
