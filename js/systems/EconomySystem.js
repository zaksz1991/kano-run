import GAME_CONFIG from "../core/config.js";

const DEFAULT_ECONOMY = Object.freeze({
  startingMoney: 1500,
  minimumFare: 100,
  baseFare: 250,
  farePerMeter: 0.08,
  passengerTipChance: 0.2,
  maximumTipMultiplier: 0.5,
  fuelPricePerUnit: 8,
  repairBaseCost: 250,
  repairCostPerDamage: 12,
  hornCost: 0,
  nearMissBonus: 25,
  cleanTripBonus: 150,
});

export default class EconomySystem {
  constructor({ gameState, eventBus, saveManager, settings = {} }) {
    if (!gameState) {
      throw new Error("EconomySystem requires gameState.");
    }

    this.gameState = gameState;
    this.eventBus = eventBus ?? null;
    this.saveManager = saveManager ?? null;

    this.settings = {
      ...DEFAULT_ECONOMY,
      ...settings,
    };

    this.destroyed = false;
    this.listeners = [];
    this.transactionSequence = 0;

    this.ensureWallet();
    this.bindEvents();
  }

  ensureWallet() {
    const profile = this.gameState.profile;

    if (!Number.isFinite(Number(profile.money))) {
      profile.money = this.settings.startingMoney;
    }

    profile.money = Math.max(0, Math.floor(Number(profile.money)));

    if (!profile.economy || typeof profile.economy !== "object") {
      profile.economy = {
        totalEarned: 0,
        totalSpent: 0,
        totalFares: 0,
        totalTips: 0,
        totalFuelCost: 0,
        totalRepairCost: 0,
        transactions: [],
      };
    }

    const economy = profile.economy;

    for (const key of [
      "totalEarned",
      "totalSpent",
      "totalFares",
      "totalTips",
      "totalFuelCost",
      "totalRepairCost",
    ]) {
      economy[key] = Math.max(0, Number(economy[key]) || 0);
    }

    if (!Array.isArray(economy.transactions)) {
      economy.transactions = [];
    }

    return economy;
  }

  bindEvents() {
    this.listen(this.eventBus, "passengers:delivered", (payload) => {
      this.handlePassengerDelivery(payload);
    });

    this.listen(this.eventBus, "traffic:near-miss", () => {
      this.awardNearMissBonus();
    });

    this.listen(this.eventBus, "run:finished", (payload) => {
      this.awardTripBonus(payload);
    });
  }

  listen(source, eventName, callback) {
    if (!source || typeof source.on !== "function") return;

    const unsubscribe = source.on(eventName, callback);

    if (typeof unsubscribe === "function") {
      this.listeners.push(unsubscribe);
    } else if (typeof source.off === "function") {
      this.listeners.push(() => source.off(eventName, callback));
    }
  }

  getBalance() {
    return Math.max(0, Math.floor(Number(this.gameState.profile.money) || 0));
  }

  getStatistics() {
    const economy = this.gameState.profile.economy;

    return {
      balance: this.getBalance(),
      totalEarned: economy.totalEarned,
      totalSpent: economy.totalSpent,
      totalFares: economy.totalFares,
      totalTips: economy.totalTips,
      totalFuelCost: economy.totalFuelCost,
      totalRepairCost: economy.totalRepairCost,
      transactionCount: economy.transactions.length,
    };
  }

  calculateFare({
    distance = 0,
    baseFare = this.settings.baseFare,
    demandMultiplier = 1,
    weatherMultiplier = 1,
    timeMultiplier = 1,
  } = {}) {
    const safeDistance = Math.max(0, Number(distance) || 0);
    const safeBaseFare = Math.max(0, Number(baseFare) || 0);

    const multipliers = [
      demandMultiplier,
      weatherMultiplier,
      timeMultiplier,
    ].map((value) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(3, Math.max(0.5, number)) : 1;
    });

    const distanceFare = safeDistance * this.settings.farePerMeter;

    const fare = Math.round(
      Math.max(
        this.settings.minimumFare,
        (safeBaseFare + distanceFare) *
          multipliers.reduce((total, value) => total * value, 1)
      )
    );

    return fare;
  }

  handlePassengerDelivery(payload = {}) {
    if (payload.economyProcessed === true) return;

    const fare = Math.max(
      0,
      Math.floor(Number(payload.fare ?? payload.amount) || 0)
    );

    if (fare <= 0) return;

    this.credit(fare, "passenger_fare", {
      passengerId: payload.passengerId ?? null,
      reason: "Passenger delivery",
    });

    const tip = this.calculateTip(fare);

    if (tip > 0) {
      this.credit(tip, "passenger_tip", {
        passengerId: payload.passengerId ?? null,
        reason: "Passenger tip",
      });
    }

    this.emit("economy:fare-settled", {
      fare,
      tip,
      total: fare + tip,
      balance: this.getBalance(),
    });
  }

  calculateTip(fare) {
    if (Math.random() >= this.settings.passengerTipChance) {
      return 0;
    }

    const maximum =
      Math.max(0, fare) * this.settings.maximumTipMultiplier;

    if (maximum <= 0) return 0;

    return Math.floor(Math.random() * maximum) + 1;
  }

  credit(amount, category = "income", metadata = {}) {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return {
        success: false,
        balance: this.getBalance(),
        reason: "invalid_amount",
      };
    }

    this.gameState.profile.money = this.getBalance() + value;

    const economy = this.gameState.profile.economy;
    economy.totalEarned += value;

    if (category === "passenger_fare") {
      economy.totalFares += value;
    }

    if (category === "passenger_tip") {
      economy.totalTips += value;
    }

    const transaction = this.recordTransaction({
      type: "credit",
      category,
      amount: value,
      metadata,
    });

    this.persist();

    this.emit("economy:credited", {
      ...transaction,
      balance: this.getBalance(),
    });

    return {
      success: true,
      amount: value,
      balance: this.getBalance(),
      transaction,
    };
  }

  debit(amount, category = "purchase", metadata = {}) {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return {
        success: false,
        balance: this.getBalance(),
        reason: "invalid_amount",
      };
    }

    const balance = this.getBalance();

    if (balance < value) {
      this.emit("economy:insufficient-funds", {
        requested: value,
        balance,
        category,
      });

      return {
        success: false,
        balance,
        reason: "insufficient_funds",
      };
    }

    this.gameState.profile.money = balance - value;

    const economy = this.gameState.profile.economy;
    economy.totalSpent += value;

    if (category === "fuel") {
      economy.totalFuelCost += value;
    }

    if (category === "repair") {
      economy.totalRepairCost += value;
    }

    const transaction = this.recordTransaction({
      type: "debit",
      category,
      amount: value,
      metadata,
    });

    this.persist();

    this.emit("economy:debited", {
      ...transaction,
      balance: this.getBalance(),
    });

    return {
      success: true,
      amount: value,
      balance: this.getBalance(),
      transaction,
    };
  }

  purchase(item, price, metadata = {}) {
    if (!item || typeof item !== "string") {
      return {
        success: false,
        reason: "invalid_item",
        balance: this.getBalance(),
      };
    }

    return this.debit(price, "purchase", {
      item,
      ...metadata,
    });
  }

  buyFuel(units, currentFuel, maximumFuel = 100) {
    const availableCapacity = Math.max(
      0,
      Number(maximumFuel) - Number(currentFuel)
    );

    const requestedUnits = Math.min(
      availableCapacity,
      Math.max(0, Number(units) || 0)
    );

    if (requestedUnits <= 0) {
      return {
        success: false,
        reason: "fuel_tank_full",
        balance: this.getBalance(),
      };
    }

    const cost = Math.ceil(
      requestedUnits * this.settings.fuelPricePerUnit
    );

    const payment = this.debit(cost, "fuel", {
      units: requestedUnits,
    });

    if (!payment.success) return payment;

    return {
      ...payment,
      unitsPurchased: requestedUnits,
      fuelAfterPurchase: Math.min(
        maximumFuel,
        Number(currentFuel) + requestedUnits
      ),
    };
  }

  calculateRepairCost(damagePercent) {
    const damage = Math.min(100, Math.max(0, Number(damagePercent) || 0));

    if (damage <= 0) return 0;

    return Math.ceil(
      this.settings.repairBaseCost +
        damage * this.settings.repairCostPerDamage
    );
  }

  repairVehicle(damagePercent) {
    const damage = Math.min(100, Math.max(0, Number(damagePercent) || 0));

    if (damage <= 0) {
      return {
        success: false,
        reason: "vehicle_already_repaired",
        balance: this.getBalance(),
      };
    }

    const cost = this.calculateRepairCost(damage);
    const payment = this.debit(cost, "repair", { damage });

    if (!payment.success) return payment;

    this.emit("economy:vehicle-repaired", {
      damageRestored: damage,
      cost,
      balance: this.getBalance(),
    });

    return {
      ...payment,
      damageRestored: damage,
    };
  }

  awardNearMissBonus() {
    const bonus = Math.max(
      0,
      Math.floor(Number(this.settings.nearMissBonus) || 0)
    );

    if (bonus <= 0) return null;

    return this.credit(bonus, "near_miss_bonus", {
      reason: "Near miss",
    });
  }

  awardTripBonus(payload = {}) {
    if (payload.cancelled === true) return null;

    if (payload.clean === false || payload.collisions > 0) {
      return null;
    }

    const bonus = Math.max(
      0,
      Math.floor(Number(this.settings.cleanTripBonus) || 0)
    );

    if (bonus <= 0) return null;

    return this.credit(bonus, "clean_trip_bonus", {
      reason: "Clean trip",
    });
  }

  recordTransaction({ type, category, amount, metadata = {} }) {
    const transaction = {
      id: `KRE-${Date.now()}-${++this.transactionSequence}`,
      type,
      category,
      amount,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const transactions = this.gameState.profile.economy.transactions;

    transactions.push(transaction);

    if (transactions.length > 100) {
      transactions.splice(0, transactions.length - 100);
    }

    return transaction;
  }

  persist() {
    if (
      this.saveManager &&
      typeof this.saveManager.saveProfile === "function"
    ) {
      this.saveManager.saveProfile(this.gameState.profile);
    }

    this.emit("economy:updated", this.getStatistics());
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }

    if (this.gameState && typeof this.gameState.emit === "function") {
      this.gameState.emit(eventName, payload);
    }
  }

  reset() {
    this.gameState.profile.money = this.settings.startingMoney;
    this.gameState.profile.economy = {
      totalEarned: 0,
      totalSpent: 0,
      totalFares: 0,
      totalTips: 0,
      totalFuelCost: 0,
      totalRepairCost: 0,
      transactions: [],
    };

    this.persist();
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Listener may already have been removed.
      }
    }

    this.listeners.length = 0;
  }
}