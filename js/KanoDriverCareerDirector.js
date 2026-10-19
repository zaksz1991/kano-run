/**
 * Kano Life — Driver Career & Progression Director
 * Standalone ES module. Additive: does not replace the game's wallet, physics,
 * traffic, or save system. Integrate through the callbacks described in the guide.
 */
const DEFAULTS = {
  storageKey: 'kano-life-driver-career-v1',
  startingCash: 2500,
  startingXP: 0,
  maxHistory: 100,
  xp: { trip: 12, cleanTripBonus: 5, marketTripBonus: 4, incidentPenalty: 8, passengerPraise: 3 },
  levels: [
    { level: 1, name: 'New Driver', xp: 0 },
    { level: 2, name: 'Known Face', xp: 100 },
    { level: 3, name: 'Reliable Driver', xp: 280 },
    { level: 4, name: 'Market Regular', xp: 550 },
    { level: 5, name: 'Senior Keke Driver', xp: 950 },
    { level: 6, name: 'Route Specialist', xp: 1500 },
    { level: 7, name: 'Respected Operator', xp: 2300 },
    { level: 8, name: 'Keke Owner', xp: 3400 }
  ],
  unlocks: [
    { id: 'clean-seat', name: 'Clean Seat Cover', type: 'cosmetic', cost: 1200, minLevel: 2 },
    { id: 'mirror-set', name: 'Decorative Mirror Set', type: 'cosmetic', cost: 1800, minLevel: 3 },
    { id: 'paint-refresh', name: 'Fresh Paint Job', type: 'cosmetic', cost: 3500, minLevel: 4 },
    { id: 'market-route', name: 'Market Route Permit', type: 'route', cost: 2500, minLevel: 4 },
    { id: 'comfort-seat', name: 'Passenger Comfort Seat', type: 'upgrade', cost: 5000, minLevel: 5 },
    { id: 'ownership-deposit', name: 'Ownership Deposit Opportunity', type: 'ownership', cost: 12000, minLevel: 6 },
    { id: 'premium-keke', name: 'Premium Keke Offer', type: 'vehicle', cost: 30000, minLevel: 8 }
  ]
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const numberOr = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const makeId = () => `career-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class KanoDriverCareerDirector {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options, xp: { ...DEFAULTS.xp, ...(options.xp || {}) } };
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.callbacks = options.callbacks || {};
    this.state = this.loadState();
    this.levels = [...(options.levels || DEFAULTS.levels)].sort((a, b) => a.xp - b.xp);
    this.unlockCatalog = options.unlocks || DEFAULTS.unlocks;
    this.refreshProgress({ silent: true });
  }

  createInitialState() {
    return {
      version: 1,
      cash: Math.max(0, numberOr(this.options.startingCash, 2500)),
      lifetimeEarnings: 0,
      totalExpenses: 0,
      xp: Math.max(0, numberOr(this.options.startingXP, 0)),
      level: 1,
      reputation: 50,
      trips: 0,
      cleanTrips: 0,
      marketTrips: 0,
      incidents: 0,
      passengerPraise: 0,
      ownedUnlocks: [],
      goals: {},
      history: [],
      updatedAt: new Date().toISOString()
    };
  }

  loadState() {
    try {
      const raw = this.storage?.getItem(this.options.storageKey);
      if (!raw) return this.createInitialState();
      const parsed = JSON.parse(raw);
      const initial = this.createInitialState();
      return { ...initial, ...parsed,
        cash: Math.max(0, numberOr(parsed.cash, initial.cash)),
        xp: Math.max(0, numberOr(parsed.xp, 0)),
        reputation: clamp(numberOr(parsed.reputation, 50), 0, 100),
        ownedUnlocks: Array.isArray(parsed.ownedUnlocks) ? parsed.ownedUnlocks : [],
        history: Array.isArray(parsed.history) ? parsed.history.slice(-this.options.maxHistory) : []
      };
    } catch (error) {
      this.emit('storage-error', { operation: 'load', message: String(error) });
      return this.createInitialState();
    }
  }

  save() {
    this.state.updatedAt = new Date().toISOString();
    try { this.storage?.setItem(this.options.storageKey, JSON.stringify(this.state)); }
    catch (error) { this.emit('storage-error', { operation: 'save', message: String(error) }); }
    this.emit('change', this.getSnapshot());
    return this.getSnapshot();
  }

  emit(name, payload) {
    try { this.callbacks[name]?.(payload); } catch (error) { /* UI callbacks must not break simulation. */ }
  }

  record(type, details = {}) {
    const item = { id: makeId(), type, at: new Date().toISOString(), ...details };
    this.state.history.push(item);
    if (this.state.history.length > this.options.maxHistory) this.state.history.splice(0, this.state.history.length - this.options.maxHistory);
    this.emit('history', item);
    return item;
  }

  refreshProgress({ silent = false } = {}) {
    const priorLevel = numberOr(this.state.level, 1);
    let current = this.levels[0] || { level: 1, name: 'New Driver', xp: 0 };
    for (const entry of this.levels) if (this.state.xp >= entry.xp) current = entry;
    this.state.level = current.level;
    this.state.levelName = current.name;
    const next = this.levels.find(entry => entry.xp > this.state.xp) || null;
    this.state.nextLevel = next ? { ...next, xpRemaining: Math.max(0, next.xp - this.state.xp) } : null;
    if (!silent && current.level > priorLevel) {
      for (let level = priorLevel + 1; level <= current.level; level++) {
        const reached = this.levels.find(entry => entry.level === level);
        if (reached) {
          this.record('level-up', { level: reached.level, title: reached.name });
          this.emit('level-up', { ...reached, snapshot: this.getSnapshot() });
        }
      }
    }
    return current;
  }

  addXP(amount, reason = 'activity') {
    const gained = Math.max(0, Math.round(numberOr(amount, 0)));
    if (!gained) return this.getSnapshot();
    this.state.xp += gained;
    this.record('xp-earned', { amount: gained, reason });
    this.refreshProgress();
    return this.save();
  }

  recordTrip({ fare = 0, expenses = 0, clean = true, marketDay = false, passengerPraise = false, routeId = null } = {}) {
    const gross = Math.max(0, numberOr(fare));
    const cost = Math.max(0, numberOr(expenses));
    this.state.trips += 1;
    this.state.lifetimeEarnings += gross;
    this.state.totalExpenses += cost;
    this.state.cash = Math.max(0, this.state.cash + gross - cost);
    let xp = this.options.xp.trip;
    if (clean) { this.state.cleanTrips += 1; xp += this.options.xp.cleanTripBonus; }
    if (marketDay) { this.state.marketTrips += 1; xp += this.options.xp.marketTripBonus; }
    if (passengerPraise) { this.state.passengerPraise += 1; xp += this.options.xp.passengerPraise; this.state.reputation = clamp(this.state.reputation + 1, 0, 100); }
    const net = gross - cost;
    this.record('trip-completed', { fare: gross, expenses: cost, net, clean, marketDay, routeId });
    this.addXP(xp, 'trip-completed');
    this.emit('trip-completed', { fare: gross, expenses: cost, net, snapshot: this.getSnapshot() });
    this.save();
    return { net, xp, ...this.getSnapshot() };
  }

  recordIncident({ severity = 'minor', cost = 0, type = 'collision' } = {}) {
    const amount = Math.max(0, numberOr(cost));
    this.state.incidents += 1;
    this.state.cash = Math.max(0, this.state.cash - amount);
    this.state.totalExpenses += amount;
    this.state.reputation = clamp(this.state.reputation - (severity === 'severe' ? 8 : severity === 'moderate' ? 4 : 2), 0, 100);
    this.record('incident', { severity, cost: amount, incidentType: type });
    this.addXP(0, 'incident');
    this.state.xp = Math.max(0, this.state.xp - Math.max(0, numberOr(this.options.xp.incidentPenalty, 8)));
    this.refreshProgress();
    this.save();
    return this.getSnapshot();
  }

  addEarnings(amount, reason = 'other') {
    const value = Math.max(0, numberOr(amount));
    this.state.cash += value;
    this.state.lifetimeEarnings += value;
    this.record('income', { amount: value, reason });
    return this.save();
  }

  spend(amount, reason = 'expense') {
    const value = Math.max(0, numberOr(amount));
    if (value > this.state.cash) return { ok: false, reason: 'insufficient-funds', required: value, cash: this.state.cash };
    this.state.cash -= value;
    this.state.totalExpenses += value;
    this.record('expense', { amount: value, reason });
    this.save();
    return { ok: true, ...this.getSnapshot() };
  }

  getUnlocks() {
    return this.unlockCatalog.map(item => ({ ...item,
      unlocked: this.state.level >= item.minLevel,
      owned: this.state.ownedUnlocks.includes(item.id),
      affordable: this.state.cash >= item.cost,
      available: this.state.level >= item.minLevel && !this.state.ownedUnlocks.includes(item.id) && this.state.cash >= item.cost
    }));
  }

  purchaseUnlock(id) {
    const item = this.unlockCatalog.find(entry => entry.id === id);
    if (!item) return { ok: false, reason: 'unknown-unlock' };
    if (this.state.ownedUnlocks.includes(id)) return { ok: false, reason: 'already-owned' };
    if (this.state.level < item.minLevel) return { ok: false, reason: 'level-locked', requiredLevel: item.minLevel };
    const payment = this.spend(item.cost, `unlock:${id}`);
    if (!payment.ok) return payment;
    this.state.ownedUnlocks.push(id);
    this.record('unlock-purchased', { id, name: item.name, cost: item.cost, category: item.type });
    this.save();
    this.emit('unlock', { ...item, snapshot: this.getSnapshot() });
    return { ok: true, item: { ...item }, ...this.getSnapshot() };
  }

  setGoal(id, target, label = id) {
    const safeTarget = Math.max(1, numberOr(target, 1));
    this.state.goals[id] = { id, label, target: safeTarget, progress: this.state.goals[id]?.progress || 0, completed: false };
    this.save();
    return { ...this.state.goals[id] };
  }

  progressGoal(id, amount = 1) {
    const goal = this.state.goals[id];
    if (!goal || goal.completed) return goal ? { ...goal } : null;
    goal.progress = Math.min(goal.target, goal.progress + Math.max(0, numberOr(amount)));
    if (goal.progress >= goal.target) {
      goal.completed = true;
      this.record('goal-completed', { id, label: goal.label, target: goal.target });
      this.emit('goal-completed', { ...goal });
    }
    this.save();
    return { ...goal };
  }

  getSnapshot() {
    const s = this.state;
    return {
      cash: s.cash, lifetimeEarnings: s.lifetimeEarnings, totalExpenses: s.totalExpenses,
      netLifetime: s.lifetimeEarnings - s.totalExpenses, xp: s.xp, level: s.level,
      levelName: s.levelName || 'New Driver', nextLevel: s.nextLevel || null,
      reputation: s.reputation, trips: s.trips, cleanTrips: s.cleanTrips,
      marketTrips: s.marketTrips, incidents: s.incidents, passengerPraise: s.passengerPraise,
      ownedUnlocks: [...s.ownedUnlocks], goals: structuredCloneSafe(s.goals),
      history: s.history.slice(-10).map(entry => ({ ...entry })), updatedAt: s.updatedAt
    };
  }

  reset({ keepCash = false } = {}) {
    const cash = this.state.cash;
    this.state = this.createInitialState();
    if (keepCash) this.state.cash = cash;
    this.save();
    this.emit('reset', this.getSnapshot());
    return this.getSnapshot();
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value ?? {}));
}

export default KanoDriverCareerDirector;
