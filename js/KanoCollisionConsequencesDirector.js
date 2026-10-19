/**
 * Kano Life — Collision Consequences Director
 * Additive incident/accounting layer. Does not replace physics or collision detection.
 * Connect your existing collision system by calling reportCollision(payload).
 */
export class KanoCollisionConsequencesDirector {
  constructor(options = {}) {
    this.options = {
      storageKey: 'kano-life-collision-profile-v1',
      initialCash: 0,
      repairCostPerDamage: 45,
      pedestrianIncidentBaseCost: 2500,
      vehicleIncidentBaseCost: 800,
      fineBase: 500,
      maxHistory: 80,
      onIncident: () => {},
      onWalletChange: () => {},
      onVehicleStateChange: () => {},
      onTrafficDisruption: () => {},
      onRecoverySuggested: () => {},
      ...options,
    };
    this.profile = this.load();
    this.cooldowns = new Map();
    this.disposed = false;
  }

  load() {
    const fallback = {
      cash: Math.max(0, Number(this.options.initialCash) || 0),
      vehicleDamage: 0,
      vehicleOperational: true,
      repairDebt: 0,
      incidentCount: 0,
      cleanTrips: 0,
      reputation: 50,
      history: [],
    };
    try {
      const raw = globalThis.localStorage?.getItem(this.options.storageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        cash: this.nonNegative(parsed.cash, fallback.cash),
        vehicleDamage: this.clamp(parsed.vehicleDamage, 0, 100),
        repairDebt: this.nonNegative(parsed.repairDebt, 0),
        reputation: this.clamp(parsed.reputation, 0, 100),
        history: Array.isArray(parsed.history) ? parsed.history.slice(-this.options.maxHistory) : [],
      };
    } catch {
      return fallback;
    }
  }

  reportCollision(input = {}) {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    const now = Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
    const severity = this.clamp(input.severity ?? 0.25, 0, 1);
    const type = ['vehicle', 'pedestrian', 'object', 'near_miss'].includes(input.type) ? input.type : 'vehicle';
    const sourceId = String(input.sourceId ?? 'player');
    const cooldownKey = `${sourceId}:${type}`;
    const cooldownMs = Math.max(0, Number(input.cooldownMs ?? 1200));
    if (now - (this.cooldowns.get(cooldownKey) ?? -Infinity) < cooldownMs) {
      return { ok: false, reason: 'cooldown' };
    }
    this.cooldowns.set(cooldownKey, now);

    if (type === 'near_miss') {
      this.profile.reputation = this.clamp(this.profile.reputation - Math.round(severity * 2), 0, 100);
      const incident = this.makeIncident({ type, severity, now, cost: 0, damage: 0, details: input.details });
      this.pushHistory(incident); this.save(); this.options.onIncident(incident);
      return { ok: true, incident, profile: this.snapshot() };
    }

    const damage = Math.round(severity * (type === 'pedestrian' ? 16 : 28));
    const baseCost = type === 'pedestrian'
      ? this.options.pedestrianIncidentBaseCost
      : type === 'vehicle' ? this.options.vehicleIncidentBaseCost : 250;
    const incidentCost = Math.round(baseCost * (0.4 + severity * 1.8));
    const repairCost = Math.round(damage * this.options.repairCostPerDamage);
    const fine = input.enforcement ? Math.round(this.options.fineBase * (0.5 + severity * 2)) : 0;
    const totalCost = incidentCost + fine;

    this.profile.cash = Math.max(0, this.profile.cash - totalCost);
    this.profile.repairDebt += Math.max(0, repairCost - this.profile.cash);
    this.profile.vehicleDamage = this.clamp(this.profile.vehicleDamage + damage, 0, 100);
    this.profile.incidentCount += 1;
    this.profile.cleanTrips = 0;
    this.profile.reputation = this.clamp(this.profile.reputation - Math.round(4 + severity * 18 + (type === 'pedestrian' ? 12 : 0)), 0, 100);
    if (this.profile.vehicleDamage >= 85 || input.vehicleDisabled === true) this.profile.vehicleOperational = false;

    const incident = this.makeIncident({
      type, severity, now, damage, cost: totalCost, repairCost, fine,
      injuryReported: type === 'pedestrian',
      details: input.details,
    });
    this.pushHistory(incident);
    this.save();
    this.options.onWalletChange(this.profile.cash, { reason: 'collision', incident });
    this.options.onVehicleStateChange({ damage: this.profile.vehicleDamage, operational: this.profile.vehicleOperational });
    this.options.onTrafficDisruption({ durationMs: Math.round(1500 + severity * 12000), incident });
    if (!this.profile.vehicleOperational) this.options.onRecoverySuggested({ incident, repairDebt: this.profile.repairDebt });
    this.options.onIncident(incident);
    return { ok: true, incident, profile: this.snapshot() };
  }

  recordCleanTrip() {
    this.profile.cleanTrips += 1;
    if (this.profile.cleanTrips >= 5) this.profile.reputation = this.clamp(this.profile.reputation + 1, 0, 100);
    this.save();
    return this.snapshot();
  }

  addCash(amount, reason = 'income') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'invalid_amount' };
    this.profile.cash += value;
    this.save();
    this.options.onWalletChange(this.profile.cash, { reason });
    return { ok: true, cash: this.profile.cash };
  }

  repair(amount = 100) {
    const requested = this.clamp(amount, 0, 100);
    if (requested <= 0) return { ok: false, reason: 'invalid_amount' };
    const actual = Math.min(requested, this.profile.vehicleDamage);
    const cost = Math.round(actual * this.options.repairCostPerDamage);
    if (this.profile.cash < cost) return { ok: false, reason: 'insufficient_funds', cost, cash: this.profile.cash };
    this.profile.cash -= cost;
    this.profile.vehicleDamage = this.clamp(this.profile.vehicleDamage - actual, 0, 100);
    this.profile.vehicleOperational = this.profile.vehicleDamage < 85;
    this.save();
    this.options.onWalletChange(this.profile.cash, { reason: 'vehicle_repair', cost });
    this.options.onVehicleStateChange({ damage: this.profile.vehicleDamage, operational: this.profile.vehicleOperational });
    return { ok: true, cost, damage: this.profile.vehicleDamage, operational: this.profile.vehicleOperational };
  }

  makeIncident({ type, severity, now, cost = 0, damage = 0, repairCost = 0, fine = 0, injuryReported = false, details }) {
    return {
      id: `KANO-INC-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type, severity, timestamp: now, cost, damage, repairCost, fine, injuryReported,
      details: typeof details === 'string' ? details.slice(0, 240) : '',
      reputation: this.profile.reputation,
    };
  }

  pushHistory(incident) {
    this.profile.history.push(incident);
    if (this.profile.history.length > this.options.maxHistory) this.profile.history.splice(0, this.profile.history.length - this.options.maxHistory);
  }

  snapshot() { return JSON.parse(JSON.stringify(this.profile)); }
  save() {
    try { globalThis.localStorage?.setItem(this.options.storageKey, JSON.stringify(this.profile)); } catch { /* storage can be unavailable */ }
  }
  clamp(value, min, max) { const n = Number(value); return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }
  nonNegative(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : fallback; }
  dispose() { this.disposed = true; this.cooldowns.clear(); }
}
