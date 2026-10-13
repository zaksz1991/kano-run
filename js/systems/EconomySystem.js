import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  baseFare: 200,
  farePerKm: 150,
  negotiationMultiplier: 1.2, // Bonus for good negotiation
  fuelPricePerLiter: 120, // Naira
  repairCostPerCondition: 50, // Naira
  karotaFineBase: 1500,
  karotaFinePerSpeed: 100, // Extra fine for every unit over the limit
  dailyExpenses: 500, // Deducted at the start of a new day/run
};

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
    this._bindEvents();
  }

  _bindEvents() {
    // Listen for passenger drop-offs to award fares
    this._subscribe("passenger:dropped", (payload) => {
      const distance = payload.distance || 1; // in km
      const negotiationBonus = payload.negotiationSuccess ? this.config.negotiationMultiplier : 1.0;
      const fare = this.calculateFare(distance, negotiationBonus);
      
      this.addMoney(fare, "passenger_fare");
      this.eventBus?.emit?.("economy:fare-earned", { amount: fare, reason: "passenger_fare" });
    });

    // Listen for KAROTA fines
    this._subscribe("checkpoint:fined", (payload) => {
      const speedOverLimit = payload.speedOverLimit || 0;
      const fine = this.calculateFine(speedOverLimit);
      
      this.deductMoney(fine, "karota_fine");
      this.eventBus?.emit?.("economy:fine-paid", { amount: fine, reason: "karota_fine" });
    });

    // Listen for refueling
    this._subscribe("vehicle:refueled", (payload) => {
      const liters = payload.liters || 10;
      const cost = Math.ceil(liters * this.config.fuelPricePerLiter);
      
      this.deductMoney(cost, "fuel_purchase");
      this.eventBus?.emit?.("economy:fuel-paid", { amount: cost, liters });
    });

    // Listen for repairs
    this._subscribe("vehicle:repaired", (payload) => {
      const conditionRestored = payload.conditionRestored || 20;
      const cost = Math.ceil(conditionRestored * this.config.repairCostPerCondition);
      
      this.deductMoney(cost, "vehicle_repair");
      this.eventBus?.emit?.("economy:repair-paid", { amount: cost, condition: conditionRestored });
    });

    // Listen for run start to deduct daily expenses
    this._subscribe("game:started", () => {
      this.deductMoney(this.config.dailyExpenses, "daily_expenses");
    });
  }

  calculateFare(distanceKm, multiplier = 1.0) {
    const base = this.config.baseFare;
    const distanceFare = distanceKm * this.config.farePerKm;
    return Math.floor((base + distanceFare) * multiplier);
  }

  calculateFine(speedOverLimit) {
    const base = this.config.karotaFineBase;
    const penalty = speedOverLimit * this.config.karotaFinePerSpeed;
    return Math.floor(base + penalty);
  }

  addMoney(amount, reason = "unspecified") {
    if (amount <= 0) return false;
    const success = this.gameState.addMoney?.(amount, reason);
    if (success) {
      this.eventBus?.emit?.("economy:balance-changed", { 
        balance: this.getBalance(), 
        change: amount 
      });
    }
    return success;
  }

  deductMoney(amount, reason = "unspecified") {
    if (amount <= 0) return false;
    const success = this.gameState.spendMoney?.(amount, reason);
    if (success) {
      this.eventBus?.emit?.("economy:balance-changed", { 
        balance: this.getBalance(), 
        change: -amount 
      });
    }
    return success;
  }

  getBalance() {
    return this.gameState.profile?.money ?? this.gameState.profile?.wallet ?? 0;
  }

  canAfford(amount) {
    return this.getBalance() >= amount;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}