/**
 * KANO LIFE — Dynamic Passenger & Street-Life AI
 * Standalone additive module for a browser-based Kano driving/life simulation.
 * No Three.js dependency. Connect its outputs to your existing game loop/UI.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pick = (items, random = Math.random) => items[Math.floor(random() * items.length)];
const id = (prefix = 'npc') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PERSONALITIES = [
  { key: 'commuter', label: 'Daily Commuter', patience: 0.58, bargain: 0.35, tip: 0.1, urgency: 0.5 },
  { key: 'market_buyer', label: 'Market Shopper', patience: 0.44, bargain: 0.78, tip: 0.04, urgency: 0.64 },
  { key: 'student', label: 'Student', patience: 0.62, bargain: 0.82, tip: 0.02, urgency: 0.55 },
  { key: 'worker', label: 'Office Worker', patience: 0.38, bargain: 0.28, tip: 0.12, urgency: 0.86 },
  { key: 'elder', label: 'Elder', patience: 0.8, bargain: 0.22, tip: 0.08, urgency: 0.25 },
  { key: 'parent', label: 'Parent with Child', patience: 0.36, bargain: 0.3, tip: 0.05, urgency: 0.72 },
  { key: 'trader', label: 'Small Trader', patience: 0.5, bargain: 0.7, tip: 0.06, urgency: 0.6 },
  { key: 'visitor', label: 'First-time Visitor', patience: 0.53, bargain: 0.42, tip: 0.1, urgency: 0.48 },
];

const DESTINATIONS = [
  { key: 'market', label: 'Kano market', demand: 1.25, fare: 1.15 },
  { key: 'motor_park', label: 'Motor park', demand: 1.1, fare: 1.1 },
  { key: 'school', label: 'School gate', demand: 1.0, fare: 0.95 },
  { key: 'hospital', label: 'Hospital', demand: 1.05, fare: 1.05 },
  { key: 'neighbourhood', label: 'Neighbourhood', demand: 0.8, fare: 0.9 },
  { key: 'business_district', label: 'Business district', demand: 1.0, fare: 1.1 },
  { key: 'wedding', label: 'Wedding/event venue', demand: 1.2, fare: 1.2 },
  { key: 'religious_centre', label: 'Religious centre', demand: 0.95, fare: 1.0 },
  { key: 'bus_stop', label: 'Main bus stop', demand: 1.05, fare: 1.0 },
];

const STREET_EVENTS = [
  { key: 'market_surge', label: 'Market rush', duration: [35, 75], demand: 1.45, traffic: 1.25, pedestrian: 1.5, risk: 1.12 },
  { key: 'school_closing', label: 'School closing time', duration: [25, 50], demand: 1.2, traffic: 1.18, pedestrian: 1.65, risk: 1.18 },
  { key: 'rain_shower', label: 'Rain shower', duration: [30, 80], demand: 1.25, traffic: 1.12, pedestrian: 0.88, risk: 1.4 },
  { key: 'roadside_trade', label: 'Busy roadside trading', duration: [45, 100], demand: 1.1, traffic: 1.2, pedestrian: 1.4, risk: 1.22 },
  { key: 'event_convoy', label: 'Celebration convoy nearby', duration: [25, 55], demand: 1.15, traffic: 1.4, pedestrian: 1.05, risk: 1.5 },
  { key: 'quiet_period', label: 'Quiet street period', duration: [30, 70], demand: 0.72, traffic: 0.78, pedestrian: 0.8, risk: 0.82 },
];

export class KanoStreetLifeDirector {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'kano-life-street-life-v1';
    this.random = options.random || Math.random;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.clock = 0;
    this.dayPhase = options.dayPhase || 'morning';
    this.activeEvent = null;
    this.passengers = new Map();
    this.queue = [];
    this.currentPassenger = null;
    this.trip = null;
    this.sequence = 0;
    this.load();
  }

  emit(type, detail = {}) { this.onEvent({ type, detail, time: this.clock }); }

  createPassenger(options = {}) {
    const personality = options.personality
      ? PERSONALITIES.find(p => p.key === options.personality) || PERSONALITIES[0]
      : pick(PERSONALITIES, this.random);
    const destination = options.destination
      ? DESTINATIONS.find(d => d.key === options.destination) || pick(DESTINATIONS, this.random)
      : pick(DESTINATIONS, this.random);
    const urgency = clamp(options.urgency ?? (personality.urgency + (this.random() - 0.5) * 0.3), 0, 1);
    const passenger = {
      id: options.id || id('passenger'),
      name: options.name || pick(['Amina', 'Bashir', 'Fatima', 'Musa', 'Hauwa', 'Sani', 'Maryam', 'Ibrahim', 'Zainab', 'Abdullahi'], this.random),
      personality: personality.key,
      personalityLabel: personality.label,
      destination: destination.key,
      destinationLabel: destination.label,
      urgency,
      patience: clamp(personality.patience + (this.random() - 0.5) * 0.18, 0.08, 0.98),
      bargaining: clamp(personality.bargain + (this.random() - 0.5) * 0.2, 0, 1),
      loyalty: 0,
      trust: 0.55,
      mood: 'neutral',
      waitSeconds: 0,
      estimatedFare: 0,
      trips: 0,
      complaints: 0,
      status: 'waiting',
      createdAt: this.clock,
      traits: options.traits || [],
    };
    this.passengers.set(passenger.id, passenger);
    this.queue.push(passenger.id);
    this.emit('passenger_spawned', { passenger: this.publicPassenger(passenger) });
    return this.publicPassenger(passenger);
  }

  publicPassenger(p) {
    if (!p) return null;
    return { ...p, traits: [...p.traits] };
  }

  getQueue() {
    return this.queue.map(pid => this.passengers.get(pid)).filter(p => p && p.status === 'waiting').map(p => this.publicPassenger(p));
  }

  getCurrentPassenger() { return this.publicPassenger(this.currentPassenger); }

  getFareQuote(passengerId, context = {}) {
    const p = this.passengers.get(passengerId);
    if (!p) return { ok: false, reason: 'passenger_not_found' };
    const destination = DESTINATIONS.find(d => d.key === p.destination) || DESTINATIONS[0];
    const baseFare = Math.max(50, Number(context.baseFare) || 200);
    const distanceFactor = clamp(Number(context.distanceFactor) || 1, 0.5, 4);
    const demand = Number(context.demandMultiplier) || this.activeEvent?.demand || 1;
    const weather = context.rain ? 1.12 : 1;
    const rush = ['morning', 'evening'].includes(context.dayPhase || this.dayPhase) ? 1.08 : 1;
    const loyaltyDiscount = Math.min(0.18, p.loyalty * 0.025);
    const suggested = Math.round((baseFare * distanceFactor * destination.fare * demand * weather * rush * (1 - loyaltyDiscount)) / 10) * 10;
    const low = Math.round(suggested * (1 - 0.08 - p.bargaining * 0.12) / 10) * 10;
    const high = Math.round(suggested * (1.08 + p.bargaining * 0.18) / 10) * 10;
    return { ok: true, passengerId, currency: 'NGN', suggestedFare: suggested, acceptableLow: Math.max(50, low), acceptableHigh: high, bargaining: p.bargaining, loyaltyDiscountPercent: Math.round(loyaltyDiscount * 100), factors: { demand, weather, rush, destination: destination.fare, distanceFactor } };
  }

  negotiateFare(passengerId, offeredFare, context = {}) {
    const p = this.passengers.get(passengerId);
    if (!p || p.status !== 'waiting') return { ok: false, reason: 'passenger_not_waiting' };
    const quote = this.getFareQuote(passengerId, context);
    const fare = Math.max(0, Math.round(Number(offeredFare) || 0));
    const fairRatio = fare / Math.max(1, quote.suggestedFare);
    const willingness = clamp(0.65 + p.patience * 0.25 - p.urgency * 0.16, 0.25, 0.95);
    const accepted = fare >= quote.acceptableLow && fare <= quote.acceptableHigh * 1.15;
    if (accepted) {
      p.estimatedFare = fare;
      p.mood = fairRatio <= 1.08 ? 'pleased' : 'cautious';
      p.trust = clamp(p.trust + (fairRatio <= 1.08 ? 0.04 : -0.03), 0, 1);
      this.emit('fare_accepted', { passengerId, fare, mood: p.mood });
      return { ok: true, accepted: true, fare, mood: p.mood, passenger: this.publicPassenger(p) };
    }
    if (fare < quote.acceptableLow) {
      p.mood = 'disappointed';
      this.emit('fare_counteroffer', { passengerId, counterOffer: quote.acceptableLow, reason: 'offer_too_low' });
      return { ok: true, accepted: false, counterOffer: quote.acceptableLow, reason: 'offer_too_low', passenger: this.publicPassenger(p) };
    }
    if (p.urgency >= willingness && fare <= quote.acceptableHigh * 1.35) {
      p.estimatedFare = fare;
      p.trust = clamp(p.trust - 0.1, 0, 1);
      p.mood = 'reluctant';
      this.emit('fare_accepted', { passengerId, fare, mood: p.mood });
      return { ok: true, accepted: true, fare, mood: p.mood, warning: 'high_fare_may_reduce_trust', passenger: this.publicPassenger(p) };
    }
    p.mood = 'annoyed';
    this.emit('passenger_refused_fare', { passengerId, offeredFare: fare, reason: 'offer_too_high' });
    return { ok: true, accepted: false, counterOffer: quote.acceptableHigh, reason: 'offer_too_high', passenger: this.publicPassenger(p) };
  }

  boardPassenger(passengerId) {
    const p = this.passengers.get(passengerId);
    if (!p || p.status !== 'waiting') return { ok: false, reason: 'passenger_not_waiting' };
    if (this.currentPassenger) return { ok: false, reason: 'vehicle_already_has_passenger' };
    if (!p.estimatedFare) return { ok: false, reason: 'fare_not_agreed' };
    p.status = 'onboard';
    p.mood = 'neutral';
    p.waitSeconds = Math.max(0, this.clock - p.createdAt);
    this.queue = this.queue.filter(idValue => idValue !== passengerId);
    this.currentPassenger = p;
    this.trip = { passengerId, fare: p.estimatedFare, startedAt: this.clock, unsafeEvents: 0, delays: 0, distance: 0 };
    this.emit('passenger_boarded', { passenger: this.publicPassenger(p), trip: { ...this.trip } });
    return { ok: true, passenger: this.publicPassenger(p), trip: { ...this.trip } };
  }

  updateTrip(metrics = {}) {
    if (!this.trip || !this.currentPassenger) return { ok: false, reason: 'no_active_trip' };
    this.trip.distance += Math.max(0, Number(metrics.distanceDelta) || 0);
    this.trip.unsafeEvents += Math.max(0, Number(metrics.unsafeEventsDelta) || 0);
    this.trip.delays += Math.max(0, Number(metrics.delaySeconds) || 0);
    if (metrics.collision) this.trip.unsafeEvents += 1;
    if (metrics.hardBrake) this.trip.unsafeEvents += 0.5;
    return { ok: true, trip: { ...this.trip } };
  }

  completeTrip(options = {}) {
    if (!this.trip || !this.currentPassenger) return { ok: false, reason: 'no_active_trip' };
    const p = this.currentPassenger;
    const trip = { ...this.trip };
    const safe = trip.unsafeEvents === 0;
    const delayPenalty = clamp(trip.delays / 180, 0, 0.3);
    const safetyPenalty = Math.min(0.55, trip.unsafeEvents * 0.13);
    const fareRatio = trip.fare / Math.max(1, Number(options.fairFare) || trip.fare);
    const farePenalty = fareRatio > 1.25 ? Math.min(0.3, (fareRatio - 1.25) * 0.45) : 0;
    const serviceScore = clamp(1 - delayPenalty - safetyPenalty - farePenalty + (options.helpedPassenger ? 0.08 : 0) + (options.polite ? 0.05 : 0), 0, 1);
    p.trust = clamp(p.trust * 0.55 + serviceScore * 0.45, 0, 1);
    p.trips += 1;
    p.loyalty = clamp(p.loyalty + (serviceScore >= 0.72 ? 1 : serviceScore < 0.4 ? -1 : 0), 0, 10);
    p.status = 'completed';
    p.mood = serviceScore >= 0.82 ? 'happy' : serviceScore >= 0.58 ? 'satisfied' : 'unhappy';
    const recommended = serviceScore >= 0.82 && this.random() < (0.18 + p.trust * 0.25);
    const complaint = serviceScore < 0.4 ? this.fileComplaint(p.id, trip.unsafeEvents ? 'unsafe_driving' : farePenalty ? 'unfair_fare' : 'poor_service', 'Passenger was unhappy with the trip.') : null;
    const result = { ok: true, passenger: this.publicPassenger(p), fareEarned: trip.fare, serviceScore: Math.round(serviceScore * 100), safe, recommended, complaint, durationSeconds: Math.max(0, this.clock - trip.startedAt), trip };
    this.emit('trip_completed', result);
    if (recommended) this.emit('word_of_mouth', { passengerId: p.id, destination: p.destination, message: `${p.name} recommends this driver.` });
    this.currentPassenger = null;
    this.trip = null;
    this.save();
    return result;
  }

  fileComplaint(passengerId, category, message = '') {
    const p = this.passengers.get(passengerId);
    if (p) { p.complaints += 1; p.trust = clamp(p.trust - 0.15, 0, 1); p.mood = 'angry'; }
    const complaint = { id: id('complaint'), passengerId, category, message, resolved: false, time: this.clock };
    this.emit('complaint_filed', complaint);
    return complaint;
  }

  resolveComplaint(complaint, action = 'apology') {
    if (!complaint || complaint.resolved) return { ok: false, reason: 'complaint_already_resolved_or_invalid' };
    const p = this.passengers.get(complaint.passengerId);
    const recovery = { apology: 0.08, refund: 0.18, safe_service: 0.12, ignore: -0.08 }[action] ?? 0.04;
    if (p) { p.trust = clamp(p.trust + recovery, 0, 1); p.mood = p.trust >= 0.55 ? 'calmer' : 'disappointed'; }
    complaint.resolved = true;
    complaint.resolution = action;
    this.emit('complaint_resolved', { complaint, passenger: this.publicPassenger(p) });
    this.save();
    return { ok: true, complaint, passenger: this.publicPassenger(p) };
  }

  spawnStreetEvent(options = {}) {
    if (this.activeEvent && !options.force) return { ok: false, reason: 'event_already_active', event: { ...this.activeEvent } };
    const template = options.type ? STREET_EVENTS.find(e => e.key === options.type) : pick(STREET_EVENTS, this.random);
    if (!template) return { ok: false, reason: 'unknown_event_type' };
    const duration = options.duration ?? template.duration[0] + this.random() * (template.duration[1] - template.duration[0]);
    this.activeEvent = { ...template, id: id('street-event'), startedAt: this.clock, remaining: duration, duration };
    this.emit('street_event_started', { event: { ...this.activeEvent } });
    return { ok: true, event: { ...this.activeEvent } };
  }

  getWorldModifiers() {
    const e = this.activeEvent;
    return e ? { demandMultiplier: e.demand, trafficMultiplier: e.traffic, pedestrianMultiplier: e.pedestrian, roadRiskMultiplier: e.risk, event: e.key } : { demandMultiplier: 1, trafficMultiplier: 1, pedestrianMultiplier: 1, roadRiskMultiplier: 1, event: null };
  }

  tick(deltaSeconds = 1, context = {}) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 10);
    this.clock += dt;
    if (context.dayPhase) this.dayPhase = context.dayPhase;
    for (const pid of [...this.queue]) {
      const p = this.passengers.get(pid);
      if (!p || p.status !== 'waiting') continue;
      p.waitSeconds += dt;
      const impatience = p.waitSeconds / Math.max(15, 120 * p.patience);
      if (impatience > 1 && this.random() < Math.min(0.08, dt * 0.008 * impatience)) {
        p.status = 'left';
        p.mood = 'impatient';
        this.queue = this.queue.filter(qid => qid !== pid);
        this.emit('passenger_left_queue', { passenger: this.publicPassenger(p), reason: 'wait_too_long' });
      }
    }
    if (this.activeEvent) {
      this.activeEvent.remaining -= dt;
      if (this.activeEvent.remaining <= 0) {
        const ended = this.activeEvent;
        this.activeEvent = null;
        this.emit('street_event_ended', { event: ended });
      }
    }
    if (this.random() < Math.min(0.12, dt * 0.002) && !this.activeEvent) this.spawnStreetEvent();
    return { time: this.clock, queueLength: this.getQueue().length, currentPassenger: this.getCurrentPassenger(), worldModifiers: this.getWorldModifiers(), activeEvent: this.activeEvent ? { ...this.activeEvent } : null };
  }

  getSnapshot() {
    return { version: 1, clock: this.clock, dayPhase: this.dayPhase, activeEvent: this.activeEvent ? { ...this.activeEvent } : null, passengers: [...this.passengers.values()].map(p => this.publicPassenger(p)), queue: [...this.queue], currentPassengerId: this.currentPassenger?.id || null, trip: this.trip ? { ...this.trip } : null, sequence: this.sequence };
  }

  save() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey, JSON.stringify(this.getSnapshot())); return true; }
    catch (error) { this.emit('storage_error', { message: error?.message || 'Unable to save street-life state' }); return false; }
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.passengers)) return false;
      this.clock = Number(data.clock) || 0;
      this.dayPhase = data.dayPhase || 'morning';
      this.activeEvent = data.activeEvent || null;
      this.passengers = new Map(data.passengers.map(p => [p.id, p]));
      this.queue = Array.isArray(data.queue) ? data.queue.filter(pid => this.passengers.has(pid)) : [];
      this.currentPassenger = data.currentPassengerId ? this.passengers.get(data.currentPassengerId) || null : null;
      this.trip = data.trip || null;
      this.sequence = Number(data.sequence) || 0;
      return true;
    } catch { return false; }
  }

  exportData() { return JSON.stringify(this.getSnapshot(), null, 2); }
  importData(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || data.version !== 1 || !Array.isArray(data.passengers)) return { ok: false, reason: 'invalid_save_data' };
      this.clock = Number(data.clock) || 0;
      this.dayPhase = data.dayPhase || 'morning';
      this.activeEvent = data.activeEvent || null;
      this.passengers = new Map(data.passengers.map(p => [p.id, p]));
      this.queue = Array.isArray(data.queue) ? data.queue.filter(pid => this.passengers.has(pid)) : [];
      this.currentPassenger = data.currentPassengerId ? this.passengers.get(data.currentPassengerId) || null : null;
      this.trip = data.trip || null;
      this.sequence = Number(data.sequence) || 0;
      this.save();
      return { ok: true, passengers: this.passengers.size };
    } catch (error) { return { ok: false, reason: 'parse_error', message: error.message }; }
  }

  reset({ clearStorage = true } = {}) {
    this.clock = 0; this.dayPhase = 'morning'; this.activeEvent = null; this.passengers.clear(); this.queue = []; this.currentPassenger = null; this.trip = null; this.sequence = 0;
    if (clearStorage && typeof localStorage !== 'undefined') { try { localStorage.removeItem(this.storageKey); } catch {} }
    this.emit('reset');
  }
}

export { PERSONALITIES as KANO_PASSENGER_PERSONALITIES, DESTINATIONS as KANO_PASSENGER_DESTINATIONS, STREET_EVENTS as KANO_STREET_EVENTS };
