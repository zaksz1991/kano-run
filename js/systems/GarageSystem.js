import { GAME_CONFIG } from "../core/config.js";

// Default roster (Can be expanded later via config)
const DEFAULT_DRIVERS = [
  { id: "ruffneck", name: "RuffNeck", bonus: { speed: 1.0, handling: 1.0, fare: 1.0 }, unlocked: true },
  { id: "mama_put", name: "Mama Put", bonus: { speed: 0.95, handling: 1.15, fare: 1.1 }, unlocked: false },
  { id: "area_boy", name: "Area Boy", bonus: { speed: 1.15, handling: 0.85, fare: 0.9 }, unlocked: false }
];

const DEFAULT_KEKES = [
  { id: "standard", name: "Standard Adaidaita", stats: { maxSpeed: 25, acceleration: 10, handling: 1.0, fuelCapacity: 100 }, unlocked: true },
  { id: "luxury", name: "Luxury Adaidaita", stats: { maxSpeed: 29, acceleration: 12, handling: 1.12, fuelCapacity: 115 }, unlocked: false },
  { id: "cargo", name: "Cargo Adaidaita", stats: { maxSpeed: 22, acceleration: 8, handling: 0.85, fuelCapacity: 120 }, unlocked: false }
];

const DEFAULT_PAINTS = [
  { id: "classic", name: "Napep Yellow", color: 0xfbbf24, unlocked: true },
  { id: "green", name: "Eco Green", color: 0x168b50, unlocked: false },
  { id: "blue", name: "Union Blue", color: 0x2466b3, unlocked: false }
];

export default class GarageSystem {
  constructor({ eventBus = null, gameState = null, saveManager = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.saveManager = saveManager;
    this.config = { ...GAME_CONFIG?.garage ?? {}, ...config };
    
    this.drivers = DEFAULT_DRIVERS;
    this.vehicles = DEFAULT_KEKES;
    this.paints = DEFAULT_PAINTS;
    
    this.selectedDriver = "ruffneck";
    this.selectedVehicle = "standard";
    this.selectedPaint = "classic";
    
    this._disposers = [];
    this._bindEvents();
  }

  _bindEvents() {
    // Listen for UI clicks
    this._subscribe("garage:selectDriver", (id) => this.selectDriver(id));
    this._subscribe("garage:selectVehicle", (id) => this.selectVehicle(id));
    this._subscribe("garage:selectPaint", (id) => this.selectPaint(id));
    
    // Apply stats when a run starts
    this._subscribe("game:started", () => this.applySelections());
  }

  initialize() {
    // Load unlocks and selections from SaveManager
    if (this.saveManager) {
      const profile = this.saveManager.getProfile?.() || {};
      
      if (profile.unlockedDrivers) this._mergeUnlocks(this.drivers, profile.unlockedDrivers);
      if (profile.unlockedVehicles) this._mergeUnlocks(this.vehicles, profile.unlockedVehicles);
      if (profile.unlockedPaints) this._mergeUnlocks(this.paints, profile.unlockedPaints);
      
      if (profile.selectedDriver) this.selectedDriver = profile.selectedDriver;
      if (profile.selectedVehicle) this.selectedVehicle = profile.selectedVehicle;
      if (profile.selectedPaint) this.selectedPaint = profile.selectedPaint;
    }
    this._emitUpdate();
  }

  selectDriver(id) {
    const driver = this.drivers.find(d => d.id === id);
    if (!driver || !driver.unlocked) return false;
    this.selectedDriver = id;
    this._saveSelection();
    this._emitUpdate();
    return true;
  }

  selectVehicle(id) {
    const vehicle = this.vehicles.find(v => v.id === id);
    if (!vehicle || !vehicle.unlocked) return false;
    this.selectedVehicle = id;
    this._saveSelection();
    this._emitUpdate();
    return true;
  }

  selectPaint(id) {
    const paint = this.paints.find(p => p.id === id);
    if (!paint || !paint.unlocked) return false;
    this.selectedPaint = id;
    this._saveSelection();
    this._emitUpdate();
    return true;
  }

  unlockDriver(id) {
    const driver = this.drivers.find(d => d.id === id);
    if (driver && !driver.unlocked) {
      driver.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "driver", id });
    }
  }

  unlockVehicle(id) {
    const vehicle = this.vehicles.find(v => v.id === id);
    if (vehicle && !vehicle.unlocked) {
      vehicle.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "vehicle", id });
    }
  }

  unlockPaint(id) {
    const paint = this.paints.find(p => p.id === id);
    if (paint && !paint.unlocked) {
      paint.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "paint", id });
    }
  }

  getGarageData() {
    return {
      drivers: this.drivers,
      vehicles: this.vehicles,
      paints: this.paints,
      selected: {
        driver: this.selectedDriver,
        vehicle: this.selectedVehicle,
        paint: this.selectedPaint
      }
    };
  }

  applySelections() {
    // Called at the start of a run to apply bonuses to the player
    const driver = this.drivers.find(d => d.id === this.selectedDriver);
    const vehicle = this.vehicles.find(v => v.id === this.selectedVehicle);
    const paint = this.paints.find(p => p.id === this.selectedPaint);

    this.eventBus?.emit?.("garage:applySelections", {
      driverBonus: driver?.bonus || {},
      vehicleStats: vehicle?.stats || {},
      paintColor: paint?.color || 0xfbbf24
    });
  }

  _mergeUnlocks(list, unlockedIds) {
    list.forEach(item => {
      if (unlockedIds.includes(item.id)) item.unlocked = true;
    });
  }

  _saveSelection() {
    if (this.saveManager) {
      this.saveManager.setValue?.("selectedDriver", this.selectedDriver);
      this.saveManager.setValue?.("selectedVehicle", this.selectedVehicle);
      this.saveManager.setValue?.("selectedPaint", this.selectedPaint);
    }
  }

  _saveUnlocks() {
    if (this.saveManager) {
      this.saveManager.setValue?.("unlockedDrivers", this.drivers.filter(d => d.unlocked).map(d => d.id));
      this.saveManager.setValue?.("unlockedVehicles", this.vehicles.filter(v => v.unlocked).map(v => v.id));
      this.saveManager.setValue?.("unlockedPaints", this.paints.filter(p => p.unlocked).map(p => p.id));
    }
  }

  _emitUpdate() {
    this.eventBus?.emit?.("garage:updated", this.getGarageData());
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