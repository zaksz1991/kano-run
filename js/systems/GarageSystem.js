const VEHICLE_CATALOG = Object.freeze([
  {
    id: "standard",
    name: "Standard Adaidaita",
    type: "keke",
    price: 0,
    unlockLevel: 1,
    capacity: 3,
    speed: 1,
    handling: 1,
    fuelEfficiency: 1,
    description: "Reliable everyday Kano transport.",
  },
  {
    id: "green",
    name: "Green Commercial",
    type: "keke",
    price: 12000,
    unlockLevel: 2,
    capacity: 3,
    speed: 1.05,
    handling: 1.05,
    fuelEfficiency: 1,
    description: "A dependable commercial workhorse.",
  },
  {
    id: "luxury",
    name: "Luxury Adaidaita",
    type: "keke",
    price: 25000,
    unlockLevel: 3,
    capacity: 3,
    speed: 1.12,
    handling: 1.1,
    fuelEfficiency: 0.95,
    description: "Improved handling and a faster engine.",
  },
  {
    id: "cargo",
    name: "Cargo Carrier",
    type: "cargo",
    price: 35000,
    unlockLevel: 5,
    capacity: 2,
    speed: 0.92,
    handling: 0.9,
    fuelEfficiency: 1.15,
    description: "Built for cargo and delivery missions.",
  },
  {
    id: "open",
    name: "Open-Side Keke",
    type: "keke",
    price: 50000,
    unlockLevel: 7,
    capacity: 4,
    speed: 1.08,
    handling: 1.05,
    fuelEfficiency: 0.95,
    description: "Extra passenger capacity for busy routes.",
  },
  {
    id: "police",
    name: "Police Patrol",
    type: "special",
    price: 85000,
    unlockLevel: 10,
    capacity: 2,
    speed: 1.2,
    handling: 1.2,
    fuelEfficiency: 0.85,
    description: "A high-performance patrol vehicle.",
  },
  {
    id: "karota",
    name: "KAROTA Special",
    type: "special",
    price: 120000,
    unlockLevel: 12,
    capacity: 3,
    speed: 1.25,
    handling: 1.15,
    fuelEfficiency: 0.8,
    description: "A premium Kano road-operations vehicle.",
  },
]);

const PAINT_CATALOG = Object.freeze([
  { id: "classic", name: "Classic Yellow", color: "#f4bd32", price: 0, unlockLevel: 1 },
  { id: "green", name: "Commercial Green", color: "#188447", price: 2500, unlockLevel: 1 },
  { id: "blue", name: "Kano Blue", color: "#1679c4", price: 4000, unlockLevel: 2 },
  { id: "white", name: "Pearl White", color: "#f3f3ee", price: 5000, unlockLevel: 3 },
  { id: "red", name: "Signal Red", color: "#d83434", price: 6000, unlockLevel: 4 },
  { id: "black", name: "Midnight Black", color: "#242832", price: 8000, unlockLevel: 5 },
  { id: "purple", name: "Royal Purple", color: "#793dc2", price: 10000, unlockLevel: 7 },
  { id: "sand", name: "Desert Sand", color: "#c5a46d", price: 12000, unlockLevel: 9 },
]);

const DEFAULT_GARAGE = Object.freeze({
  ownedVehicles: ["standard"],
  ownedPaints: ["classic"],
  selectedVehicle: "standard",
  selectedPaint: "classic",
  upgrades: {
    engine: 0,
    handling: 0,
    fuelTank: 0,
  },
});

const UPGRADE_CATALOG = Object.freeze({
  engine: {
    name: "Engine",
    maxLevel: 5,
    basePrice: 8000,
    priceMultiplier: 1.65,
    description: "Improves acceleration and top speed.",
  },
  handling: {
    name: "Handling",
    maxLevel: 5,
    basePrice: 6000,
    priceMultiplier: 1.6,
    description: "Improves steering response and control.",
  },
  fuelTank: {
    name: "Fuel Tank",
    maxLevel: 5,
    basePrice: 5000,
    priceMultiplier: 1.55,
    description: "Increases maximum fuel capacity.",
  },
});

export default class GarageSystem {
  constructor({
    gameState,
    eventBus = null,
    saveManager = null,
  } = {}) {
    if (!gameState) {
      throw new Error("GarageSystem requires gameState.");
    }

    this.gameState = gameState;
    this.eventBus = eventBus;
    this.saveManager = saveManager;

    this.profile = this.getInitialGarage();

    this.emit("garage:ready", this.getSnapshot());
  }

  getInitialGarage() {
    const savedProfile =
      this.gameState.profile?.garage ??
      this.gameState.profile?.progression?.garage ??
      null;

    const source = savedProfile ?? DEFAULT_GARAGE;

    return {
      ownedVehicles: this.unique([
        "standard",
        ...(source.ownedVehicles ?? []),
      ]),
      ownedPaints: this.unique([
        "classic",
        ...(source.ownedPaints ?? []),
      ]),
      selectedVehicle: source.selectedVehicle ?? "standard",
      selectedPaint: source.selectedPaint ?? "classic",
      upgrades: {
        ...DEFAULT_GARAGE.upgrades,
        ...(source.upgrades ?? {}),
      },
    };
  }

  unique(values) {
    return [...new Set(values)];
  }

  getLevel() {
    return Math.max(
      1,
      Number(
        this.gameState.profile?.level ??
        this.gameState.profile?.progression?.level ??
        1
      )
    );
  }

  getMoney() {
    return Math.max(
      0,
      Number(
        this.gameState.profile?.money ??
        this.gameState.profile?.wallet ??
        0
      )
    );
  }

  getVehicle(vehicleId) {
    return VEHICLE_CATALOG.find((vehicle) => vehicle.id === vehicleId) ?? null;
  }

  getPaint(paintId) {
    return PAINT_CATALOG.find((paint) => paint.id === paintId) ?? null;
  }

  getUpgrade(upgradeId) {
    return UPGRADE_CATALOG[upgradeId] ?? null;
  }

  getVehicleCatalog() {
    const level = this.getLevel();

    return VEHICLE_CATALOG.map((vehicle) => ({
      ...vehicle,
      owned: this.profile.ownedVehicles.includes(vehicle.id),
      selected: this.profile.selectedVehicle === vehicle.id,
      unlocked: level >= vehicle.unlockLevel,
      canAfford: this.getMoney() >= vehicle.price,
    }));
  }

  getPaintCatalog() {
    const level = this.getLevel();

    return PAINT_CATALOG.map((paint) => ({
      ...paint,
      owned: this.profile.ownedPaints.includes(paint.id),
      selected: this.profile.selectedPaint === paint.id,
      unlocked: level >= paint.unlockLevel,
      canAfford: this.getMoney() >= paint.price,
    }));
  }

  getUpgradeCatalog() {
    return Object.entries(UPGRADE_CATALOG).map(([id, upgrade]) => {
      const currentLevel = Number(this.profile.upgrades[id] ?? 0);
      const nextLevel = currentLevel + 1;
      const maxed = currentLevel >= upgrade.maxLevel;

      return {
        id,
        ...upgrade,
        currentLevel,
        nextLevel,
        maxed,
        nextPrice: maxed
          ? null
          : Math.round(
              upgrade.basePrice *
              Math.pow(upgrade.priceMultiplier, currentLevel)
            ),
      };
    });
  }

  buyVehicle(vehicleId) {
    const vehicle = this.getVehicle(vehicleId);

    if (!vehicle) {
      return this.fail("vehicle_not_found", "Vehicle does not exist.");
    }

    if (this.profile.ownedVehicles.includes(vehicleId)) {
      return this.selectVehicle(vehicleId);
    }

    if (this.getLevel() < vehicle.unlockLevel) {
      return this.fail(
        "level_locked",
        `Reach level ${vehicle.unlockLevel} to unlock this vehicle.`
      );
    }

    if (this.getMoney() < vehicle.price) {
      return this.fail("insufficient_funds", "Not enough money.");
    }

    if (!this.spendMoney(vehicle.price, `vehicle:${vehicleId}`)) {
      return this.fail("payment_failed", "Vehicle purchase failed.");
    }

    this.profile.ownedVehicles.push(vehicleId);
    this.profile.selectedVehicle = vehicleId;

    this.persist();
    this.emit("garage:vehicle-purchased", {
      vehicle,
      balance: this.getMoney(),
    });

    return this.success("Vehicle purchased.", {
      vehicle,
      snapshot: this.getSnapshot(),
    });
  }

  selectVehicle(vehicleId) {
    const vehicle = this.getVehicle(vehicleId);

    if (!vehicle) {
      return this.fail("vehicle_not_found", "Vehicle does not exist.");
    }

    if (!this.profile.ownedVehicles.includes(vehicleId)) {
      return this.fail("vehicle_not_owned", "Purchase this vehicle first.");
    }

    this.profile.selectedVehicle = vehicleId;

    this.persist();
    this.emit("garage:vehicle-selected", {
      vehicle,
      stats: this.getVehicleStats(),
    });

    return this.success("Vehicle selected.", {
      vehicle,
      stats: this.getVehicleStats(),
    });
  }

  buyPaint(paintId) {
    const paint = this.getPaint(paintId);

    if (!paint) {
      return this.fail("paint_not_found", "Paint does not exist.");
    }

    if (this.profile.ownedPaints.includes(paintId)) {
      return this.selectPaint(paintId);
    }

    if (this.getLevel() < paint.unlockLevel) {
      return this.fail(
        "level_locked",
        `Reach level ${paint.unlockLevel} to unlock this paint.`
      );
    }

    if (this.getMoney() < paint.price) {
      return this.fail("insufficient_funds", "Not enough money.");
    }

    if (!this.spendMoney(paint.price, `paint:${paintId}`)) {
      return this.fail("payment_failed", "Paint purchase failed.");
    }

    this.profile.ownedPaints.push(paintId);
    this.profile.selectedPaint = paintId;

    this.persist();
    this.emit("garage:paint-purchased", {
      paint,
      balance: this.getMoney(),
    });

    return this.success("Paint purchased.", {
      paint,
      snapshot: this.getSnapshot(),
    });
  }

  selectPaint(paintId) {
    const paint = this.getPaint(paintId);

    if (!paint) {
      return this.fail("paint_not_found", "Paint does not exist.");
    }

    if (!this.profile.ownedPaints.includes(paintId)) {
      return this.fail("paint_not_owned", "Purchase this paint first.");
    }

    this.profile.selectedPaint = paintId;

    this.persist();
    this.emit("garage:paint-selected", {
      paint,
      vehicleId: this.profile.selectedVehicle,
    });

    return this.success("Paint selected.", { paint });
  }

  buyUpgrade(upgradeId) {
    const upgrade = this.getUpgrade(upgradeId);

    if (!upgrade) {
      return this.fail("upgrade_not_found", "Upgrade does not exist.");
    }

    const currentLevel = Number(this.profile.upgrades[upgradeId] ?? 0);

    if (currentLevel >= upgrade.maxLevel) {
      return this.fail("upgrade_maxed", "This upgrade is already maxed.");
    }

    const price = Math.round(
      upgrade.basePrice *
      Math.pow(upgrade.priceMultiplier, currentLevel)
    );

    if (this.getMoney() < price) {
      return this.fail("insufficient_funds", "Not enough money.");
    }

    if (!this.spendMoney(price, `upgrade:${upgradeId}`)) {
      return this.fail("payment_failed", "Upgrade purchase failed.");
    }

    this.profile.upgrades[upgradeId] = currentLevel + 1;

    this.persist();

    const result = {
      id: upgradeId,
      level: this.profile.upgrades[upgradeId],
      stats: this.getVehicleStats(),
    };

    this.emit("garage:upgrade-purchased", result);

    return this.success("Upgrade installed.", result);
  }

  getVehicleStats() {
    const vehicle = this.getVehicle(this.profile.selectedVehicle);

    if (!vehicle) {
      return null;
    }

    const engineLevel = Number(this.profile.upgrades.engine ?? 0);
    const handlingLevel = Number(this.profile.upgrades.handling ?? 0);
    const fuelLevel = Number(this.profile.upgrades.fuelTank ?? 0);

    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      capacity: vehicle.capacity,
      speedMultiplier: Number(
        (vehicle.speed * (1 + engineLevel * 0.06)).toFixed(3)
      ),
      handlingMultiplier: Number(
        (vehicle.handling * (1 + handlingLevel * 0.08)).toFixed(3)
      ),
      fuelEfficiency: vehicle.fuelEfficiency,
      fuelCapacity: 100 + fuelLevel * 20,
      upgrades: { ...this.profile.upgrades },
      paint: this.getPaint(this.profile.selectedPaint),
    };
  }

  getSnapshot() {
    return {
      ...this.profile,
      ownedVehicles: [...this.profile.ownedVehicles],
      ownedPaints: [...this.profile.ownedPaints],
      upgrades: { ...this.profile.upgrades },
      balance: this.getMoney(),
      level: this.getLevel(),
      selectedVehicle: this.getVehicle(this.profile.selectedVehicle),
      selectedPaint: this.getPaint(this.profile.selectedPaint),
      vehicleStats: this.getVehicleStats(),
      vehicles: this.getVehicleCatalog(),
      paints: this.getPaintCatalog(),
      availableUpgrades: this.getUpgradeCatalog(),
    };
  }

  spendMoney(amount, reason) {
    if (!Number.isFinite(amount) || amount < 0) {
      return false;
    }

    if (amount === 0) {
      return true;
    }

    const before = this.getMoney();

    if (before < amount) {
      return false;
    }

    const after = before - amount;

    if ("money" in (this.gameState.profile ?? {})) {
      this.gameState.profile.money = after;
    } else if ("wallet" in (this.gameState.profile ?? {})) {
      this.gameState.profile.wallet = after;
    } else {
      this.gameState.profile.money = after;
    }

    this.emit("economy:spent", {
      amount,
      reason,
      balance: after,
    });

    return true;
  }

  persist() {
    if (this.gameState.profile) {
      this.gameState.profile.garage = {
        ...this.profile,
        ownedVehicles: [...this.profile.ownedVehicles],
        ownedPaints: [...this.profile.ownedPaints],
        upgrades: { ...this.profile.upgrades },
      };
    }

    if (typeof this.saveManager?.saveProfile === "function") {
      this.saveManager.saveProfile(this.gameState.profile);
    } else if (typeof this.saveManager?.save === "function") {
      this.saveManager.save();
    }

    this.emit("garage:updated", this.getSnapshot());
  }

  success(message, data = {}) {
    return { ok: true, message, ...data };
  }

  fail(code, message) {
    const result = { ok: false, code, message };
    this.emit("garage:error", result);
    return result;
  }

  emit(eventName, payload = {}) {
    this.eventBus?.emit?.(eventName, payload);
  }

  destroy() {
    this.eventBus = null;
    this.saveManager = null;
  }
}

export {
  VEHICLE_CATALOG,
  PAINT_CATALOG,
  UPGRADE_CATALOG,
  DEFAULT_GARAGE,
};