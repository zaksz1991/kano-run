// ============================================================
// KANO LIFE — VEHICLE LIFECYCLE DIRECTOR
//
// Vehicle maintenance, component health, breakdowns, repairs,
// hire-purchase, overdue payments and ownership.
//
// This module does not render or move vehicles.
// This module never charges the player's wallet.
// Payments must be confirmed by the existing wallet bridge.
// ============================================================

const clamp = (value, min, max) => {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
};

const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clone = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const DEFAULT_PROFILES = Object.freeze({
  keke: {
    engineWear: 1,
    tyreWear: 1,
    suspensionWear: 1,
    serviceCost: 1,
    fuelStress: 1,
  },
  motorcycle: {
    engineWear: 0.85,
    tyreWear: 0.9,
    suspensionWear: 0.8,
    serviceCost: 0.55,
    fuelStress: 0.7,
  },
  car: {
    engineWear: 0.75,
    tyreWear: 0.8,
    suspensionWear: 0.75,
    serviceCost: 1.8,
    fuelStress: 1.25,
  },
  bus: {
    engineWear: 1.25,
    tyreWear: 1.2,
    suspensionWear: 1.3,
    serviceCost: 2.2,
    fuelStress: 1.8,
  },
  truck: {
    engineWear: 1.35,
    tyreWear: 1.3,
    suspensionWear: 1.15,
    serviceCost: 2.5,
    fuelStress: 2,
  },
});

const DEFAULT_PARTS = Object.freeze({
  engine: { health: 100, critical: 15 },
  tyres: { health: 100, critical: 20 },
  suspension: { health: 100, critical: 18 },
  brakes: { health: 100, critical: 15 },
  body: { health: 100, critical: 10 },
  cooling: { health: 100, critical: 18 },
});

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
  baseRepairPrices: {
    engine: 18000,
    tyres: 8500,
    suspension: 12000,
    brakes: 9000,
    body: 6500,
    cooling: 11000,
  },
  serviceBaseCost: 3500,
  roadsideCalloutCost: 2500,
  roadsideRepairEfficiency: 0.42,
  workshopRepairEfficiency: 1,
  maintenanceIntervalKm: 350,
  hirePurchase: {
    deposit: 180000,
    totalPrice: 850000,
    installment: 25000,
    intervalDays: 7,
    defaultLimit: 2,
  },
};

const makeParts = (incoming = {}) =>
  Object.fromEntries(
    Object.entries(DEFAULT_PARTS).map(([name, defaults]) => {
      const part = incoming[name] || {};

      return [
        name,
        {
          health: clamp(number(part.health, defaults.health), 0, 100),
          critical: clamp(number(part.critical, defaults.critical), 0, 100),
        },
      ];
    }),
  );

const makeProfiles = (profiles = {}) => {
  const result = Object.fromEntries(
    Object.entries(DEFAULT_PROFILES).map(([key, value]) => [
      key,
      { ...value },
    ]),
  );

  for (const [key, value] of Object.entries(profiles)) {
    result[key] = { ...(result[key] || result.keke), ...value };
  }

  return result;
};

export class KanoVehicleLifecycleDirector {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      baseRepairPrices: {
        ...DEFAULT_CONFIG.baseRepairPrices,
        ...(options.baseRepairPrices || {}),
      },
      hirePurchase: {
        ...DEFAULT_CONFIG.hirePurchase,
        ...(options.hirePurchase || {}),
      },
    };

    this.profiles = makeProfiles(options.profiles);
    this.callbacks = options.callbacks || {};
    this.now = typeof options.now === 'function'
      ? options.now
      : () => Date.now();

    this.vehicles = new Map();
    this.contracts = new Map();
    this.events = [];
    this._nextId = 1;
    this._destroyed = false;

    if (options.state) {
      this.importState(options.state);
    } else if (this.config.autoSave) {
      this.load();
    }
  }

  _assertActive() {
    if (this._destroyed) {
      throw new Error('KanoVehicleLifecycleDirector has been disposed.');
    }
  }

  _timestamp() {
    return number(this.now(), Date.now());
  }

  _profile(type) {
    return this.profiles[type] || this.profiles.keke;
  }

  // ----------------------------------------------------------
  // EVENTS
  // ----------------------------------------------------------

  on(type, payload = {}) {
    if (this._destroyed) return null;

    const event = {
      type,
      at: this._timestamp(),
      ...clone(payload),
    };

    this.events.push(event);

    if (this.events.length > 250) {
      this.events.splice(0, this.events.length - 250);
    }

    try {
      this.callbacks.onEvent?.(clone(event));
    } catch {
      // Event listeners must not interrupt gameplay.
    }

    const callbackName = `on${type[0].toUpperCase()}${type.slice(1)}`;

    try {
      this.callbacks[callbackName]?.(clone(event));
    } catch {
      // Isolate individual callbacks.
    }

    return event;
  }

  // ----------------------------------------------------------
  // PERSISTENCE
  // ----------------------------------------------------------

  exportState() {
    this._assertActive();

    return {
      version: 2,
      exportedAt: this._timestamp(),
      nextId: this._nextId,
      vehicles: [...this.vehicles.entries()].map(([key, value]) => [
        key,
        clone(value),
      ]),
      contracts: [...this.contracts.entries()].map(([key, value]) => [
        key,
        clone(value),
      ]),
      events: clone(this.events.slice(-100)),
    };
  }

  importState(input) {
    this._assertActive();

    let state;

    try {
      state = typeof input === 'string' ? JSON.parse(input) : input;
    } catch (error) {
      return {
        ok: false,
        reason: 'parse_error',
        message: String(error?.message || error),
      };
    }

    if (
      !state ||
      !Array.isArray(state.vehicles) ||
      !Array.isArray(state.contracts)
    ) {
      return { ok: false, reason: 'invalid_state_format' };
    }

    const vehicles = new Map();
    const contracts = new Map();

    for (const entry of state.vehicles) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        !entry[1] ||
        typeof entry[1] !== 'object'
      ) {
        continue;
      }

      const [key, value] = entry;
      if (key === undefined || key === null) continue;

      const vehicle = clone(value);

      if (!vehicle.id || !vehicle.parts || typeof vehicle.parts !== 'object') {
        continue;
      }

      vehicle.id = String(vehicle.id);
      vehicle.parts = makeParts(vehicle.parts);
      vehicle.odometerKm = Math.max(0, number(vehicle.odometerKm));
      vehicle.temperature = clamp(
        number(vehicle.temperature, this.config.normalTemperature),
        20,
        160,
      );
      vehicle.serviceOdometerKm = Math.max(
        0,
        number(vehicle.serviceOdometerKm, vehicle.odometerKm),
      );
      vehicle.serviceDue = Boolean(vehicle.serviceDue);
      vehicle.totalRepairCost = Math.max(0, number(vehicle.totalRepairCost));
      vehicle.tripsSinceService = Math.max(
        0,
        number(vehicle.tripsSinceService),
      );

      vehicles.set(String(key), vehicle);
    }

    for (const entry of state.contracts) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        !entry[1] ||
        typeof entry[1] !== 'object'
      ) {
        continue;
      }

      const [key, value] = entry;
      if (key === undefined || key === null) continue;

      const contract = clone(value);

      if (!contract.id || !contract.vehicleId) continue;

      contract.id = String(contract.id);
      contract.vehicleId = String(contract.vehicleId);
      contract.principalRemaining = Math.max(
        0,
        number(contract.principalRemaining),
      );
      contract.paymentHistory = Array.isArray(contract.paymentHistory)
        ? contract.paymentHistory
        : [];

      contracts.set(String(key), contract);
    }

    const previous = {
      vehicles: this.vehicles,
      contracts: this.contracts,
      events: this.events,
      nextId: this._nextId,
    };

    this.vehicles = vehicles;
    this.contracts = contracts;
    this.events = Array.isArray(state.events)
      ? clone(state.events.slice(-250))
      : [];
    this._nextId = Math.max(1, Math.floor(number(state.nextId, 1)));

    return {
      ok: true,
      vehicles: vehicles.size,
      contracts: contracts.size,
      // Import updates memory. The caller controls when to persist.
      persisted: null,
      previousState: previous,
    };
  }

  save() {
    if (
      this._destroyed ||
      !this.config.autoSave ||
      typeof localStorage === 'undefined'
    ) {
      return false;
    }

    try {
      localStorage.setItem(
        this.config.storageKey,
        JSON.stringify(this.exportState()),
      );

      return true;
    } catch (error) {
      this.on('storageError', {
        message: String(error?.message || error),
      });

      return false;
    }
  }

  load() {
    this._assertActive();

    if (typeof localStorage === 'undefined') return false;

    try {
      const raw = localStorage.getItem(this.config.storageKey);
      if (!raw) return false;

      const result = this.importState(raw);

      if (!result.ok) {
        this.on('storageError', { message: result.reason });
        return false;
      }

      return true;
    } catch (error) {
      this.on('storageError', {
        message: String(error?.message || error),
      });

      return false;
    }
  }

  // ----------------------------------------------------------
  // VEHICLES
  // ----------------------------------------------------------

  createVehicle({
    id,
    type = 'keke',
    name = 'Adaidaita Sahu',
    odometerKm = 0,
    parts,
    temperature = this.config.normalTemperature,
    condition = 'used',
  } = {}) {
    this._assertActive();

    const vehicleId = String(id || `kano-vehicle-${this._nextId++}`);

    if (this.vehicles.has(vehicleId)) {
      throw new Error(`Vehicle already exists: ${vehicleId}`);
    }

    const odometer = Math.max(0, number(odometerKm));

    const vehicle = {
      id: vehicleId,
      type: this.profiles[type] ? type : 'keke',
      name: String(name),
      condition: String(condition),
      odometerKm: odometer,
      parts: makeParts(parts),
      temperature: clamp(
        number(temperature, this.config.normalTemperature),
        20,
        160,
      ),
      serviceOdometerKm: odometer,
      serviceDue: false,
      breakdown: null,
      totalRepairCost: 0,
      tripsSinceService: 0,
      lastMaintenanceAt: null,
      createdAt: this._timestamp(),
      updatedAt: this._timestamp(),
    };

    this.vehicles.set(vehicleId, vehicle);

    this.on('vehicleCreated', {
      vehicleId,
      vehicleType: vehicle.type,
      condition: vehicle.condition,
    });

    this.save();

    return this.getVehicle(vehicleId);
  }

  getVehicle(id) {
    this._assertActive();
    const vehicle = this.vehicles.get(String(id));
    return vehicle ? clone(vehicle) : null;
  }

  listVehicles() {
    this._assertActive();
    return [...this.vehicles.values()].map(clone);
  }

  _vehicle(id) {
    this._assertActive();

    const vehicle = this.vehicles.get(String(id));

    if (!vehicle) {
      throw new Error(`Unknown vehicle: ${id}`);
    }

    return vehicle;
  }

  // ----------------------------------------------------------
  // GAME HEALTH SYNCHRONISATION
  // ----------------------------------------------------------

  syncPartHealth({ vehicleId, parts = {} } = {}) {
    const vehicle = this._vehicle(vehicleId);
    const changes = [];

    for (const [part, incoming] of Object.entries(parts)) {
      if (!vehicle.parts[part]) continue;

      const rawHealth = incoming && typeof incoming === 'object'
        ? incoming.health
        : incoming;

      if (rawHealth === undefined || rawHealth === null) continue;

      const previousHealth = vehicle.parts[part].health;
      const health = clamp(number(rawHealth, previousHealth), 0, 100);

      if (Math.abs(previousHealth - health) < 0.001) continue;

      vehicle.parts[part].health = health;

      changes.push({
        part,
        previousHealth: Math.round(previousHealth),
        health: Math.round(health),
        difference: Math.round(health - previousHealth),
      });
    }

    if (changes.length) {
      vehicle.updatedAt = this._timestamp();
      this._checkCritical(vehicle);

      this.on('gameplayHealthSynced', {
        vehicleId: vehicle.id,
        changes,
      });

      this.save();
    }

    return { vehicle: this.getVehicle(vehicleId), changes };
  }

  // ----------------------------------------------------------
  // DRIVING WEAR AND TEMPERATURE
  // ----------------------------------------------------------

  recordDriving({
    vehicleId,
    distanceKm = 0,
    speedKmh = 0,
    harshBraking = false,
    sharpTurning = false,
    roughRoad = false,
    heavyLoad = false,
    deltaSeconds = 1,
    ambientC = 30,
  } = {}) {
    const vehicle = this._vehicle(vehicleId);
    const profile = this._profile(vehicle.type);

    const distance = Math.max(0, number(distanceKm));
    const speed = Math.max(0, number(speedKmh));
    const dt = clamp(number(deltaSeconds, 1), 0, 10);

    const harsh = Number(Boolean(harshBraking)) +
      Number(Boolean(sharpTurning));

    let multiplier = 1 +
      harsh * (this.config.harshDrivingWearMultiplier - 1) * 0.5;

    if (roughRoad) multiplier *= this.config.roughRoadWearMultiplier;
    if (vehicle.serviceDue) multiplier *= this.config.overdueServiceWearMultiplier;
    if (heavyLoad) multiplier *= 1.2;

    const wear = distance * this.config.distanceWearRate * multiplier;

    this._wear(vehicle, 'engine', wear * profile.engineWear);
    this._wear(
      vehicle,
      'tyres',
      wear * profile.tyreWear * (sharpTurning ? 1.5 : 1),
    );
    this._wear(
      vehicle,
      'suspension',
      wear * profile.suspensionWear * (roughRoad ? 2 : 1),
    );
    this._wear(vehicle, 'brakes', wear * (harshBraking ? 2.3 : 0.7));

    vehicle.odometerKm += distance;
    vehicle.serviceDue =
      vehicle.odometerKm - vehicle.serviceOdometerKm >=
      this.config.maintenanceIntervalKm;

    const overheatingRisk =
      (speed > 45 ? 0.7 : 0.25) +
      (vehicle.parts.cooling.health < 50 ? 0.9 : 0) +
      (vehicle.parts.engine.health < 35 ? 0.65 : 0);

    const engineLoad = clamp(overheatingRisk, 0, 2);

    vehicle.temperature += (
      this.config.temperatureRisePerSecond * engineLoad -
      this.config.coolingPerSecond * (vehicle.parts.cooling.health / 100)
    ) * dt;

    vehicle.temperature += (number(ambientC, 30) - 30) * 0.015 * dt;
    vehicle.temperature = clamp(vehicle.temperature, 20, 160);

    if (
      vehicle.temperature >= this.config.overheatingThreshold &&
      !vehicle.breakdown
    ) {
      vehicle.breakdown = {
        type: 'overheating',
        severity: clamp(
          (vehicle.temperature - this.config.overheatingThreshold) / 20 + 0.35,
          0.35,
          1,
        ),
        at: this._timestamp(),
        resolved: false,
      };

      this.on('overheating', {
        vehicleId: vehicle.id,
        temperature: Math.round(vehicle.temperature),
        severity: vehicle.breakdown.severity,
      });
    }

    this._checkCritical(vehicle);
    vehicle.updatedAt = this._timestamp();
    this.save();

    return {
      vehicle: this.getVehicle(vehicle.id),
      wearMultiplier: multiplier,
      overheatingRisk: clamp(overheatingRisk / 2, 0, 1),
    };
  }

  _wear(vehicle, part, amount) {
    if (!vehicle.parts[part]) return;

    vehicle.parts[part].health = clamp(
      vehicle.parts[part].health - Math.max(0, number(amount)),
      0,
      100,
    );
  }

  _checkCritical(vehicle) {
    const critical = Object.entries(vehicle.parts).find(
      ([, part]) => part.health <= part.critical,
    );

    if (!critical || vehicle.breakdown) return;

    const [partName, part] = critical;

    vehicle.breakdown = {
      type: `${partName}_failure`,
      severity: clamp(1 - part.health / 100, 0.2, 1),
      at: this._timestamp(),
      resolved: false,
    };

    this.on('breakdown', {
      vehicleId: vehicle.id,
      breakdownType: vehicle.breakdown.type,
      part: partName,
      health: part.health,
    });
  }

  // ----------------------------------------------------------
  // IMPACT DAMAGE
  // ----------------------------------------------------------

  recordImpact({
    vehicleId,
    part = 'suspension',
    severity = 0.25,
    pothole = false,
    collision = false,
  } = {}) {
    const vehicle = this._vehicle(vehicleId);

    const target = vehicle.parts[part]
      ? part
      : pothole
        ? 'suspension'
        : 'body';

    const loss = clamp(number(severity, 0.25), 0, 1) *
      (collision ? 24 : pothole ? 12 : 8);

    this._wear(vehicle, target, loss);

    if (collision) this._wear(vehicle, 'body', loss * 0.7);
    if (pothole) this._wear(vehicle, 'tyres', loss * 0.35);

    this.on('impact', {
      vehicleId: vehicle.id,
      part: target,
      severity,
      pothole,
      collision,
      health: vehicle.parts[target].health,
    });

    this._checkCritical(vehicle);
    vehicle.updatedAt = this._timestamp();
    this.save();

    return this.getVehicle(vehicle.id);
  }

  // ----------------------------------------------------------
  // REPAIR QUOTES
  // ----------------------------------------------------------

  calculateRepair(
    vehicleId,
    {
      parts = Object.keys(DEFAULT_PARTS),
      workshop = true,
      includeService = false,
    } = {},
  ) {
    const vehicle = this._vehicle(vehicleId);

    const efficiency = workshop
      ? clamp(number(this.config.workshopRepairEfficiency, 1), 0.1, 1)
      : clamp(number(this.config.roadsideRepairEfficiency, 0.42), 0.1, 1);

    const profile = this._profile(vehicle.type);
    const requestedParts = Array.isArray(parts)
      ? [...new Set(parts)]
      : Object.keys(DEFAULT_PARTS);

    const items = [];
    let total = 0;

    for (const part of requestedParts) {
      if (!vehicle.parts[part]) continue;

      const missing = 100 - vehicle.parts[part].health;
      if (missing <= 0) continue;

      const base = number(this.config.baseRepairPrices[part], 5000) *
        number(profile.serviceCost, 1);

      const cost = Math.ceil(base * missing / 100 / efficiency);
      const healthRestored = Math.min(missing, missing * efficiency);

      items.push({
        part,
        health: Math.round(vehicle.parts[part].health),
        healthRestored: Math.round(healthRestored),
        cost,
      });

      total += cost;
    }

    if (includeService && vehicle.serviceDue) {
      const cost = Math.max(0, number(this.config.serviceBaseCost, 3500));
      items.push({ part: 'routine_service', cost });
      total += cost;
    }

    if (!workshop && items.length) {
      total += Math.max(0, number(this.config.roadsideCalloutCost, 2500));
    }

    return {
      vehicleId: vehicle.id,
      workshop: Boolean(workshop),
      items,
      total,
      estimatedMinutes: workshop
        ? 25 + items.length * 12
        : 10 + items.length * 5,
    };
  }

  // ----------------------------------------------------------
  // REPAIRS — PAYMENT MUST ALREADY BE CONFIRMED
  // ----------------------------------------------------------

  repair({
    vehicleId,
    parts = Object.keys(DEFAULT_PARTS),
    workshop = true,
    includeService = false,
    paymentConfirmed = false,
  } = {}) {
    this._assertActive();

    if (paymentConfirmed !== true) {
      throw new Error(
        'Repair requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const vehicle = this._vehicle(vehicleId);
    const previousVehicle = clone(vehicle);

    const quote = this.calculateRepair(vehicleId, {
      parts,
      workshop,
      includeService,
    });

    const efficiency = workshop
      ? clamp(number(this.config.workshopRepairEfficiency, 1), 0.1, 1)
      : clamp(number(this.config.roadsideRepairEfficiency, 0.42), 0.1, 1);

    for (const item of quote.items) {
      if (!vehicle.parts[item.part]) continue;

      vehicle.parts[item.part].health = clamp(
        vehicle.parts[item.part].health + item.healthRestored,
        0,
        100,
      );
    }

    if (includeService && vehicle.serviceDue) {
      vehicle.serviceOdometerKm = vehicle.odometerKm;
      vehicle.serviceDue = false;
      vehicle.tripsSinceService = 0;
      vehicle.lastMaintenanceAt = this._timestamp();
    }

    vehicle.totalRepairCost += quote.total;

    const criticalPartsHealthy = [
      'engine',
      'cooling',
      'tyres',
      'suspension',
      'brakes',
    ].every((part) => vehicle.parts[part].health > vehicle.parts[part].critical);

    const overheatingResolved =
      vehicle.breakdown?.type === 'overheating' &&
      vehicle.temperature < this.config.overheatingThreshold;

    if (
      vehicle.breakdown &&
      criticalPartsHealthy &&
      (vehicle.breakdown.type !== 'overheating' || overheatingResolved)
    ) {
      vehicle.breakdown = null;

      this.on('breakdownResolved', {
        vehicleId: vehicle.id,
        method: 'repair',
      });
    }

    vehicle.updatedAt = this._timestamp();

    const persisted = this.save();

    if (!persisted && this.config.autoSave) {
      this.vehicles.set(vehicle.id, previousVehicle);

      return {
        ok: false,
        reason: 'persistence_failed',
        quote,
        vehicle: this.getVehicle(vehicleId),
        efficiency,
        persisted: false,
      };
    }

    this.on('vehicleRepaired', {
      vehicleId: vehicle.id,
      total: quote.total,
      workshop,
      items: quote.items.map((item) => item.part),
    });

    return {
      ok: true,
      quote,
      vehicle: this.getVehicle(vehicleId),
      efficiency,
      persisted,
    };
  }

  // ----------------------------------------------------------
  // COOLING AND BREAKDOWN RECOVERY
  // ----------------------------------------------------------

  coolDown(vehicleId, seconds = 10) {
    const vehicle = this._vehicle(vehicleId);

    vehicle.temperature = clamp(
      vehicle.temperature -
        this.config.coolingPerSecond *
          Math.max(0, number(seconds)) *
          (vehicle.parts.cooling.health / 100),
      20,
      160,
    );

    if (
      vehicle.breakdown?.type === 'overheating' &&
      vehicle.temperature < this.config.overheatingThreshold &&
      vehicle.parts.engine.health > vehicle.parts.engine.critical
    ) {
      vehicle.breakdown = null;

      this.on('breakdownResolved', {
        vehicleId: vehicle.id,
        method: 'cooled_down',
      });
    }

    vehicle.updatedAt = this._timestamp();
    this.save();

    return {
      temperature: vehicle.temperature,
      vehicle: this.getVehicle(vehicleId),
    };
  }

  // ----------------------------------------------------------
  // ROUTINE MAINTENANCE
  // ----------------------------------------------------------

  recordTrip(vehicleId) {
    const vehicle = this._vehicle(vehicleId);

    vehicle.tripsSinceService += 1;
    vehicle.updatedAt = this._timestamp();
    this.save();

    return {
      tripsSinceService: vehicle.tripsSinceService,
      serviceDue: vehicle.serviceDue,
      vehicle: this.getVehicle(vehicleId),
    };
  }

  // ----------------------------------------------------------
  // HIRE-PURCHASE
  // ----------------------------------------------------------

  createHirePurchase({
    contractId,
    vehicleId,
    buyerId,
    depositPaid = 0,
    totalPrice,
    installment,
    intervalDays,
    defaultLimit,
    startAt = this._timestamp(),
  } = {}) {
    this._assertActive();

    const id = String(contractId || `hp-${this._nextId++}`);

    if (this.contracts.has(id)) {
      throw new Error(`Contract already exists: ${id}`);
    }

    if (!this.vehicles.has(String(vehicleId))) {
      throw new Error(`Unknown vehicle: ${vehicleId}`);
    }

    const terms = this.config.hirePurchase;
    const price = Math.max(1, number(totalPrice, terms.totalPrice));
    const deposit = Math.max(0, number(depositPaid));
    const requiredDeposit = Math.max(0, number(terms.deposit));

    if (deposit < requiredDeposit) {
      throw new Error(
        `Deposit insufficient: ${requiredDeposit - deposit} more required.`,
      );
    }

    if (deposit > price) {
      throw new Error('Deposit cannot exceed the total vehicle price.');
    }

    const interval = Math.max(1, number(intervalDays, terms.intervalDays));
    const startedAt = number(startAt, this._timestamp());

    const contract = {
      id,
      vehicleId: String(vehicleId),
      buyerId: String(buyerId || 'player'),
      totalPrice: price,
      depositPaid: deposit,
      principalRemaining: Math.max(0, price - deposit),
      installment: Math.max(1, number(installment, terms.installment)),
      intervalDays: interval,
      defaultLimit: Math.max(1, number(defaultLimit, terms.defaultLimit)),
      missedPayments: 0,
      paymentsMade: 0,
      nextDueAt: startedAt + interval * 86400000,
      status: deposit >= price ? 'owned' : 'active',
      createdAt: startedAt,
      updatedAt: startedAt,
      paymentHistory: [],
    };

    this.contracts.set(id, contract);

    this.on('hirePurchaseCreated', {
      contractId: id,
      vehicleId: contract.vehicleId,
      principalRemaining: contract.principalRemaining,
      status: contract.status,
    });

    this.save();

    return clone(contract);
  }

  getContract(id) {
    this._assertActive();
    const contract = this.contracts.get(String(id));
    return contract ? clone(contract) : null;
  }

  listContracts() {
    this._assertActive();
    return [...this.contracts.values()].map(clone);
  }

  makeInstallment({
    contractId,
    amount,
    paymentConfirmed = false,
    paidAt = this._timestamp(),
  } = {}) {
    this._assertActive();

    if (paymentConfirmed !== true) {
      throw new Error(
        'Installment requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const contract = this.contracts.get(String(contractId));

    if (!contract) {
      throw new Error(`Unknown hire-purchase contract: ${contractId}`);
    }

    if (contract.status === 'owned') {
      return {
        ok: true,
        contract: clone(contract),
        amountApplied: 0,
        message: 'Vehicle is already fully paid.',
      };
    }

    if (['repossessed', 'cancelled'].includes(contract.status)) {
      throw new Error(
        `Contract cannot accept payments while ${contract.status}.`,
      );
    }

    const paid = clamp(number(amount), 0, contract.principalRemaining);

    if (paid <= 0) {
      throw new Error('Installment amount must be greater than zero.');
    }

    const previousContract = clone(contract);

    contract.principalRemaining = Math.max(0, contract.principalRemaining - paid);
    contract.paymentsMade += 1;
    contract.missedPayments = 0;
    contract.nextDueAt = number(paidAt, this._timestamp()) +
      contract.intervalDays * 86400000;
    contract.updatedAt = number(paidAt, this._timestamp());

    contract.paymentHistory.push({
      amount: paid,
      paidAt: contract.updatedAt,
      balance: contract.principalRemaining,
    });

    if (contract.principalRemaining <= 0.001) {
      contract.principalRemaining = 0;
      contract.status = 'owned';

      this.on('vehicleOwnershipEarned', {
        contractId: contract.id,
        vehicleId: contract.vehicleId,
        buyerId: contract.buyerId,
      });
    } else {
      contract.status = 'active';
    }

    const persisted = this.save();

    if (!persisted && this.config.autoSave) {
      this.contracts.set(contract.id, previousContract);

      return {
        ok: false,
        reason: 'persistence_failed',
        contract: clone(previousContract),
        amountApplied: 0,
        persisted: false,
      };
    }

    this.on('installmentPaid', {
      contractId: contract.id,
      amount: paid,
      principalRemaining: contract.principalRemaining,
      status: contract.status,
    });

    return {
      ok: true,
      contract: clone(contract),
      amountApplied: paid,
      persisted,
    };
  }

  assessOverduePayments({ at = this._timestamp() } = {}) {
    this._assertActive();

    const currentTime = number(at, this._timestamp());
    const changed = [];

    for (const contract of this.contracts.values()) {
      if (
        contract.status !== 'active' ||
        currentTime <= contract.nextDueAt
      ) {
        continue;
      }

      const periodMs = contract.intervalDays * 86400000;
      const periodsLate = Math.max(
        1,
        Math.floor((currentTime - contract.nextDueAt) / periodMs) + 1,
      );

      const remainingDefaults = Math.max(
        0,
        contract.defaultLimit - contract.missedPayments,
      );

      const addedMisses = Math.min(periodsLate, remainingDefaults);

      contract.missedPayments += addedMisses;
      contract.nextDueAt += periodsLate * periodMs;
      contract.updatedAt = currentTime;

      if (contract.missedPayments >= contract.defaultLimit) {
        contract.status = 'at_risk';
      }

      changed.push(clone(contract));

      this.on('installmentOverdue', {
        contractId: contract.id,
        missedPayments: contract.missedPayments,
        status: contract.status,
      });
    }

    if (changed.length) this.save();

    return changed;
  }

  resolveDefault({
    contractId,
    action,
    paymentConfirmed = false,
  } = {}) {
    this._assertActive();

    const contract = this.contracts.get(String(contractId));

    if (!contract) {
      throw new Error(`Unknown hire-purchase contract: ${contractId}`);
    }

    if (!['catch_up', 'repossess', 'grace'].includes(action)) {
      throw new Error('Action must be catch_up, repossess, or grace.');
    }

    if (action === 'catch_up' && paymentConfirmed !== true) {
      throw new Error(
        'Catch-up requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const previousContract = clone(contract);

    if (action === 'repossess') {
      contract.status = 'repossessed';
    } else {
      contract.status = contract.principalRemaining <= 0 ? 'owned' : 'active';
      contract.missedPayments = 0;

      if (action === 'grace') {
        contract.nextDueAt += contract.intervalDays * 86400000;
      }
    }

    contract.updatedAt = this._timestamp();

    const persisted = this.save();

    if (!persisted && this.config.autoSave) {
      this.contracts.set(contract.id, previousContract);
      throw new Error('Unable to persist hire-purchase default resolution.');
    }

    this.on('defaultResolved', {
      contractId: contract.id,
      action,
      status: contract.status,
    });

    return clone(contract);
  }

  // ----------------------------------------------------------
  // MAINTENANCE ADVICE
  // ----------------------------------------------------------

  getMaintenanceAdvice(vehicleId) {
    const vehicle = this._vehicle(vehicleId);

    const advice = Object.entries(vehicle.parts).map(([part, component]) => ({
      part,
      health: Math.round(component.health),
      urgency: component.health <= component.critical
        ? 'critical'
        : component.health < 40
          ? 'high'
          : component.health < 70
            ? 'medium'
            : 'low',
    }));

    if (vehicle.temperature >= this.config.overheatingThreshold) {
      advice.unshift({
        part: 'temperature',
        health: Math.round(vehicle.temperature),
        urgency: 'critical',
        message: 'Stop safely and let the engine cool.',
      });
    }

    if (vehicle.serviceDue) {
      advice.push({
        part: 'routine_service',
        urgency: 'high',
        message: 'Scheduled maintenance is overdue.',
      });
    }

    return {
      vehicleId: vehicle.id,
      odometerKm: Math.round(vehicle.odometerKm * 10) / 10,
      serviceDue: vehicle.serviceDue,
      breakdown: clone(vehicle.breakdown),
      advice,
    };
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  dispose() {
    if (this._destroyed) return;

    this._destroyed = true;
    this.callbacks = {};
    this.events = [];
  }
}

export default KanoVehicleLifecycleDirector;