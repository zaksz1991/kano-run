const DECALS = Object.freeze([
  {
    id: "none",
    name: "No Decal",
    price: 0,
    unlockLevel: 1,
    color: null,
  },
  {
    id: "ruffneck",
    name: "RuffNeck",
    price: 5000,
    unlockLevel: 2,
    color: "#00b4d8",
  },
  {
    id: "kano",
    name: "Kano Pride",
    price: 3500,
    unlockLevel: 2,
    color: "#188447",
  },
  {
    id: "arewa",
    name: "Arewa Heritage",
    price: 6000,
    unlockLevel: 4,
    color: "#fbbf24",
  },
  {
    id: "racing",
    name: "Street Racer",
    price: 10000,
    unlockLevel: 6,
    color: "#e63946",
  },
  {
    id: "royal",
    name: "Royal Crest",
    price: 15000,
    unlockLevel: 9,
    color: "#793dc2",
  },
]);

const ACCESSORIES = Object.freeze([
  {
    id: "roof_lights",
    name: "Roof Lights",
    price: 7000,
    unlockLevel: 3,
    category: "lighting",
  },
  {
    id: "sport_rims",
    name: "Sport Rims",
    price: 9000,
    unlockLevel: 4,
    category: "wheels",
  },
  {
    id: "front_guard",
    name: "Front Guard",
    price: 6000,
    unlockLevel: 3,
    category: "body",
  },
  {
    id: "side_stripes",
    name: "Side Stripes",
    price: 4000,
    unlockLevel: 2,
    category: "decoration",
  },
  {
    id: "premium_seat",
    name: "Premium Seat",
    price: 12000,
    unlockLevel: 5,
    category: "interior",
  },
  {
    id: "horn_upgrade",
    name: "Premium Horn",
    price: 5000,
    unlockLevel: 2,
    category: "audio",
  },
]);

const DEFAULT_CUSTOMIZATION = Object.freeze({
  selectedDecal: "none",
  ownedDecals: ["none"],
  ownedAccessories: [],
  selectedAccessories: [],
});

export default class CustomizationSystem {
  constructor({
    gameState,
    eventBus = null,
    saveManager = null,
    garageSystem = null,
  } = {}) {
    if (!gameState) {
      throw new Error("CustomizationSystem requires gameState.");
    }

    this.gameState = gameState;
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.garageSystem = garageSystem;

    const saved =
      this.gameState.profile?.customization ??
      DEFAULT_CUSTOMIZATION;

    this.profile = {
      selectedDecal: saved.selectedDecal ?? "none",
      ownedDecals: this.unique([
        "none",
        ...(saved.ownedDecals ?? []),
      ]),
      ownedAccessories: this.unique(
        saved.ownedAccessories ?? []
      ),
      selectedAccessories: this.unique(
        saved.selectedAccessories ?? []
      ),
    };

    this.emit("customization:ready", this.getSnapshot());
  }

  unique(items) {
    return [...new Set(items)];
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

  getBalance() {
    return Math.max(
      0,
      Number(
        this.gameState.profile?.money ??
        this.gameState.profile?.wallet ??
        0
      )
    );
  }

  getDecal(decalId) {
    return DECALS.find((item) => item.id === decalId) ?? null;
  }

  getAccessory(accessoryId) {
    return (
      ACCESSORIES.find((item) => item.id === accessoryId) ??
      null
    );
  }

  getDecalCatalog() {
    const level = this.getLevel();

    return DECALS.map((decal) => ({
      ...decal,
      owned: this.profile.ownedDecals.includes(decal.id),
      selected: this.profile.selectedDecal === decal.id,
      unlocked: level >= decal.unlockLevel,
      affordable: this.getBalance() >= decal.price,
    }));
  }

  getAccessoryCatalog() {
    const level = this.getLevel();

    return ACCESSORIES.map((accessory) => ({
      ...accessory,
      owned: this.profile.ownedAccessories.includes(
        accessory.id
      ),
      selected: this.profile.selectedAccessories.includes(
        accessory.id
      ),
      unlocked: level >= accessory.unlockLevel,
      affordable: this.getBalance() >= accessory.price,
    }));
  }

  purchaseDecal(decalId) {
    const decal = this.getDecal(decalId);

    if (!decal) {
      return this.fail(
        "decal_not_found",
        "Decal does not exist."
      );
    }

    if (this.profile.ownedDecals.includes(decalId)) {
      return this.selectDecal(decalId);
    }

    if (this.getLevel() < decal.unlockLevel) {
      return this.fail(
        "level_locked",
        `Reach level ${decal.unlockLevel} to unlock this decal.`
      );
    }

    if (!this.charge(decal.price, `decal:${decalId}`)) {
      return this.fail(
        "insufficient_funds",
        "Not enough money to purchase this decal."
      );
    }

    this.profile.ownedDecals.push(decalId);
    this.profile.selectedDecal = decalId;

    this.persist();

    this.emit("customization:decal-purchased", {
      decal,
      balance: this.getBalance(),
    });

    return this.success("Decal purchased.", {
      decal,
      snapshot: this.getSnapshot(),
    });
  }

  selectDecal(decalId) {
    const decal = this.getDecal(decalId);

    if (!decal) {
      return this.fail(
        "decal_not_found",
        "Decal does not exist."
      );
    }

    if (!this.profile.ownedDecals.includes(decalId)) {
      return this.fail(
        "decal_not_owned",
        "Purchase this decal first."
      );
    }

    this.profile.selectedDecal = decalId;

    this.persist();

    this.emit("customization:decal-selected", {
      decal,
      customization: this.getAppearance(),
    });

    return this.success("Decal selected.", { decal });
  }

  purchaseAccessory(accessoryId) {
    const accessory = this.getAccessory(accessoryId);

    if (!accessory) {
      return this.fail(
        "accessory_not_found",
        "Accessory does not exist."
      );
    }

    if (
      this.profile.ownedAccessories.includes(accessoryId)
    ) {
      return this.selectAccessory(accessoryId);
    }

    if (this.getLevel() < accessory.unlockLevel) {
      return this.fail(
        "level_locked",
        `Reach level ${accessory.unlockLevel} to unlock this accessory.`
      );
    }

    if (
      !this.charge(
        accessory.price,
        `accessory:${accessoryId}`
      )
    ) {
      return this.fail(
        "insufficient_funds",
        "Not enough money to purchase this accessory."
      );
    }

    this.profile.ownedAccessories.push(accessoryId);
    this.profile.selectedAccessories.push(accessoryId);

    this.persist();

    this.emit("customization:accessory-purchased", {
      accessory,
      selectedAccessories: [
        ...this.profile.selectedAccessories,
      ],
    });

    return this.success("Accessory purchased.", {
      accessory,
      snapshot: this.getSnapshot(),
    });
  }

  selectAccessory(accessoryId) {
    const accessory = this.getAccessory(accessoryId);

    if (!accessory) {
      return this.fail(
        "accessory_not_found",
        "Accessory does not exist."
      );
    }

    if (
      !this.profile.ownedAccessories.includes(accessoryId)
    ) {
      return this.fail(
        "accessory_not_owned",
        "Purchase this accessory first."
      );
    }

    if (
      this.profile.selectedAccessories.includes(accessoryId)
    ) {
      return this.success(
        "Accessory is already selected.",
        { accessory }
      );
    }

    this.profile.selectedAccessories.push(accessoryId);

    this.persist();

    this.emit("customization:accessory-selected", {
      accessory,
      selectedAccessories: [
        ...this.profile.selectedAccessories,
      ],
    });

    return this.success("Accessory selected.", {
      accessory,
    });
  }

  removeAccessory(accessoryId) {
    if (
      !this.profile.selectedAccessories.includes(accessoryId)
    ) {
      return this.fail(
        "accessory_not_selected",
        "This accessory is not currently equipped."
      );
    }

    this.profile.selectedAccessories =
      this.profile.selectedAccessories.filter(
        (id) => id !== accessoryId
      );

    this.persist();

    this.emit("customization:accessory-removed", {
      accessoryId,
      selectedAccessories: [
        ...this.profile.selectedAccessories,
      ],
    });

    return this.success("Accessory removed.", {
      accessoryId,
    });
  }

  charge(amount, reason) {
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      this.getBalance() < amount
    ) {
      return false;
    }

    if (amount === 0) {
      return true;
    }

    const profile = this.gameState.profile;

    if (!profile) {
      return false;
    }

    const current = this.getBalance();
    const updated = current - amount;

    if ("money" in profile) {
      profile.money = updated;
    } else if ("wallet" in profile) {
      profile.wallet = updated;
    } else {
      profile.money = updated;
    }

    this.emit("economy:spent", {
      amount,
      reason,
      balance: updated,
    });

    return true;
  }

  getAppearance() {
    const decal = this.getDecal(
      this.profile.selectedDecal
    );

    const paint =
      this.garageSystem?.getPaint?.(
        this.garageSystem.profile?.selectedPaint
      ) ?? null;

    return {
      vehicleId:
        this.garageSystem?.profile?.selectedVehicle ??
        "standard",
      paint,
      decal,
      accessories: this.profile.selectedAccessories
        .map((id) => this.getAccessory(id))
        .filter(Boolean),
    };
  }

  getSnapshot() {
    return {
      ...this.profile,
      ownedDecals: [...this.profile.ownedDecals],
      ownedAccessories: [...this.profile.ownedAccessories],
      selectedAccessories: [
        ...this.profile.selectedAccessories,
      ],
      balance: this.getBalance(),
      level: this.getLevel(),
      decals: this.getDecalCatalog(),
      accessories: this.getAccessoryCatalog(),
      appearance: this.getAppearance(),
    };
  }

  persist() {
    if (this.gameState.profile) {
      this.gameState.profile.customization = {
        ...this.profile,
        ownedDecals: [...this.profile.ownedDecals],
        ownedAccessories: [...this.profile.ownedAccessories],
        selectedAccessories: [
          ...this.profile.selectedAccessories,
        ],
      };
    }

    if (
      typeof this.saveManager?.saveProfile === "function"
    ) {
      this.saveManager.saveProfile(this.gameState.profile);
    } else if (typeof this.saveManager?.save === "function") {
      this.saveManager.save();
    }

    this.emit("customization:updated", this.getSnapshot());
  }

  success(message, data = {}) {
    return { ok: true, message, ...data };
  }

  fail(code, message) {
    const result = { ok: false, code, message };

    this.emit("customization:error", result);

    return result;
  }

  emit(eventName, payload = {}) {
    this.eventBus?.emit?.(eventName, payload);
  }

  destroy() {
    this.eventBus = null;
    this.saveManager = null;
    this.garageSystem = null;
  }
}

export {
  DECALS,
  ACCESSORIES,
  DEFAULT_CUSTOMIZATION,
};