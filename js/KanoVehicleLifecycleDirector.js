// ============================================================
// KANO LIFE — VEHICLE LIFECYCLE DIRECTOR
// Complete standalone module for maintenance, wear, breakdowns,
// roadside repairs, workshop service, and hire-purchase ownership.
// It does not move or render vehicles and does not own the wallet.
// ============================================================

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = value => JSON.parse(JSON.stringify(value));

const DEFAULT_PROFILES = {
  keke: { engineWear: 1, tyreWear: 1, suspensionWear: 1, serviceCost: 1, fuelStress: 1 },
  motorcycle: { engineWear: 0.85, tyreWear: 0.9, suspensionWear: 0.8, serviceCost: 0.55, fuelStress: 0.7 },
  car: { engineWear: 0.75, tyreWear: 0.8, suspensionWear: 0.75, serviceCost: 1.8, fuelStress: 1.25 },
  bus: { engineWear: 1.25, tyreWear: 1.2, suspensionWear: 1.3, serviceCost: 2.2, fuelStress: 1.8 },
  truck: { engineWear: 1.35, tyreWear: 1.3, suspensionWear: 1.15, serviceCost: 2.5, fuelStress: 2.0 },
};

const DEFAULT_PARTS = {
  engine: { health: 100, critical: 15 },
  tyres: { health: 100, critical: 20 },
  suspension: { health: 100, critical: 18 },
  brakes: { health: 100, critical: 15 },
  body: { health: 100, critical: 10 },
  cooling: { health: 100, critical: 18 },
};

const DEFAULT_CONFIG = {
  storageKey: 'kano-life-vehicle-lifecycle-v1',
  autoSave: true,
  distanceWearRate: 0.0009,
  harshDrivingWearMultiplier: 2.4,
  roughRoadWearMultiplier: 2.1,
  overdueServiceWearMultiplier: 1.45,
  breakdownHealthThreshold: 18,
  overheatingThreshold: 105,
  normalTemperature: 82,
  temperatureRisePerSecond: 0.65,
  coolingPerSecond: 0.5,
  baseRepairPrices: { engine: 18000, tyres: 8500, suspension: 12000, brakes: 9000, body: 6500, cooling: 11000 },
  serviceBaseCost: 3500,
  roadsideCalloutCost: 2500,
  roadsideRepairEfficiency: 0.42,
  workshopRepairEfficiency: 1,
  maintenanceIntervalKm: 350,
  hirePurchase: { deposit: 180000, totalPrice: 850000, installment: 25000, intervalDays: 7, defaultLimit: 2 },
};

export class KanoVehicleLifecycleDirector {
  constructor(options = {}) {
    this.config = { ...clone(DEFAULT_CONFIG), ...options };
    this.config.baseRepairPrices = { ...DEFAULT_CONFIG.baseRepairPrices, ...(options.baseRepairPrices || {}) };
    this.config.hirePurchase = { ...DEFAULT_CONFIG.hirePurchase, ...(options.hirePurchase || {}) };
    this.profiles = { ...clone(DEFAULT_PROFILES), ...(options.profiles || {}) };
    this.callbacks = options.callbacks || {};
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.vehicles = new Map();
    this.contracts = new Map();
    this.events = [];
    this._nextId = 1;
    if (options.state) this.importState(options.state);
    else if (this.config.autoSave) this.load();
  }

  on(type, payload) {
    const event = { type, at: this.now(), ...clone(payload || {}) };
    this.events.push(event);
    if (this.events.length > 250) this.events.shift();
    try { this.callbacks.onEvent?.(clone(event)); } catch (_) { /* callbacks must not break simulation */ }
    try { this.callbacks[`on${type[0].toUpperCase()}${type.slice(1)}`]?.(clone(event)); } catch (_) { /* isolated callback */ }
    return event;
  }

  save() {
    if (!this.config.autoSave || typeof localStorage === 'undefined') return false;
    try { localStorage.setItem(this.config.storageKey, JSON.stringify(this.exportState())); return true; }
    catch (error) { this.on('storageError', { message: String(error?.message || error) }); return false; }
  }

  load() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(this.config.storageKey);
      if (!raw) return false;
      this.importState(JSON.parse(raw));
      return true;
    } catch (error) { this.on('storageError', { message: String(error?.message || error) }); return false; }
  }

  createVehicle({ id, type = 'keke', name = 'Adaidaita Sahu', odometerKm = 0, parts, temperature = this.config.normalTemperature, condition = 'used' } = {}) {
    const vehicleId = String(id || `kano-vehicle-${this._nextId++}`);
    if (this.vehicles.has(vehicleId)) throw new Error(`Vehicle already exists: ${vehicleId}`);
    const baseParts = {};
    for (const [part, defaults] of Object.entries(DEFAULT_PARTS)) {
      const incoming = parts?.[part] || {};
      baseParts[part] = { health: clamp(number(incoming.health, defaults.health), 0, 100), critical: number(incoming.critical, defaults.critical) };
    }
    const vehicle = {
      id: vehicleId, type: this.profiles[type] ? type : 'keke', name: String(name), condition,
      odometerKm: Math.max(0, number(odometerKm)), parts: baseParts,
      temperature: clamp(number(temperature, this.config.normalTemperature), 20, 180),
      serviceOdometerKm: Math.max(0, number(odometerKm)), serviceDue: false,
      breakdown: null, totalRepairCost: 0, tripsSinceService: 0, lastMaintenanceAt: null,
      createdAt: this.now(), updatedAt: this.now(),
    };
    this.vehicles.set(vehicleId, vehicle);
    this.on('vehicleCreated', { vehicleId, vehicleType: vehicle.type, condition });
    this.save();
    return this.getVehicle(vehicleId);
  }

  getVehicle(id) { const v = this.vehicles.get(String(id)); return v ? clone(v) : null; }
  listVehicles() { return [...this.vehicles.values()].map(clone); }

  _vehicle(id) {
    const v = this.vehicles.get(String(id));
    if (!v) throw new Error(`Unknown vehicle: ${id}`);
    return v;
  }

  recordDriving({ vehicleId, distanceKm = 0, speedKmh = 0, harshBraking = false, sharpTurning = false, roughRoad = false, heavyLoad = false, deltaSeconds = 1, ambientC = 30 } = {}) {
    const v = this._vehicle(vehicleId);
    const profile = this.profiles[v.type] || DEFAULT_PROFILES.keke;
    const distance = Math.max(0, number(distanceKm));
    const speed = Math.max(0, number(speedKmh));
    const dt = clamp(number(deltaSeconds, 1), 0, 10);
    const harsh = (harshBraking ? 1 : 0) + (sharpTurning ? 1 : 0);
    let multiplier = 1 + harsh * (this.config.harshDrivingWearMultiplier - 1) * 0.5;
    if (roughRoad) multiplier *= this.config.roughRoadWearMultiplier;
    if (v.serviceDue) multiplier *= this.config.overdueServiceWearMultiplier;
    if (heavyLoad) multiplier *= 1.2;
    const wear = distance * this.config.distanceWearRate * multiplier;
    this._wear(v, 'engine', wear * profile.engineWear);
    this._wear(v, 'tyres', wear * profile.tyreWear * (sharpTurning ? 1.5 : 1));
    this._wear(v, 'suspension', wear * profile.suspensionWear * (roughRoad ? 2 : 1));
    this._wear(v, 'brakes', wear * (harshBraking ? 2.3 : 0.7));
    v.odometerKm += distance;
    v.tripsSinceService += distance > 0 ? 0 : 0;
    v.serviceDue = (v.odometerKm - v.serviceOdometerKm) >= this.config.maintenanceIntervalKm;

    const overheatingRisk = (speed > 45 ? 0.7 : 0.25) + (v.parts.cooling.health < 50 ? 0.9 : 0) + (v.parts.engine.health < 35 ? 0.65 : 0);
    const engineLoad = clamp(overheatingRisk, 0, 2);
    v.temperature += (this.config.temperatureRisePerSecond * engineLoad - this.config.coolingPerSecond * (v.parts.cooling.health / 100)) * dt;
    v.temperature += (number(ambientC, 30) - 30) * 0.015 * dt;
    v.temperature = clamp(v.temperature, 20, 160);
    if (v.temperature >= this.config.overheatingThreshold) {
      if (!v.breakdown) v.breakdown = { type: 'overheating', severity: clamp((v.temperature - this.config.overheatingThreshold) / 20 + 0.35, 0.35, 1), at: this.now(), resolved: false };
      this.on('overheating', { vehicleId: v.id, temperature: Math.round(v.temperature), severity: v.breakdown.severity });
    }
    this._checkCritical(v);
    v.updatedAt = this.now();
    this.save();
    return { vehicle: this.getVehicle(v.id), wearMultiplier: multiplier, overheatingRisk: clamp(overheatingRisk / 2, 0, 1) };
  }

  _wear(v, part, amount) { if (v.parts[part]) v.parts[part].health = clamp(v.parts[part].health - Math.max(0, amount), 0, 100); }

  _checkCritical(v) {
    const critical = Object.entries(v.parts).find(([, p]) => p.health <= p.critical);
    if (critical && !v.breakdown) {
      v.breakdown = { type: `${critical[0]}_failure`, severity: clamp(1 - critical[1].health / 100, 0.2, 1), at: this.now(), resolved: false };
      this.on('breakdown', { vehicleId: v.id, breakdownType: v.breakdown.type, part: critical[0], health: critical[1].health });
    }
  }

  recordImpact({ vehicleId, part = 'suspension', severity = 0.25, pothole = false, collision = false } = {}) {
    const v = this._vehicle(vehicleId);
    const target = v.parts[part] ? part : (pothole ? 'suspension' : 'body');
    const loss = clamp(number(severity, 0.25), 0, 1) * (collision ? 24 : pothole ? 12 : 8);
    this._wear(v, target, loss);
    if (collision) this._wear(v, 'body', loss * 0.7);
    if (pothole) this._wear(v, 'tyres', loss * 0.35);
    this.on('impact', { vehicleId: v.id, part: target, severity, pothole, collision, health: v.parts[target].health });
    this._checkCritical(v); v.updatedAt = this.now(); this.save();
    return this.getVehicle(v.id);
  }

  calculateRepair(vehicleId, { parts = Object.keys(DEFAULT_PARTS), workshop = true, includeService = false } = {}) {
    const v = this._vehicle(vehicleId);
    const efficiency = workshop ? this.config.workshopRepairEfficiency : this.config.roadsideRepairEfficiency;
    const profile = this.profiles[v.type] || DEFAULT_PROFILES.keke;
    const items = [];
    let total = 0;
    for (const part of [...new Set(parts)]) {
      if (!v.parts[part]) continue;
      const missing = 100 - v.parts[part].health;
      if (missing <= 0) continue;
      const base = number(this.config.baseRepairPrices[part], 5000) * profile.serviceCost;
      const cost = Math.ceil(base * missing / 100 / Math.max(0.1, efficiency));
      items.push({ part, health: Math.round(v.parts[part].health), healthRestored: Math.round(missing * efficiency), cost });
      total += cost;
    }
    if (includeService && v.serviceDue) { items.push({ part: 'routine_service', cost: this.config.serviceBaseCost }); total += this.config.serviceBaseCost; }
    if (!workshop && items.length) total += this.config.roadsideCalloutCost;
    return { vehicleId: v.id, workshop, items, total, estimatedMinutes: workshop ? 25 + items.length * 12 : 10 + items.length * 5 };
  }

  repair({ vehicleId, parts = Object.keys(DEFAULT_PARTS), workshop = true, includeService = false, paymentConfirmed = false } = {}) {
    if (!paymentConfirmed) throw new Error('Repair requires paymentConfirmed: true after the existing wallet confirms payment.');
    const v = this._vehicle(vehicleId);
    const quote = this.calculateRepair(vehicleId, { parts, workshop, includeService });
    const efficiency = workshop ? this.config.workshopRepairEfficiency : this.config.roadsideRepairEfficiency;
    for (const item of quote.items) {
      if (!v.parts[item.part]) continue;
      v.parts[item.part].health = clamp(v.parts[item.part].health + item.healthRestored, 0, 100);
    }
    if (includeService) {
      v.serviceOdometerKm = v.odometerKm;
      v.serviceDue = false;
      v.lastMaintenanceAt = this.now();
    }
    v.totalRepairCost += quote.total;
    if (v.breakdown && (v.parts.engine.health > v.parts.engine.critical && v.parts.cooling.health > v.parts.cooling.critical && v.parts.tyres.health > v.parts.tyres.critical && v.parts.suspension.health > v.parts.suspension.critical && v.parts.brakes.health > v.parts.brakes.critical)) {
      v.breakdown = null;
      v.temperature = Math.min(v.temperature, this.config.normalTemperature + 5);
      this.on('breakdownResolved', { vehicleId: v.id });
    }
    this.on('vehicleRepaired', { vehicleId: v.id, total: quote.total, workshop, items: quote.items.map(i => i.part) });
    v.updatedAt = this.now(); this.save();
    return { quote, vehicle: this.getVehicle(v.id), efficiency };
  }

  coolDown(vehicleId, seconds = 10) {
    const v = this._vehicle(vehicleId);
    v.temperature = clamp(v.temperature - this.config.coolingPerSecond * Math.max(0, number(seconds)) * (v.parts.cooling.health / 100), 20, 160);
    if (v.temperature < this.config.overheatingThreshold && v.breakdown?.type === 'overheating' && v.parts.engine.health > v.parts.engine.critical) {
      v.breakdown = null; this.on('breakdownResolved', { vehicleId: v.id, method: 'cooled_down' });
    }
    this.save(); return { temperature: v.temperature, vehicle: this.getVehicle(v.id) };
  }

  createHirePurchase({ contractId, vehicleId, buyerId, depositPaid = 0, totalPrice, installment, intervalDays, defaultLimit, startAt = this.now() } = {}) {
    const id = String(contractId || `hp-${this._nextId++}`);
    if (this.contracts.has(id)) throw new Error(`Contract already exists: ${id}`);
    const terms = this.config.hirePurchase;
    const price = Math.max(1, number(totalPrice, terms.totalPrice));
    const deposit = Math.max(0, number(depositPaid));
    const requiredDeposit = Math.max(0, number(terms.deposit));
    if (deposit < requiredDeposit) throw new Error(`Deposit insufficient: ${requiredDeposit - deposit} more required.`);
    const contract = {
      id, vehicleId: String(vehicleId), buyerId: String(buyerId || 'player'), totalPrice: price,
      depositPaid: deposit, principalRemaining: Math.max(0, price - deposit), installment: Math.max(1, number(installment, terms.installment)),
      intervalDays: Math.max(1, number(intervalDays, terms.intervalDays)), defaultLimit: Math.max(1, number(defaultLimit, terms.defaultLimit)),
      missedPayments: 0, paymentsMade: 0, nextDueAt: number(startAt) + Math.max(1, number(intervalDays, terms.intervalDays)) * 86400000,
      status: deposit >= price ? 'owned' : 'active', createdAt: number(startAt), updatedAt: number(startAt), paymentHistory: [],
    };
    this.contracts.set(id, contract);
    this.on('hirePurchaseCreated', { contractId: id, vehicleId: contract.vehicleId, principalRemaining: contract.principalRemaining, status: contract.status });
    this.save(); return clone(contract);
  }

  getContract(id) { const c = this.contracts.get(String(id)); return c ? clone(c) : null; }
  listContracts() { return [...this.contracts.values()].map(clone); }

  makeInstallment({ contractId, amount, paymentConfirmed = false, paidAt = this.now() } = {}) {
    if (!paymentConfirmed) throw new Error('Installment requires paymentConfirmed: true after the existing wallet confirms payment.');
    const c = this.contracts.get(String(contractId));
    if (!c) throw new Error(`Unknown hire-purchase contract: ${contractId}`);
    if (c.status === 'owned') return { contract: clone(c), amountApplied: 0, message: 'Vehicle is already fully paid.' };
    if (c.status === 'repossessed') throw new Error('Contract is repossessed and cannot accept normal installments.');
    const paid = clamp(number(amount), 0, c.principalRemaining);
    if (paid <= 0) throw new Error('Installment amount must be greater than zero.');
    c.principalRemaining = Math.max(0, c.principalRemaining - paid);
    c.paymentsMade += 1; c.missedPayments = 0; c.nextDueAt = number(paidAt) + c.intervalDays * 86400000; c.updatedAt = number(paidAt);
    c.paymentHistory.push({ amount: paid, paidAt: c.updatedAt, balance: c.principalRemaining });
    if (c.principalRemaining <= 0.001) { c.principalRemaining = 0; c.status = 'owned'; this.on('vehicleOwnershipEarned', { contractId: c.id, vehicleId: c.vehicleId, buyerId: c.buyerId }); }
    else c.status = 'active';
    this.on('installmentPaid', { contractId: c.id, amount: paid, principalRemaining: c.principalRemaining, status: c.status });
    this.save(); return { contract: clone(c), amountApplied: paid };
  }

  assessOverduePayments({ at = this.now() } = {}) {
    const changed = [];
    for (const c of this.contracts.values()) {
      if (c.status !== 'active' || number(at) <= c.nextDueAt) continue;
      const periodsLate = Math.max(1, Math.floor((number(at) - c.nextDueAt) / (c.intervalDays * 86400000)) + 1);
      const add = Math.min(periodsLate, c.defaultLimit - c.missedPayments);
      if (add > 0) c.missedPayments += add;
      c.nextDueAt += periodsLate * c.intervalDays * 86400000;
      c.updatedAt = number(at);
      if (c.missedPayments >= c.defaultLimit) c.status = 'at_risk';
      changed.push(clone(c));
      this.on('installmentOverdue', { contractId: c.id, missedPayments: c.missedPayments, status: c.status });
    }
    if (changed.length) this.save();
    return changed;
  }

  resolveDefault({ contractId, action, paymentConfirmed = false } = {}) {
    const c = this.contracts.get(String(contractId));
    if (!c) throw new Error(`Unknown hire-purchase contract: ${contractId}`);
    if (!['catch_up', 'repossess', 'grace'].includes(action)) throw new Error('Action must be catch_up, repossess, or grace.');
    if (action === 'catch_up' && !paymentConfirmed) throw new Error('Catch-up requires paymentConfirmed: true after wallet confirmation.');
    if (action === 'repossess') c.status = 'repossessed';
    else { c.status = c.principalRemaining <= 0 ? 'owned' : 'active'; c.missedPayments = 0; if (action === 'grace') c.nextDueAt += c.intervalDays * 86400000; }
    c.updatedAt = this.now(); this.on('defaultResolved', { contractId: c.id, action, status: c.status }); this.save(); return clone(c);
  }

  getMaintenanceAdvice(vehicleId) {
    const v = this._vehicle(vehicleId);
    const advice = Object.entries(v.parts).map(([part, p]) => ({ part, health: Math.round(p.health), urgency: p.health <= p.critical ? 'critical' : p.health < 40 ? 'high' : p.health < 70 ? 'medium' : 'low' }));
    if (v.temperature >= this.config.overheatingThreshold) advice.unshift({ part: 'temperature', health: Math.round(v.temperature), urgency: 'critical', message: 'Stop safely and let the engine cool.' });
    if (v.serviceDue) advice.push({ part: 'routine_service', urgency: 'high', message: 'Scheduled maintenance is overdue.' });
    return { vehicleId: v.id, odometerKm: Math.round(v.odometerKm * 10) / 10, serviceDue: v.serviceDue, breakdown: clone(v.breakdown), advice };
  }

  exportState() {
    return { version: 1, exportedAt: this.now(), nextId: this._nextId, vehicles: [...this.vehicles.entries()].map(([k, v]) => [k, clone(v)]), contracts: [...this.contracts.entries()].map(([k, v]) => [k, clone(v)]), events: clone(this.events.slice(-100)) };
  }

  importState(state) {
    if (!state || !Array.isArray(state.vehicles) || !Array.isArray(state.contracts)) throw new Error('Invalid vehicle lifecycle state.');
    this.vehicles = new Map(state.vehicles.map(([k, v]) => [String(k), clone(v)]));
    this.contracts = new Map(state.contracts.map(([k, v]) => [String(k), clone(v)]));
    this.events = Array.isArray(state.events) ? clone(state.events.slice(-250)) : [];
    this._nextId = Math.max(1, number(state.nextId, 1));
    return true;
  }
}

export default KanoVehicleLifecycleDirector;
