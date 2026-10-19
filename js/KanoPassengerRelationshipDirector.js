/**
 * KANO LIFE — Passenger Relationship & Reputation Director
 * Standalone browser module. Does not depend on Three.js or the game loop.
 *
 * Core features:
 * - Persistent named/anonymous passenger profiles
 * - Trust, satisfaction, fare fairness, patience, loyalty and referrals
 * - Repeat-customer bonuses and complaint/recommendation events
 * - Fare guidance and reputation summaries
 * - Safe localStorage persistence with import/export support
 */

const DEFAULTS = Object.freeze({
  storageKey: 'kano-life-passenger-relationships-v1',
  maxPassengers: 250,
  startingReputation: 50,
  startingCashBonus: 0,
  onChange: null,
  onEvent: null,
  onStorageError: null,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => Number((Number(value) || 0).toFixed(digits));
const now = () => new Date().toISOString();
const safeText = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 100);
const randomId = () => `passenger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PERSONALITIES = Object.freeze({
  regular: { label: 'Regular customer', patience: 68, generosity: 1.05, complaintRisk: 0.72 },
  trader: { label: 'Market trader', patience: 58, generosity: 1.0, complaintRisk: 0.86 },
  student: { label: 'Student', patience: 48, generosity: 0.88, complaintRisk: 0.92 },
  worker: { label: 'Worker', patience: 54, generosity: 0.98, complaintRisk: 0.8 },
  visitor: { label: 'Visitor', patience: 42, generosity: 1.08, complaintRisk: 0.9 },
  elder: { label: 'Elder passenger', patience: 74, generosity: 1.0, complaintRisk: 0.62 },
  family: { label: 'Family passenger', patience: 61, generosity: 1.02, complaintRisk: 0.76 },
});

function makePassenger(input = {}) {
  const personality = PERSONALITIES[input.personality] ? input.personality : 'regular';
  const profile = PERSONALITIES[personality];
  return {
    id: safeText(input.id, randomId()),
    name: safeText(input.name, 'Passenger'),
    personality,
    area: safeText(input.area, 'Kano'),
    firstSeenAt: input.firstSeenAt || now(),
    lastSeenAt: input.lastSeenAt || now(),
    rides: Math.max(0, Math.floor(Number(input.rides) || 0)),
    completedRides: Math.max(0, Math.floor(Number(input.completedRides) || 0)),
    cancelledRides: Math.max(0, Math.floor(Number(input.cancelledRides) || 0)),
    complaints: Math.max(0, Math.floor(Number(input.complaints) || 0)),
    referrals: Math.max(0, Math.floor(Number(input.referrals) || 0)),
    totalFare: Math.max(0, Number(input.totalFare) || 0),
    trust: clamp(input.trust ?? 50, 0, 100),
    satisfaction: clamp(input.satisfaction ?? 55, 0, 100),
    loyalty: clamp(input.loyalty ?? 0, 0, 100),
    patience: clamp(input.patience ?? profile.patience, 0, 100),
    lastFareFairness: clamp(input.lastFareFairness ?? 50, 0, 100),
    notes: Array.isArray(input.notes) ? input.notes.slice(-12).map(x => safeText(x, '')).filter(Boolean) : [],
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(x => safeText(x, '')).filter(Boolean))].slice(0, 12) : [],
  };
}

export class KanoPassengerRelationshipDirector {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.passengers = new Map();
    this.reputation = clamp(this.options.startingReputation, 0, 100);
    this.stats = { rides: 0, repeatRides: 0, complaints: 0, recommendations: 0, referrals: 0, fareDisputes: 0 };
    this.eventLog = [];
    this.load();
  }

  emit(type, payload = {}) {
    const event = { type, at: now(), ...payload };
    this.eventLog.push(event);
    if (this.eventLog.length > 100) this.eventLog.splice(0, this.eventLog.length - 100);
    try { this.options.onEvent?.(event); } catch (_) { /* callback isolation */ }
    try { this.options.onChange?.(this.getSnapshot()); } catch (_) { /* callback isolation */ }
    this.save();
    return event;
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(this.options.storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.reputation = clamp(data.reputation ?? this.reputation, 0, 100);
      this.stats = { ...this.stats, ...(data.stats || {}) };
      this.eventLog = Array.isArray(data.eventLog) ? data.eventLog.slice(-100) : [];
      this.passengers.clear();
      for (const rawPassenger of (Array.isArray(data.passengers) ? data.passengers : []).slice(-this.options.maxPassengers)) {
        const passenger = makePassenger(rawPassenger);
        this.passengers.set(passenger.id, passenger);
      }
      return true;
    } catch (error) {
      this.options.onStorageError?.(error);
      return false;
    }
  }

  save() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const data = {
        version: 1,
        savedAt: now(),
        reputation: this.reputation,
        stats: this.stats,
        passengers: [...this.passengers.values()].slice(-this.options.maxPassengers),
        eventLog: this.eventLog.slice(-100),
      };
      localStorage.setItem(this.options.storageKey, JSON.stringify(data));
      return true;
    } catch (error) {
      try { this.options.onStorageError?.(error); } catch (_) { /* callback isolation */ }
      return false;
    }
  }

  createPassenger(input = {}) {
    const passenger = makePassenger(input);
    if (this.passengers.has(passenger.id)) return this.passengers.get(passenger.id);
    if (this.passengers.size >= this.options.maxPassengers) {
      const oldest = [...this.passengers.values()].sort((a, b) => Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt))[0];
      if (oldest) this.passengers.delete(oldest.id);
    }
    this.passengers.set(passenger.id, passenger);
    this.emit('passenger_met', { passengerId: passenger.id, name: passenger.name, personality: passenger.personality });
    return passenger;
  }

  getPassenger(id) {
    const passenger = this.passengers.get(String(id));
    return passenger ? structuredCloneSafe(passenger) : null;
  }

  ensurePassenger(id, fallback = {}) {
    if (id && this.passengers.has(String(id))) return this.passengers.get(String(id));
    return this.createPassenger({ ...fallback, id: id || fallback.id || randomId() });
  }

  /**
   * Record a completed passenger trip.
   * Input: { passengerId, passenger, fare, suggestedFare, distanceKm, serviceQuality,
   *          waitedMinutes, safeDriving, destination, timeOfDay }
   * Returns relationship deltas and potential bonus/referral signals.
   */
  recordRide(input = {}) {
    const passenger = this.ensurePassenger(input.passengerId, input.passenger || {});
    const firstRide = passenger.rides === 0;
    const fare = Math.max(0, Number(input.fare) || 0);
    const suggestedFare = Math.max(0, Number(input.suggestedFare) || fare || 1);
    const fairness = clamp(100 - Math.abs(fare - suggestedFare) / Math.max(suggestedFare, 1) * 100, 0, 100);
    const quality = clamp(input.serviceQuality ?? 70, 0, 100);
    const waitingPenalty = clamp(Number(input.waitedMinutes) || 0, 0, 45) * 0.45;
    const unsafePenalty = input.safeDriving === false ? 16 : 0;
    const fairnessDelta = (fairness - 55) * 0.12;
    const qualityDelta = (quality - 55) * 0.16;
    const repeat = !firstRide;
    const repeatBonus = repeat ? 2.5 : 0;
    const satisfactionDelta = clamp(qualityDelta + fairnessDelta + repeatBonus - waitingPenalty - unsafePenalty, -22, 18);
    const trustDelta = clamp(qualityDelta * 0.75 + fairnessDelta * 0.9 + (input.safeDriving === false ? -18 : 2) - waitingPenalty * 0.4, -20, 14);
    const personality = PERSONALITIES[passenger.personality] || PERSONALITIES.regular;
    const loyaltyDelta = (repeat ? 4 : 1.5) + Math.max(0, satisfactionDelta) * 0.16;

    passenger.rides += 1;
    passenger.completedRides += 1;
    passenger.lastSeenAt = now();
    passenger.totalFare += fare;
    passenger.lastFareFairness = round(fairness);
    passenger.satisfaction = round(clamp(passenger.satisfaction + satisfactionDelta, 0, 100));
    passenger.trust = round(clamp(passenger.trust + trustDelta, 0, 100));
    passenger.loyalty = round(clamp(passenger.loyalty + loyaltyDelta, 0, 100));
    if (input.destination) passenger.area = safeText(input.destination, passenger.area);
    if (input.safeDriving === false) this.addNote(passenger, 'Felt unsafe during the ride');
    if (fairness < 45) this.addNote(passenger, 'Fare felt unfair');

    this.stats.rides += 1;
    if (repeat) this.stats.repeatRides += 1;
    const reputationDelta = clamp((passenger.satisfaction - 55) * 0.025 + (passenger.trust - 50) * 0.018 + (fairness - 50) * 0.025, -2.5, 2.5);
    this.reputation = round(clamp(this.reputation + reputationDelta, 0, 100));

    const referralChance = clamp((passenger.satisfaction - 35) / 100 * personality.generosity * (0.15 + passenger.loyalty / 250), 0, 0.65);
    const mayRecommend = passenger.satisfaction >= 72 && passenger.trust >= 65 && Math.random() < referralChance;
    if (mayRecommend) {
      passenger.referrals += 1;
      this.stats.referrals += 1;
      this.stats.recommendations += 1;
      this.reputation = round(clamp(this.reputation + 0.6, 0, 100));
      this.addNote(passenger, 'Recommended the driver to someone');
    }

    const result = {
      passenger: structuredCloneSafe(passenger),
      repeatCustomer: repeat,
      relationshipDelta: { trust: round(trustDelta), satisfaction: round(satisfactionDelta), loyalty: round(loyaltyDelta), reputation: round(reputationDelta) },
      fareFairness: round(fairness),
      referralEarned: mayRecommend,
      repeatBonusMultiplier: repeat ? 1.05 + passenger.loyalty / 500 : 1,
      feedback: this.getRideFeedback(passenger, fairness, quality, input.safeDriving !== false),
    };
    this.emit('ride_recorded', { passengerId: passenger.id, repeatCustomer: repeat, fare, fairness: round(fairness), referralEarned: mayRecommend });
    return result;
  }

  recordComplaint(input = {}) {
    const passenger = this.ensurePassenger(input.passengerId, input.passenger || {});
    const severity = clamp(input.severity ?? 1, 1, 5);
    const reason = safeText(input.reason, 'Service complaint');
    const penalty = severity * 3.5;
    passenger.complaints += 1;
    passenger.lastSeenAt = now();
    passenger.satisfaction = round(clamp(passenger.satisfaction - penalty, 0, 100));
    passenger.trust = round(clamp(passenger.trust - penalty * 0.75, 0, 100));
    passenger.loyalty = round(clamp(passenger.loyalty - penalty * 0.4, 0, 100));
    this.addNote(passenger, `Complaint: ${reason}`);
    this.stats.complaints += 1;
    if (/fare|price|overcharg/i.test(reason)) this.stats.fareDisputes += 1;
    const repPenalty = severity * 0.8;
    this.reputation = round(clamp(this.reputation - repPenalty, 0, 100));
    this.emit('passenger_complaint', { passengerId: passenger.id, severity, reason, reputationDelta: -repPenalty });
    return { passenger: structuredCloneSafe(passenger), reputationDelta: -repPenalty, resolutionSuggestion: this.getResolutionSuggestion(reason, severity) };
  }

  resolveComplaint(passengerId, input = {}) {
    const passenger = this.passengers.get(String(passengerId));
    if (!passenger) return { ok: false, reason: 'passenger_not_found' };
    const goodwill = clamp(input.goodwill ?? 8, 0, 20);
    const reason = safeText(input.reason, 'Driver apologised and resolved the issue');
    passenger.satisfaction = round(clamp(passenger.satisfaction + goodwill, 0, 100));
    passenger.trust = round(clamp(passenger.trust + goodwill * 0.7, 0, 100));
    passenger.loyalty = round(clamp(passenger.loyalty + goodwill * 0.25, 0, 100));
    this.reputation = round(clamp(this.reputation + goodwill * 0.08, 0, 100));
    this.addNote(passenger, `Resolved: ${reason}`);
    this.emit('complaint_resolved', { passengerId: passenger.id, goodwill });
    return { ok: true, passenger: structuredCloneSafe(passenger), reputation: this.reputation };
  }

  recordCancellation(input = {}) {
    const passenger = this.ensurePassenger(input.passengerId, input.passenger || {});
    const driverCancelled = input.cancelledBy !== 'passenger';
    const penalty = driverCancelled ? 7 : 2;
    passenger.cancelledRides += 1;
    passenger.lastSeenAt = now();
    passenger.satisfaction = round(clamp(passenger.satisfaction - penalty, 0, 100));
    passenger.trust = round(clamp(passenger.trust - penalty * 0.8, 0, 100));
    this.reputation = round(clamp(this.reputation - (driverCancelled ? 0.8 : 0.2), 0, 100));
    this.addNote(passenger, driverCancelled ? 'Driver cancelled the trip' : 'Passenger cancelled the trip');
    this.emit('ride_cancelled', { passengerId: passenger.id, cancelledBy: input.cancelledBy || 'driver' });
    return { passenger: structuredCloneSafe(passenger), reputation: this.reputation };
  }

  recommendFare(input = {}) {
    const baseFare = Math.max(0, Number(input.baseFare) || 0);
    const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
    const demand = clamp(input.demand ?? 50, 0, 100);
    const weather = clamp(input.weather ?? 0, 0, 100); // 0 normal; high values mean difficult weather
    const rush = clamp(input.rushHour ?? 0, 0, 100);
    const passenger = input.passengerId ? this.passengers.get(String(input.passengerId)) : null;
    const repeatDiscount = passenger && passenger.completedRides >= 3 && passenger.trust >= 65 ? 0.04 : 0;
    const demandPremium = Math.max(0, demand - 55) * 0.0015;
    const weatherPremium = weather * 0.0008;
    const rushPremium = rush * 0.0005;
    const loyaltyDiscount = passenger ? Math.min(0.08, passenger.loyalty / 1250) : 0;
    const multiplier = clamp(1 + demandPremium + weatherPremium + rushPremium - repeatDiscount - loyaltyDiscount, 0.82, 1.3);
    const recommended = Math.max(0, Math.round(baseFare * multiplier / 50) * 50);
    return {
      recommendedFare: recommended,
      baseFare,
      multiplier: round(multiplier, 3),
      loyaltyDiscountPercent: round((repeatDiscount + loyaltyDiscount) * 100),
      factors: { demandPremium: round(demandPremium * 100), weatherPremium: round(weatherPremium * 100), rushPremium: round(rushPremium * 100) },
      guidance: passenger?.loyalty >= 65 ? 'A fair regular-customer fare can strengthen loyalty.' : 'Keep the fare close to the local route rate to build trust.',
    };
  }

  getRideFeedback(passenger, fairness, quality, safe) {
    if (!safe) return 'The passenger felt unsafe. Slow down and drive smoothly on the next trip.';
    if (fairness < 45) return 'The fare felt too high. Agree on a fair price before moving.';
    if (quality < 45) return 'The passenger was dissatisfied with the service.';
    if (passenger.satisfaction >= 82 && passenger.trust >= 75) return 'Excellent service. This passenger may become a regular customer.';
    if (passenger.satisfaction >= 65) return 'The passenger was generally satisfied.';
    return 'Be punctual, drive safely, and keep fares fair to build trust.';
  }

  getResolutionSuggestion(reason, severity) {
    if (/fare|price|overcharg/i.test(reason)) return severity >= 4 ? 'Offer a clear fare explanation and consider a partial refund.' : 'Explain the route fare calmly and agree on a fair amount.';
    if (/unsafe|driv|speed|collision/i.test(reason)) return 'Acknowledge the concern, drive more smoothly, and avoid risky manoeuvres.';
    if (/wait|late|delay/i.test(reason)) return 'Apologise for the delay and give a realistic arrival estimate.';
    if (/clean|dirty|comfort/i.test(reason)) return 'Improve the passenger space and offer an apology.';
    return 'Apologise, listen without arguing, and agree on a practical resolution.';
  }

  addNote(passenger, note) {
    passenger.notes.push(`${now()} — ${safeText(note, '')}`);
    if (passenger.notes.length > 12) passenger.notes.splice(0, passenger.notes.length - 12);
  }

  getRegulars(limit = 10) {
    return [...this.passengers.values()]
      .filter(p => p.completedRides >= 2)
      .sort((a, b) => (b.loyalty * 0.45 + b.trust * 0.35 + b.completedRides * 2) - (a.loyalty * 0.45 + a.trust * 0.35 + a.completedRides * 2))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map(structuredCloneSafe);
  }

  getSnapshot() {
    const passengers = [...this.passengers.values()];
    const avg = key => passengers.length ? round(passengers.reduce((sum, p) => sum + p[key], 0) / passengers.length) : 0;
    return {
      reputation: round(this.reputation),
      reputationTier: this.getReputationTier(),
      passengerCount: passengers.length,
      regularCount: passengers.filter(p => p.completedRides >= 2).length,
      averageTrust: avg('trust'),
      averageSatisfaction: avg('satisfaction'),
      averageLoyalty: avg('loyalty'),
      stats: { ...this.stats },
      recentEvents: this.eventLog.slice(-10).map(structuredCloneSafe),
    };
  }

  getReputationTier() {
    if (this.reputation >= 90) return 'Kano legend';
    if (this.reputation >= 75) return 'Highly trusted';
    if (this.reputation >= 60) return 'Well regarded';
    if (this.reputation >= 40) return 'Known driver';
    if (this.reputation >= 20) return 'Needs improvement';
    return 'Poor reputation';
  }

  exportData() {
    return JSON.stringify({ version: 1, reputation: this.reputation, stats: this.stats, passengers: [...this.passengers.values()], eventLog: this.eventLog }, null, 2);
  }

  importData(serialized) {
    try {
      const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
      if (!data || !Array.isArray(data.passengers)) return { ok: false, reason: 'invalid_data' };
      this.reputation = clamp(data.reputation ?? 50, 0, 100);
      this.stats = { ...this.stats, ...(data.stats || {}) };
      this.passengers.clear();
      for (const raw of data.passengers.slice(-this.options.maxPassengers)) {
        const passenger = makePassenger(raw);
        this.passengers.set(passenger.id, passenger);
      }
      this.eventLog = Array.isArray(data.eventLog) ? data.eventLog.slice(-100) : [];
      this.save();
      this.emit('data_imported', { passengerCount: this.passengers.size });
      return { ok: true, passengerCount: this.passengers.size };
    } catch (error) {
      return { ok: false, reason: 'parse_error', message: String(error?.message || error) };
    }
  }

  reset() {
    this.passengers.clear();
    this.reputation = clamp(this.options.startingReputation, 0, 100);
    this.stats = { rides: 0, repeatRides: 0, complaints: 0, recommendations: 0, referrals: 0, fareDisputes: 0 };
    this.eventLog = [];
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(this.options.storageKey); } catch (error) { this.options.onStorageError?.(error); }
    this.emit('reset');
    return this.getSnapshot();
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export { PERSONALITIES as KANO_PASSENGER_PERSONALITIES };
export default KanoPassengerRelationshipDirector;
