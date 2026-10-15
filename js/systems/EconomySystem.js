import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  baseFare: 200,
  farePerKm: 150,
  negotiationMultiplier: 1.15,
  fuelPricePerLiter: 120,
  repairCostPerCondition: 50,
  karotaFineBase: 200,
  dailyExpenses: 0,
  startingMoney: 30000,
  // Phase 4 — period & weather multipliers
  periodFareMult: {
    dawn: 1.05,
    morning: 1.1,
    afternoon: 1.0,
    evening: 1.25,
    night: 1.5,
  },
  periodDemandMult: {
    dawn: 0.7,
    morning: 1.35,
    afternoon: 1.15,
    evening: 1.2,
    night: 0.95,
  },
  weatherFareMult: {
    clear: 1,
    sunny: 1,
    cloudy: 1.02,
    harmattan: 1.08,
    rain: 1.2,
    storm: 1.35,
  },
  weatherDemandMult: {
    clear: 1,
    sunny: 1.05,
    cloudy: 1,
    harmattan: 0.9,
    rain: 1.25,
    storm: 0.75,
  },
};

/**
 * Wallet authority for Kano Run.
 * Listens to fare / fine / spend events and keeps profile.money in sync for HUD.
 */
export default class EconomySystem {
  constructor({
    gameState = null,
    eventBus = null,
    saveManager = null,
    config = {},
  } = {}) {
    if (!gameState) throw new Error("EconomySystem requires gameState.");

    this.gameState = gameState;
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.economy ?? {}), ...config };
    this._disposers = [];
    this.period = "morning";
    this.weather = "clear";
    this.fareMultiplier = 1;
    this.demandMultiplier = 1;
    this.shiftFares = 0;
    this.shiftTrips = 0;
    this.reputation = 50;
    this._bindEvents();
  }

  initialize() {
    this._ensureWallet();
    this._emitBalance(0);
    return this;
  }

  _ensureWallet() {
    if (!this.gameState.profile) {
      this.gameState.profile = {};
    }
    const p = this.gameState.profile;
    if (!Number.isFinite(Number(p.money))) {
      p.money = this.config.startingMoney;
    }
    if (!Number.isFinite(Number(p.wallet))) {
      p.wallet = p.money;
    }
  }

  _bindEvents() {
    // Passenger drop — amount already computed by PassengerSystem
    this._subscribe("economy:period", (payload = {}) => {
      this.period = payload.period || this.period;
      this._recomputeMultipliers();
      this.eventBus?.emit?.("economy:demand-changed", this.getDemandSnapshot());
    });
    this._subscribe("time:period-changed", (payload = {}) => {
      this.period = payload.current || payload.period || this.period;
      this._recomputeMultipliers();
    });
    this._subscribe("weather:changed", (payload = {}) => {
      this.weather = String(payload.weather || payload.type || payload.id || this.weather).toLowerCase();
      this._recomputeMultipliers();
      this.eventBus?.emit?.("economy:demand-changed", this.getDemandSnapshot());
    });
    this._subscribe("passenger:dropped", (payload = {}) => {
      const amount = Number(payload.fare ?? payload.amount) || 0;
      if (amount > 0) {
        const boosted = Math.round(amount * (this.fareMultiplier || 1));
        this.addMoney(boosted, "passenger_fare");
        this.shiftFares += boosted;
        this.shiftTrips += 1;
        this.reputation = Math.min(100, (this.reputation || 50) + 0.5);
      }
    });

    this._subscribe("economy:fare-earned", (payload = {}) => {
      const amount = Number(payload.fare ?? payload.amount) || 0;
      // Avoid double-add if passenger:dropped already handled same fare
      if (amount > 0 && payload.source !== "passenger") {
        this.addMoney(amount, payload.source || "fare");
      }
    });

    this._subscribe("economy:fare-agreed", (payload = {}) => {
      // Store agreed fare for drop-off; money awarded on drop
      this._lastAgreedFare = Number(payload.fare ?? payload.amount) || 0;
    });

    // Fines from checkpoint / chase — use payload.amount when present
    this._subscribe("checkpoint:fined", (payload = {}) => {
      if (payload.paid === false) {
        // Caught later may still charge
      }
      const amount =
        Number(payload.amount) ||
        this.calculateFine(Number(payload.speedOverLimit) || 0);
      if (amount > 0) this.deductMoney(amount, "karota_fine");
    });

    this._subscribe("economy:spend", (payload = {}) => {
      const amount = Number(payload.amount) || 0;
      if (amount > 0) {
        this.deductMoney(amount, payload.reason || "spend");
      }
    });

    this._subscribe("vehicle:refueled", (payload = {}) => {
      const liters = Number(payload.liters ?? payload.amount) || 10;
      const cost = Math.ceil(liters * this.config.fuelPricePerLiter);
      this.deductMoney(cost, "fuel_purchase");
    });

    this._subscribe("vehicle:repaired", (payload = {}) => {
      const restored = Number(payload.conditionRestored) || 20;
      const cost = Math.ceil(restored * this.config.repairCostPerCondition);
      this.deductMoney(cost, "vehicle_repair");
    });

    this._subscribe("game:started", () => {
      this._ensureWallet();
      if (this.config.dailyExpenses > 0) {
        this.deductMoney(this.config.dailyExpenses, "daily_expenses");
      }
      this._emitBalance(0);
    });

    this._subscribe("score:bonus", (payload = {}) => {
      const amount = Number(payload.amount) || 0;
      if (amount > 0) this.addMoney(amount, payload.reason || "bonus");
    });

    this._subscribe("mission:claimed", (payload = {}) => {
      const amount = Number(payload.moneyReward) || 0;
      if (amount > 0) this.addMoney(amount, "mission_reward");
    });
  }

  calculateFare(distanceKm, multiplier = 1.0) {
    const base = this.config.baseFare;
    const distanceFare = Math.max(0, distanceKm) * this.config.farePerKm;
    return Math.floor((base + distanceFare) * multiplier);
  }

  calculateFine(speedOverLimit) {
    return Math.floor(
      this.config.karotaFineBase +
        Math.max(0, speedOverLimit) * 50,
    );
  }

  addMoney(amount, reason = "unspecified") {
    this._ensureWallet();
    const value = Math.floor(Number(amount) || 0);
    if (value <= 0) return false;

    if (typeof this.gameState.addMoney === "function") {
      this.gameState.addMoney(value, reason);
    } else {
      this.gameState.profile.money =
        (Number(this.gameState.profile.money) || 0) + value;
      this.gameState.profile.wallet = this.gameState.profile.money;
    }

    this._emitBalance(value);
    this.eventBus?.emit?.("economy:money-added", {
      amount: value,
      reason,
      balance: this.getBalance(),
    });
    this._persist();
    return true;
  }

  deductMoney(amount, reason = "unspecified") {
    this._ensureWallet();
    const value = Math.floor(Number(amount) || 0);
    if (value <= 0) return false;

    const balance = this.getBalance();
    const paid = Math.min(balance, value);

    if (typeof this.gameState.spendMoney === "function") {
      this.gameState.spendMoney(paid, reason);
    } else {
      this.gameState.profile.money = Math.max(0, balance - paid);
      this.gameState.profile.wallet = this.gameState.profile.money;
    }

    this._emitBalance(-paid);
    this.eventBus?.emit?.("economy:money-spent", {
      amount: paid,
      requested: value,
      reason,
      balance: this.getBalance(),
      shortfall: value > paid,
    });
    this._persist();
    return paid > 0;
  }

  getBalance() {
    this._ensureWallet();
    return (
      Number(this.gameState.profile?.money) ||
      Number(this.gameState.profile?.wallet) ||
      0
    );
  }

  canAfford(amount) {
    return this.getBalance() >= (Number(amount) || 0);
  }

  _emitBalance(change = 0) {
    const balance = this.getBalance();
    this.eventBus?.emit?.("economy:balance-changed", {
      balance,
      change,
    });
  }

  _persist() {
    try {
      this.saveManager?.save?.();
      this.saveManager?.updateProfile?.(this.gameState.profile, {
        autosave: true,
      });
    } catch {}
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
