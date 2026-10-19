// ============================================================
// KANO LIFE — VEHICLE LIFECYCLE DIRECTOR
//
// Maintenance, vehicle wear, breakdowns, roadside repairs,
// workshop service, health synchronisation and hire-purchase.
//
// This module does not render or move vehicles and does not
// own the player's wallet.
//
// ============================================================

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const number = (value, fallback = 0) =>
  Number.isFinite(Number(value))
    ? Number(value)
    : fallback;

const clone = (value) =>
  JSON.parse(JSON.stringify(value));

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
    fuelStress: 2.0,
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

export class KanoVehicleLifecycleDirector {
  constructor(options = {}) {
    this.config = {
      ...clone(DEFAULT_CONFIG),
      ...options,
    };

    this.config.baseRepairPrices = {
      ...DEFAULT_CONFIG.baseRepairPrices,
      ...(options.baseRepairPrices || {}),
    };

    this.config.hirePurchase = {
      ...DEFAULT_CONFIG.hirePurchase,
      ...(options.hirePurchase || {}),
    };

    this.profiles = {
      ...clone(DEFAULT_PROFILES),
      ...(options.profiles || {}),
    };

    this.callbacks = options.callbacks || {};

    this.now =
      typeof options.now === 'function'
        ? options.now
        : () => Date.now();

    this.vehicles = new Map();
    this.contracts = new Map();
    this.events = [];
    this._nextId = 1;

    if (options.state) {
      this.importState(options.state);
    } else if (this.config.autoSave) {
      this.load();
    }
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  on(type, payload) {
    const event = {
      type,
      at: this.now(),
      ...clone(payload || {}),
    };

    this.events.push(event);

    if (this.events.length > 250) {
      this.events.shift();
    }

    try {
      this.callbacks.onEvent?.(clone(event));
    } catch (_) {
      // Event callbacks must not interrupt gameplay.
    }

    const callbackName =
      `on${type[0].toUpperCase()}${type.slice(1)}`;

    try {
      this.callbacks[callbackName]?.(clone(event));
    } catch (_) {
      // Isolate callback errors.
    }

    return event;
  }

  // ==========================================================
  // STORAGE
  // ==========================================================

  save() {
    if (
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
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const raw = localStorage.getItem(
        this.config.storageKey,
      );

      if (!raw) {
        return false;
      }

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
    return {
      version: 1,
      exportedAt: this.now(),
      nextId: this._nextId,

      vehicles: [
        ...this.vehicles.entries(),
      ].map(([key, vehicle]) => [
        key,
        clone(vehicle),
      ]),

      contracts: [
        ...this.contracts.entries(),
      ].map(([key, contract]) => [
        key,
        clone(contract),
      ]),

      events: clone(this.events.slice(-100)),
    };
  }

  importState(state) {
    if (
      !state ||
      !Array.isArray(state.vehicles) ||
      !Array.isArray(state.contracts)
    ) {
      throw new Error(
        'Invalid vehicle lifecycle state.',
      );
    }

    this.vehicles = new Map(
      state.vehicles.map(([key, vehicle]) => [
        String(key),
        clone(vehicle),
      ]),
    );

    this.contracts = new Map(
      state.contracts.map(([key, contract]) => [
        String(key),
        clone(contract),
      ]),
    );

    this.events = Array.isArray(state.events)
      ? clone(state.events.slice(-250))
      : [];

    this._nextId = Math.max(
      1,
      number(state.nextId, 1),
    );

    return true;
  }

  // ==========================================================
  // VEHICLE CREATION AND RETRIEVAL
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
    const vehicleId = String(
      id || `kano-vehicle-${this._nextId++}`,
    );

    if (this.vehicles.has(vehicleId)) {
      throw new Error(
        `Vehicle already exists: ${vehicleId}`,
      );
    }

    const baseParts = {};

    for (const [part, defaults] of Object.entries(
      DEFAULT_PARTS,
    )) {
      const incoming = parts?.[part] || {};

      baseParts[part] = {
        health: clamp(
          number(incoming.health, defaults.health),
          0,
          100,
        ),

        critical: number(
          incoming.critical,
          defaults.critical,
        ),
      };
    }

    const vehicle = {
      id: vehicleId,

      type: this.profiles[type]
        ? type
        : 'keke',

      name: String(name),
      condition,

      odometerKm: Math.max(
        0,
        number(odometerKm),
      ),

      parts: baseParts,

      temperature: clamp(
        number(
          temperature,
          this.config.normalTemperature,
        ),
        20,
        180,
      ),

      serviceOdometerKm: Math.max(
        0,
        number(odometerKm),
      ),

      serviceDue: false,
      breakdown: null,
      totalRepairCost: 0,
      tripsSinceService: 0,
      lastMaintenanceAt: null,

      createdAt: this.now(),
      updatedAt: this.now(),
    };

    this.vehicles.set(vehicleId, vehicle);

    this.on('vehicleCreated', {
      vehicleId,
      vehicleType: vehicle.type,
      condition,
    });

    this.save();

    return this.getVehicle(vehicleId);
  }

  getVehicle(id) {
    const vehicle = this.vehicles.get(String(id));

    return vehicle
      ? clone(vehicle)
      : null;
  }

  listVehicles() {
    return [
      ...this.vehicles.values(),
    ].map(clone);
  }

  _vehicle(id) {
    const vehicle = this.vehicles.get(String(id));

    if (!vehicle) {
      throw new Error(
        `Unknown vehicle: ${id}`,
      );
    }

    return vehicle;
  }

  // ==========================================================
  // GAMEPLAY HEALTH SYNCHRONISATION
  //
  // Updates tracked part health from observed game health.
  // Does not invent additional damage.
  // ==========================================================

  syncPartHealth({
    vehicleId,
    parts = {},
  } = {}) {
    const vehicle = this._vehicle(vehicleId);
    const changes = [];

    for (const [part, incoming] of Object.entries(parts)) {
      if (!vehicle.parts[part]) {
        continue;
      }

      const rawHealth =
        incoming &&
        typeof incoming === 'object'
          ? incoming.health
          : incoming;

      if (
        rawHealth === undefined ||
        rawHealth === null
      ) {
        continue;
      }

      const health = clamp(
        number(
          rawHealth,
          vehicle.parts[part].health,
        ),
        0,
        100,
      );

      const previousHealth =
        vehicle.parts[part].health;

      if (
        Math.abs(previousHealth - health) < 0.001
      ) {
        continue;
      }

      vehicle.parts[part].health = health;

      changes.push({
        part,
        previousHealth: Math.round(previousHealth),
        health: Math.round(health),
        difference: Math.round(
          health - previousHealth,
        ),
      });
    }

    if (changes.length > 0) {
      vehicle.updatedAt = this.now();

      this._checkCritical(vehicle);

      this.on('gameplayHealthSynced', {
        vehicleId: vehicle.id,
        changes,
      });

      this.save();
    }

    return {
      vehicle: this.getVehicle(vehicleId),
      changes,
    };
  }

  // ==========================================================
  // DRIVING WEAR AND ENGINE TEMPERATURE
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

    const profile =
      this.profiles[vehicle.type] ||
      DEFAULT_PROFILES.keke;

    const distance = Math.max(
      0,
      number(distanceKm),
    );

    const speed = Math.max(
      0,
      number(speedKmh),
    );

    const dt = clamp(
      number(deltaSeconds, 1),
      0,
      10,
    );

    const harsh =
      (harshBraking ? 1 : 0) +
      (sharpTurning ? 1 : 0);

    let multiplier =
      1 +
      harsh *
        (this.config.harshDrivingWearMultiplier - 1) *
        0.5;

    if (roughRoad) {
      multiplier *=
        this.config.roughRoadWearMultiplier;
    }

    if (vehicle.serviceDue) {
      multiplier *=
        this.config.overdueServiceWearMultiplier;
    }

    if (heavyLoad) {
      multiplier *= 1.2;
    }

    const wear =
      distance *
      this.config.distanceWearRate *
      multiplier;

    this._wear(
      vehicle,
      'engine',
      wear * profile.engineWear,
    );

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
      wear *
        (harshBraking ? 2.3 : 0.7),
    );

    vehicle.odometerKm += distance;

    vehicle.serviceDue =
      vehicle.odometerKm -
        vehicle.serviceOdometerKm >=
      this.config.maintenanceIntervalKm;

    const overheatingRisk =
      (speed > 45 ? 0.7 : 0.25) +
      (vehicle.parts.cooling.health < 50
        ? 0.9
        : 0) +
      (vehicle.parts.engine.health < 35
        ? 0.65
        : 0);

    const engineLoad = clamp(
      overheatingRisk,
      0,
      2,
    );

    vehicle.temperature +=
      (
        this.config.temperatureRisePerSecond *
          engineLoad -
        this.config.coolingPerSecond *
          (vehicle.parts.cooling.health / 100)
      ) * dt;

    vehicle.temperature +=
      (number(ambientC, 30) - 30) *
      0.015 *
      dt;

    vehicle.temperature = clamp(
      vehicle.temperature,
      20,
      160,
    );

    if (
      vehicle.temperature >=
      this.config.overheatingThreshold
    ) {
      if (!vehicle.breakdown) {
        vehicle.breakdown = {
          type: 'overheating',

          severity: clamp(
            (
              vehicle.temperature -
              this.config.overheatingThreshold
            ) / 20 + 0.35,
            0.35,
            1,
          ),

          at: this.now(),
          resolved: false,
        };
      }

      this.on('overheating', {
        vehicleId: vehicle.id,
        temperature: Math.round(
          vehicle.temperature,
        ),
        severity: vehicle.breakdown.severity,
      });
    }

    this._checkCritical(vehicle);

    vehicle.updatedAt = this.now();

    this.save();

    return {
      vehicle: this.getVehicle(vehicle.id),
      wearMultiplier: multiplier,

      overheatingRisk: clamp(
        overheatingRisk / 2,
        0,
        1,
      ),
    };
  }

  _wear(vehicle, part, amount) {
    if (!vehicle.parts[part]) {
      return;
    }

    vehicle.parts[part].health = clamp(
      vehicle.parts[part].health -
        Math.max(0, amount),
      0,
      100,
    );
  }

  _checkCritical(vehicle) {
    const critical = Object.entries(
      vehicle.parts,
    ).find(
      ([, part]) =>
        part.health <= part.critical,
    );

    if (critical && !vehicle.breakdown) {
      const [partName, part] = critical;

      vehicle.breakdown = {
        type: `${partName}_failure`,

        severity: clamp(
          1 - part.health / 100,
          0.2,
          1,
        ),

        at: this.now(),
        resolved: false,
      };

      this.on('breakdown', {
        vehicleId: vehicle.id,
        breakdownType:
          vehicle.breakdown.type,
        part: partName,
        health: part.health,
      });
    }
  }

  // ==========================================================
  // POTHOLES AND COLLISIONS
  // ==========================================================

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

    const loss =
      clamp(number(severity, 0.25), 0, 1) *
      (
        collision
          ? 24
          : pothole
            ? 12
            : 8
      );

    this._wear(vehicle, target, loss);

    if (collision) {
      this._wear(
        vehicle,
        'body',
        loss * 0.7,
      );
    }

    if (pothole) {
      this._wear(
        vehicle,
        'tyres',
        loss * 0.35,
      );
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

    vehicle.updatedAt = this.now();

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
      ? this.config.workshopRepairEfficiency
      : this.config.roadsideRepairEfficiency;

    const profile =
      this.profiles[vehicle.type] ||
      DEFAULT_PROFILES.keke;

    const items = [];
    let total = 0;

    for (const part of [...new Set(parts)]) {
      if (!vehicle.parts[part]) {
        continue;
      }

      const missing =
        100 - vehicle.parts[part].health;

      if (missing <= 0) {
        continue;
      }

      const base = number(
        this.config.baseRepairPrices[part],
        5000,
      ) * profile.serviceCost;

      const cost = Math.ceil(
        base *
          missing /
          100 /
          Math.max(0.1, efficiency),
      );

      items.push({
        part,

        health: Math.round(
          vehicle.parts[part].health,
        ),

        healthRestored: Math.round(
          missing * efficiency,
        ),

        cost,
      });

      total += cost;
    }

    if (
      includeService &&
      vehicle.serviceDue
    ) {
      items.push({
        part: 'routine_service',
        cost: this.config.serviceBaseCost,
      });

      total += this.config.serviceBaseCost;
    }

    if (!workshop && items.length > 0) {
      total += this.config.roadsideCalloutCost;
    }

    return {
      vehicleId: vehicle.id,
      workshop,
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
    if (!paymentConfirmed) {
      throw new Error(
        'Repair requires paymentConfirmed: true after the existing wallet confirms payment.',
      );
    }

    const vehicle = this._vehicle(vehicleId);

    const quote = this.calculateRepair(
      vehicleId,
      {
        parts,
        workshop,
        includeService,
      },
    );

    const efficiency = workshop
      ? this.config.workshopRepairEfficiency
      : this.config.roadsideRepairEfficiency;

    for (const item of quote.items) {
      if (!vehicle.parts[item.part]) {
        continue;
      }

      vehicle.parts[item.part].health = clamp(
        vehicle.parts[item.part].health +
          item.healthRestored,
        0,
        100,
      );
    }

    if (includeService) {
      vehicle.serviceOdometerKm =
        vehicle.odometerKm;

      vehicle.serviceDue = false;

      vehicle.lastMaintenanceAt = this.now();
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

      return component.health >
        component.critical;
    });

    if (
      vehicle.breakdown &&
      criticalPartsHealthy
    ) {
      vehicle.breakdown = null;

      vehicle.temperature = Math.min(
        vehicle.temperature,
        this.config.normalTemperature + 5,
      );

      this.on('breakdownResolved', {
        vehicleId: vehicle.id,
      });
    }

    this.on('vehicleRepaired', {
      vehicleId: vehicle.id,
      total: quote.total,
      workshop,

      items: quote.items.map(
        (item) => item.part,
      ),
    });

    vehicle.updatedAt = this.now();

    this.save();

    return {
      quote,
      vehicle: this.getVehicle(vehicleId),
      efficiency,
    };
  }

  // ==========================================================
  // ENGINE COOLING
  // ==========================================================

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
      vehicle.temperature <
        this.config.overheatingThreshold &&
      vehicle.breakdown?.type === 'overheating' &&
      vehicle.parts.engine.health >
        vehicle.parts.engine.critical
    ) {
      vehicle.breakdown = null;

      this.on('breakdownResolved', {
        vehicleId: vehicle.id,
        method: 'cooled_down',
      });
    }

    vehicle.updatedAt = this.now();

    this.save();

    return {
      temperature: vehicle.temperature,
      vehicle: this.getVehicle(vehicleId),
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
    startAt = this.now(),
  } = {}) {
    const id = String(
      contractId || `hp-${this._nextId++}`,
    );

    if (this.contracts.has(id)) {
      throw new Error(
        `Contract already exists: ${id}`,
      );
    }

    const terms = this.config.hirePurchase;

    const price = Math.max(
      1,
      number(totalPrice, terms.totalPrice),
    );

    const deposit = Math.max(
      0,
      number(depositPaid),
    );

    const requiredDeposit = Math.max(
      0,
      number(terms.deposit),
    );

    if (deposit < requiredDeposit) {
      throw new Error(
        `Deposit insufficient: ${
          requiredDeposit - deposit
        } more required.`,
      );
    }

    const contract = {
      id,
      vehicleId: String(vehicleId),
      buyerId: String(buyerId || 'player'),

      totalPrice: price,
      depositPaid: deposit,

      principalRemaining: Math.max(
        0,
        price - deposit,
      ),

      installment: Math.max(
        1,
        number(installment, terms.installment),
      ),

      intervalDays: Math.max(
        1,
        number(intervalDays, terms.intervalDays),
      ),

      defaultLimit: Math.max(
        1,
        number(defaultLimit, terms.defaultLimit),
      ),

      missedPayments: 0,
      paymentsMade: 0,

      nextDueAt:
        number(startAt) +
        Math.max(
          1,
          number(intervalDays, terms.intervalDays),
        ) *
          86400000,

      status:
        deposit >= price
          ? 'owned'
          : 'active',

      createdAt: number(startAt),
      updatedAt: number(startAt),

      paymentHistory: [],
    };

    this.contracts.set(id, contract);

    this.on('hirePurchaseCreated', {
      contractId: id,
      vehicleId: contract.vehicleId,
      principalRemaining:
        contract.principalRemaining,
      status: contract.status,
    });

    this.save();

    return clone(contract);
  }

  getContract(id) {
    const contract =
      this.contracts.get(String(id));

    return contract
      ? clone(contract)
      : null;
  }

  listContracts() {
    return [
      ...this.contracts.values(),
    ].map(clone);
  }

  makeInstallment({
    contractId,
    amount,
    paymentConfirmed = false,
    paidAt = this.now(),
  } = {}) {
    if (!paymentConfirmed) {
      throw new Error(
        'Installment requires paymentConfirmed: true after wallet confirmation.',
      );
    }

    const contract =
      this.contracts.get(String(contractId));

    if (!contract) {
      throw new Error(
        `Unknown hire-purchase contract: ${contractId}`,
      );
    }

    if (contract.status === 'owned') {
      return {
        contract: clone(contract),
        amountApplied: 0,
        message: 'Vehicle is already fully paid.',
      };
    }

    if (contract.status === 'repossessed') {
      throw new Error(
        'Contract is repossessed and cannot accept normal installments.',
      );
    }

    const paid = clamp(
      number(amount),
      0,
      contract.principalRemaining,
    );

    if (paid <= 0) {
      throw new Error(
        'Installment amount must be greater than zero.',
      );
    }

    contract.principalRemaining = Math.max(
      0,
      contract.principalRemaining - paid,
    );

    contract.paymentsMade += 1;
    contract.missedPayments = 0;

    contract.nextDueAt =
      number(paidAt) +
      contract.intervalDays * 86400000;

    contract.updatedAt = number(paidAt);

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
      principalRemaining:
        contract.principalRemaining,
      status: contract.status,
    });

    this.save();

    return {
      contract: clone(contract),
      amountApplied: paid,
    };
  }

  assessOverduePayments({
    at = this.now(),
  } = {}) {
    const changed = [];

    for (const contract of this.contracts.values()) {
      if (
        contract.status !== 'active' ||
        number(at) <= contract.nextDueAt
      ) {
        continue;
      }

      const periodsLate = Math.max(
        1,
        Math.floor(
          (
            number(at) -
            contract.nextDueAt
          ) /
            (
              contract.intervalDays *
              86400000
            ),
        ) + 1,
      );

      const add = Math.min(
        periodsLate,
        contract.defaultLimit -
          contract.missedPayments,
      );

      if (add > 0) {
        contract.missedPayments += add;
      }

      contract.nextDueAt +=
        periodsLate *
        contract.intervalDays *
        86400000;

      contract.updatedAt = number(at);

      if (
        contract.missedPayments >=
        contract.defaultLimit
      ) {
        contract.status = 'at_risk';
      }

      changed.push(clone(contract));

      this.on('installmentOverdue', {
        contractId: contract.id,
        missedPayments:
          contract.missedPayments,
        status: contract.status,
      });
    }

    if (changed.length > 0) {
      this.save();
    }

    return changed;
  }

  resolveDefault({
    contractId,
    action,
    paymentConfirmed = false,
  } = {}) {
    const contract =
      this.contracts.get(String(contractId));

    if (!contract) {
      throw new Error(
        `Unknown hire-purchase contract: ${contractId}`,
      );
    }

    if (
      ![
        'catch_up',
        'repossess',
        'grace',
      ].includes(action)
    ) {
      throw new Error(
        'Action must be catch_up, repossess, or grace.',
      );
    }

    if (
      action === 'catch_up' &&
      !paymentConfirmed
    ) {
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

    contract.updatedAt = this.now();

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

    const advice = Object.entries(
      vehicle.parts,
    ).map(([part, component]) => ({
      part,

      health: Math.round(
        component.health,
      ),

      urgency:
        component.health <= component.critical
          ? 'critical'
          : component.health < 40
            ? 'high'
            : component.health < 70
              ? 'medium'
              : 'low',
    }));

    if (
      vehicle.temperature >=
      this.config.overheatingThreshold
    ) {
      advice.unshift({
        part: 'temperature',
        health: Math.round(vehicle.temperature),
        urgency: 'critical',
        message:
          'Stop safely and let the engine cool.',
      });
    }

    if (vehicle.serviceDue) {
      advice.push({
        part: 'routine_service',
        urgency: 'high',
        message:
          'Scheduled maintenance is overdue.',
      });
    }

    return {
      vehicleId: vehicle.id,

      odometerKm: Math.round(
        vehicle.odometerKm * 10,
      ) / 10,

      serviceDue: vehicle.serviceDue,
      breakdown: clone(vehicle.breakdown),
      advice,
    };
  }
}

export default KanoVehicleLifecycleDirector;