// ============================================================
// KANO LIFE — VEHICLE LIFECYCLE DIRECTOR
//
// Complete vehicle maintenance and ownership simulation.
//
// Includes:
// - Vehicle creation and persistent state
// - Component health synchronisation
// - Driving wear and overheating
// - Pothole and collision damage
// - Repair quotes and repair processing
// - Breakdown recovery
// - Routine maintenance
// - Hire-purchase contracts
// - Payment history and overdue assessment
// - Event handling and cleanup
//
// This module does not render or move vehicles.
// It does not own the player's wallet.
// ============================================================

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clone = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const DEFAULT_PROFILES = {
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

const cloneProfiles = () =>
  Object.fromEntries(
    Object.entries(DEFAULT_PROFILES).map(([key, profile]) => [
      key,
      { ...profile },
    ]),
  );

const cloneDefaultParts = () =>
  Object.fromEntries(
    Object.entries(DEFAULT_PARTS).map(([key, part]) => [
      key,
      { ...part },
    ]),
  );

// Normalise component names used by the game and workshop.
const normalisePartName = (part) => {
  const key = String(part || '').trim().toLowerCase();

  if (key === 'tyre' || key === 'tires' || key === 'tyres') {
    return 'tyres';
  }

  return key;
};

// ============================================================
// DIRECTOR
// ============================================================

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

    this.profiles = cloneProfiles();

    for (const [type, profile] of Object.entries(
      options.profiles || {},
    )) {
      this.profiles[type] = {
        ...(this.profiles[type] || {}),
        ...profile,
      };
    }

    this.callbacks = options.callbacks || {};

    this.now =
      typeof options.now === 'function'
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

  // ==========================================================
  // INTERNAL GUARDS
  // ==========================================================

  _assertActive() {
    if (this._destroyed) {
      throw new Error(
        'KanoVehicleLifecycleDirector has been disposed.',
      );
    }
  }

  _timestamp() {
    return number(this.now(), Date.now());
  }

  _profile(type) {
    return (
      this.profiles[type] ||
      this.profiles.keke ||
      DEFAULT_PROFILES.keke
    );
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

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
    } catch (_) {
      // Event consumers must not interrupt gameplay.
    }

    const callbackName =
      `on${type[0].toUpperCase()}${type.slice(1)}`;

    try {
      this.callbacks[callbackName]?.(clone(event));
    } catch (_) {
      // Isolate individual callbacks.
    }

    return event;
  }

  // ==========================================================
  // STORAGE
  // ==========================================================

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

    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const raw = localStorage.getItem(
        this.config.storageKey,
      );

      if (!raw) return false;

      this.importState(JSON.parse(raw));
      return true;
    } catch (error) {
      this.on('storageError', {
        message: String(error?.message || error),
      });

      return false;
    }
  }

  exportState() {
    this._assertActive();

    return {
      version: 2,
      exportedAt: this._timestamp(),
      nextId: this._nextId,

      vehicles: [...this.vehicles.entries()].map(
        ([key, vehicle]) => [key, clone(vehicle)],
      ),

      contracts: [...this.contracts.entries()].map(
        ([key, contract]) => [key, clone(contract)],
      ),

      events: clone(this.events.slice(-100)),
    };
  }

  importState(state) {
    this._assertActive();

    if (
      !state ||
      !Array.isArray(state.vehicles) ||
      !Array.isArray(state.contracts)
    ) {
      throw new Error('Invalid vehicle lifecycle state.');
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

      const [key, source] = entry;
      const vehicle = clone(source);

      // Migrate older or alternate component naming.
      if (
        !vehicle.parts?.tyres &&
        vehicle.parts?.tyre
      ) {
        vehicle.parts.tyres = vehicle.parts.tyre;
      }

      if (vehicle.parts) {
        delete vehicle.parts.tyre;

        for (const [part, defaults] of Object.entries(
          DEFAULT_PARTS,
        )) {
          const existing = vehicle.parts[part] || {};

          vehicle.parts[part] = {
            health: clamp(
              number(existing.health, defaults.health),
              0,
              100,
            ),
            critical: clamp(
              number(existing.critical, defaults.critical),
              0,
              100,
            ),
          };
        }
      }

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

      contracts.set(String(entry[0]), clone(entry[1]));
    }

    this.vehicles = vehicles;
    this.contracts = contracts;

    this.events = Array.isArray(state.events)
      ? clone(state.events.slice(-250))
      : [];

    this._nextId = Math.max(
      1,
      Math.floor(number(state.nextId, 1)),
    );

    return true;
  }

  // ==========================================================
  // VEHICLE CREATION
  // ==========================================================

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

    const vehicleId = String(
      id || `kano-vehicle-${this._nextId++}`,
    );

    if (this.vehicles.has(vehicleId)) {
      throw new Error(`Vehicle already exists: ${vehicleId}`);
    }

    const partDefaults = cloneDefaultParts();
    const baseParts = {};

    for (const [part, defaults] of Object.entries(
      partDefaults,
    )) {
      const incoming =
        parts?.[part] ||
        (part === 'tyres' ? parts?.tyre : null) ||
        {};

      baseParts[part] = {
        health: clamp(
          number(incoming.health, defaults.health),
          0,
          100,
        ),
        critical: clamp(
          number(incoming.critical, defaults.critical),
          0,
          100,
        ),
      };
    }

    const odometer = Math.max(0, number(odometerKm));

    const vehicle = {
      id: vehicleId,

      type: this.profiles[type] ? type : 'keke',
      name: String(name),
      condition: String(condition),

      odometerKm: odometer,
      parts: baseParts,

      temperature: clamp(
        number(temperature, this.config.normalTemperature),
        20,
        180,
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

    const persisted = this.save();

    return {
      ...this.getVehicle(vehicleId),
      persisted,
    };
  }

  getVehicle(id) {
    this._assertActive();

    const vehicle = this.vehicles.get(String(id));
    return vehicle ? clone(vehicle) : null;
  }

  listVehicles() {
    this._assertActive();

    return [...this.vehicles.values()].map((vehicle) =>
      clone(vehicle),
    );
  }

  _vehicle(id) {
    this._assertActive();

    const vehicle = this.vehicles.get(String(id));

    if (!vehicle) {
      throw new Error(`Unknown vehicle: ${id}`);
    }

    return vehicle;
  }

  // ==========================================================
  // GAME HEALTH SYNCHRONISATION
  //
  // Mirrors health observed by the game.
  // Does not invent damage or add wear.
  // ==========================================================

  syncPartHealth({ vehicleId, parts = {} } = {}) {
    const vehicle = this._vehicle(vehicleId);
    const changes = [];

    for (const [rawPart, incoming] of Object.entries(parts)) {
      const part = normalisePartName(rawPart);

      // Ignore unsupported parts, including electrical.
      // Electrical health is not currently a lifecycle component.
      if (!vehicle.parts[part]) continue;

      const rawHealth =
        incoming && typeof incoming === 'object'
          ? incoming.health
          : incoming;

      if (rawHealth === undefined || rawHealth === null) {
        continue;
      }

      const previousHealth = vehicle.parts[part].health;

      const health = clamp(
        number(rawHealth, previousHealth),
        0,
        100,
      );

      if (Math.abs(previousHealth - health) < 0.001) {
        continue;
      }

      vehicle.parts[part].health = health;

      changes.push({
        part,
        previousHealth: Math.round(previousHealth),
        health: Math.round(health),
        difference: Math.round(health - previousHealth),
      });
    }

    let persisted = true;

    if (changes.length > 0) {
      vehicle.updatedAt = this._timestamp();

      this._checkCritical(vehicle);
      persisted = this.save();
    }

    return {
      ok: true,
      vehicle: this.getVehicle(vehicleId),
      changes,
      persisted,
    };
  }

  // ==========================================================
  // DRIVING WEAR AND TEMPERATURE
  // ==========================================================

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

    const harsh =
      (harshBraking ? 1 : 0) +
      (sharpTurning ? 1 : 0);

    let multiplier =
      1 +
      harsh *
        (this.config.harshDrivingWearMultiplier - 1) *
        0.5;

    if (roughRoad) {
      multiplier *= this.config.roughRoadWearMultiplier;
    }

    if (vehicle.serviceDue) {
      multiplier *= this.config.overdueServiceWearMultiplier;
    }

    if (heavyLoad) multiplier *= 1.2;

    const wear =
      distance * this.config.distanceWearRate * multiplier;

    this._wear(vehicle, 'engine', wear * profile.engineWear);

    this._wear(
      vehicle,
      'tyres',
      wear *
        profile.tyreWear *
        (sharpTurning ? 1.5 : 1),
    );

    this._wear(
      vehicle,
      'suspension',
      wear *
        profile.suspensionWear *
        (roughRoad ? 2 : 1),
    );

    this._wear(
      vehicle,
      'brakes',
      wear * (harshBraking ? 2.3 : 0.7),
    );

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
      this.config.coolingPerSecond *
        (vehicle.parts.cooling.health / 100)
    ) * dt;

    vehicle.temperature +=
      (number(ambientC, 30) - 30) * 0.015 * dt;

    vehicle.temperature = clamp(vehicle.temperature, 20, 160);

    if (
      vehicle.temperature >= this.config.overheatingThreshold &&
      !vehicle.breakdown
    ) {
      vehicle.breakdown = {
        type: 'overheating',
        severity: clamp(
          (vehicle.temperature -
            this.config.overheatingThreshold) /
            20 +
            0.35,
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

    const persisted = this.save();

    return {
      vehicle: this.getVehicle(vehicle.id),
      wearMultiplier: multiplier,
      overheatingRisk: clamp(overheatingRisk / 2, 0, 1),
      persisted,
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

    if (critical && !vehicle.breakdown) {
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
  }

  // ==========================================================
  // IMPACT DAMAGE
  // ==========================================================

  recordImpact({
    vehicleId,
    part = 'suspension',
    severity = 0.25,
    pothole = false,
    collision = false,
  } = {}) {
    const vehicle = this._vehicle(vehicleId);
    const normalisedPart = normalisePartName(part);

    const target = vehicle.parts[normalisedPart]
      ? normalisedPart
      : pothole
        ? 'suspension'
        : 'body';

    const loss =
      clamp(number(severity, 0.25), 0, 1) *
      (collision ? 24 : pothole ? 12 : 8);

    this._wear(vehicle, target, loss);

    if (collision) {
      this._wear(vehicle, 'body', loss * 0.7);
    }

    if (pothole) {
      this._wear(vehicle, 'tyres', loss * 0.35);
    }

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

  // ==========================================================
  // REPAIR QUOTES
  // ==========================================================

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
      ? [...new Set(parts.map(normalisePartName))]
      : Object.keys(DEFAULT_PARTS);

    const items = [];
    let total = 0;

    for (const part of requestedParts) {
      if (!vehicle.parts[part]) continue;

      const missing = 100 - vehicle.parts[part].health;
      if (missing <= 0) continue;

      const base =
        number(
          this.config.baseRepairPrices[part],
          5000,
        ) * number(profile.serviceCost, 1);

      const cost = Math.ceil(
        (base * missing) / 100 / efficiency,
      );

      const healthRestored = Math.min(
        missing,
        missing * efficiency,
      );

      items.push({
        part,
        health: Math.round(vehicle.parts[part].health),
        healthRestored: Math.round(healthRestored),
        cost,
      });

      total += cost;
    }

    if (includeService && vehicle.serviceDue) {
      const serviceCost = Math.max(
        0,
        number(this.config.serviceBaseCost, 3500),
      );

      items.push({
        part: 'routine_service',
        cost: serviceCost,
      });

      total += serviceCost;
    }

    if (!workshop && items.length > 0) {
      total += Math.max(
        0,
        number(this.config.roadsideCalloutCost, 2500),
      );
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

  // ==========================================================
  // REPAIRS
  // ==========================================================

  repair({
    vehicleId,
    parts = Object.keys(DEFAULT_PARTS),
    workshop = true,
    includeService = false,
    paymentConfirmed = false,
  } = {}) {
    this._assertActive();

    if (!paymentConfirmed) {
      throw new Error(
        'Repair requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const vehicle = this._vehicle(vehicleId);

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
    ].every((part) => {
      const component = vehicle.parts[part];
      return component.health > component.critical;
    });

    const overheatingResolved =
      vehicle.breakdown?.type === 'overheating' &&
      vehicle.temperature < this.config.overheatingThreshold;

    if (
      vehicle.breakdown &&
      criticalPartsHealthy &&
      (
        overheatingResolved ||
        vehicle.breakdown.type !== 'overheating'
      )
    ) {
      vehicle.breakdown = null;

      this.on('breakdownResolved', {
        vehicleId: vehicle.id,
        method: 'repair',
      });
    }

    vehicle.updatedAt = this._timestamp();

    this.on('vehicleRepaired', {
      vehicleId: vehicle.id,
      total: quote.total,
      workshop,
      items: quote.items.map((item) => item.part),
    });

    const persisted = this.save();

    return {
      ok: true,
      quote,
      vehicle: this.getVehicle(vehicleId),
      efficiency,
      persisted,
    };
  }

  // ==========================================================
  // COOLING AND BREAKDOWN RECOVERY
  // ==========================================================

  coolDown(vehicleId, seconds = 10) {
    const vehicle = this._vehicle(vehicleId);
    const duration = Math.max(0, number(seconds));

    vehicle.temperature = clamp(
      vehicle.temperature -
        this.config.coolingPerSecond *
          duration *
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
    const persisted = this.save();

    return {
      temperature: vehicle.temperature,
      vehicle: this.getVehicle(vehicleId),
      persisted,
    };
  }

  // ==========================================================
  // ROUTINE MAINTENANCE
  // ==========================================================

  recordTrip(vehicleId) {
    const vehicle = this._vehicle(vehicleId);

    vehicle.tripsSinceService += 1;
    vehicle.updatedAt = this._timestamp();

    const persisted = this.save();

    return {
      tripsSinceService: vehicle.tripsSinceService,
      serviceDue: vehicle.serviceDue,
      vehicle: this.getVehicle(vehicleId),
      persisted,
    };
  }

  // ==========================================================
  // HIRE-PURCHASE
  // ==========================================================

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

    const id = String(
      contractId || `hp-${this._nextId++}`,
    );

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
      throw new Error(
        'Deposit cannot exceed the total vehicle price.',
      );
    }

    const interval = Math.max(
      1,
      number(intervalDays, terms.intervalDays),
    );

    const contract = {
      id,
      vehicleId: String(vehicleId),
      buyerId: String(buyerId || 'player'),

      totalPrice: price,
      depositPaid: deposit,

      principalRemaining: Math.max(0, price - deposit),

      installment: Math.max(
        1,
        number(installment, terms.installment),
      ),

      intervalDays: interval,

      defaultLimit: Math.max(
        1,
        number(defaultLimit, terms.defaultLimit),
      ),

      missedPayments: 0,
      paymentsMade: 0,

      nextDueAt:
        number(startAt, this._timestamp()) +
        interval * 86400000,

      status: deposit >= price ? 'owned' : 'active',

      createdAt: number(startAt, this._timestamp()),
      updatedAt: number(startAt, this._timestamp()),

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

    return [...this.contracts.values()].map((contract) =>
      clone(contract),
    );
  }

  makeInstallment({
    contractId,
    amount,
    paymentConfirmed = false,
    paidAt = this._timestamp(),
  } = {}) {
    this._assertActive();

    if (!paymentConfirmed) {
      throw new Error(
        'Installment requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const contract = this.contracts.get(String(contractId));

    if (!contract) {
      throw new Error(
        `Unknown hire-purchase contract: ${contractId}`,
      );
    }

    if (contract.status === 'owned') {
      return {
        ok: true,
        contract: clone(contract),
        amountApplied: 0,
        message: 'Vehicle is already fully paid.',
      };
    }

    if (
      contract.status === 'repossessed' ||
      contract.status === 'cancelled'
    ) {
      throw new Error(
        `Contract cannot accept payments while ${contract.status}.`,
      );
    }

    const paid = clamp(
      number(amount),
      0,
      contract.principalRemaining,
    );

    if (paid <= 0) {
      throw new Error('Installment amount must be greater than zero.');
    }

    contract.principalRemaining = Math.max(
      0,
      contract.principalRemaining - paid,
    );

    contract.paymentsMade += 1;
    contract.missedPayments = 0;

    contract.nextDueAt =
      number(paidAt, this._timestamp()) +
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

    this.on('installmentPaid', {
      contractId: contract.id,
      amount: paid,
      principalRemaining: contract.principalRemaining,
      status: contract.status,
    });

    const persisted = this.save();

    return {
      ok: true,
      contract: clone(contract),
      amountApplied: paid,
      persisted,
    };
  }

  assessOverduePayments({ at = this._timestamp() } = {}) {
    this._assertActive();

    const timestamp = number(at, this._timestamp());
    const changed = [];

    for (const contract of this.contracts.values()) {
      if (
        contract.status !== 'active' ||
        timestamp <= contract.nextDueAt
      ) {
        continue;
      }

      const periodMs = contract.intervalDays * 86400000;

      const periodsLate = Math.max(
        1,
        Math.floor(
          (timestamp - contract.nextDueAt) / periodMs,
        ) + 1,
      );

      const remainingDefaults = Math.max(
        0,
        contract.defaultLimit - contract.missedPayments,
      );

      const addedMisses = Math.min(
        periodsLate,
        remainingDefaults,
      );

      contract.missedPayments += addedMisses;
      contract.nextDueAt += periodsLate * periodMs;
      contract.updatedAt = timestamp;

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

    if (changed.length > 0) this.save();

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
      throw new Error(
        `Unknown hire-purchase contract: ${contractId}`,
      );
    }

    if (!['catch_up', 'repossess', 'grace'].includes(action)) {
      throw new Error(
        'Action must be catch_up, repossess, or grace.',
      );
    }

    if (action === 'catch_up' && !paymentConfirmed) {
      throw new Error(
        'Catch-up requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    if (action === 'repossess') {
      contract.status = 'repossessed';
    } else {
      contract.status =
        contract.principalRemaining <= 0
          ? 'owned'
          : 'active';

      contract.missedPayments = 0;

      if (action === 'grace') {
        contract.nextDueAt +=
          contract.intervalDays * 86400000;
      }
    }

    contract.updatedAt = this._timestamp();

    this.on('defaultResolved', {
      contractId: contract.id,
      action,
      status: contract.status,
    });

    this.save();

    return clone(contract);
  }

  // ==========================================================
  // MAINTENANCE ADVICE
  // ==========================================================

  getMaintenanceAdvice(vehicleId) {
    const vehicle = this._vehicle(vehicleId);

    const advice = Object.entries(vehicle.parts).map(
      ([part, component]) => ({
        part,
        health: Math.round(component.health),

        urgency:
          component.health <= component.critical
            ? 'critical'
            : component.health < 40
              ? 'high'
              : component.health < 70
                ? 'medium'
                : 'low',
      }),
    );

    if (
      vehicle.temperature >= this.config.overheatingThreshold
    ) {
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
      odometerKm:
        Math.round(vehicle.odometerKm * 10) / 10,
      serviceDue: vehicle.serviceDue,
      breakdown: clone(vehicle.breakdown),
      advice,
    };
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

  dispose() {
    if (this._destroyed) return;

    // Persist before marking the instance as disposed.
    this.save();

    this._destroyed = true;
    this.callbacks = {};
    this.events = [];
  }
}

export default KanoVehicleLifecycleDirector;