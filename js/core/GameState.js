import GAME_CONFIG from "./config.js";

const DEFAULT_PROFILE = {
  money: GAME_CONFIG.economy.startingMoney,
  xp: GAME_CONFIG.progression.startingXP,
  level: GAME_CONFIG.progression.startingLevel,
  totalScore: 0,
  totalDistance: 0,
  totalDeliveries: 0,
  totalEarnings: 0,
  totalCollisions: 0,
  totalNearMisses: 0,
  unlockedDrivers: ["ruffneck"],
  selectedDriver: "ruffneck",
  unlockedVehicles: ["standard"],
  selectedVehicle: "standard",
  unlockedPaints: ["classic"],
  selectedPaint: "classic",
  unlockedRoutes: ["citycenter", "sabongari", "fagge", "nassarawa", "tarauni", "gwale", "kumbotso", "ungogo"],
  selectedRoute: "citycenter",
  achievements: [],
  settings: {
    masterVolume: GAME_CONFIG.audio.masterVolume,
    effectsVolume: GAME_CONFIG.audio.effectsVolume,
    radioVolume: GAME_CONFIG.audio.radioVolume,
    musicEnabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
  },
};

export default class GameState {
  constructor({ profile = null, eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.listeners = new Set();
    this.phase = GAME_CONFIG
      ? "menu"
      : "loading";

    this.profile = this.createProfile(profile);
    this.run = this.createRunState();
    this.destroyed = false;
  }

  createProfile(source = null) {
    const profile = {
      ...DEFAULT_PROFILE,
      ...(source || {}),
      settings: {
        ...DEFAULT_PROFILE.settings,
        ...(source?.settings || {}),
      },
    };

    for (const key of [
      "unlockedDrivers",
      "unlockedVehicles",
      "unlockedPaints",
      "unlockedRoutes",
      "achievements",
    ]) {
      profile[key] = Array.isArray(profile[key])
        ? [...new Set(profile[key])]
        : [...DEFAULT_PROFILE[key]];
    }

    profile.money = this.nonNegative(profile.money);
    profile.xp = this.nonNegative(profile.xp);
    profile.level = Math.max(1, this.integer(profile.level, 1));

    return profile;
  }

  createRunState() {
    return {
      active: false,
      elapsedTime: 0,
      speed: 0,
      maxSpeed: 0,
      distance: 0,
      score: 0,
      earnings: 0,
      fuel: GAME_CONFIG.driving.maxFuel,
      condition: GAME_CONFIG.driving.maxCondition,
      passengers: [],
      deliveries: 0,
      collisions: 0,
      nearMisses: 0,
      currentMission: null,
      destination: null,
      weather: "clear",
      timePeriod: "morning",
      lane: 1,
      gameOverReason: null,
    };
  }

  nonNegative(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) : fallback;
  }

  emit(type, payload = {}) {
    if (this.destroyed) return;

    const event = {
      type,
      payload,
      state: this.getSnapshot(),
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("GameState listener error:", error);
      }
    }

    this.eventBus?.emit?.(type, payload);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("GameState subscriber must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /**
   * Event-style API used by MissionSystem and others.
   * on(type, callback) → unsubscribe function
   */
  on(type, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("GameState.on callback must be a function.");
    }
    const handler = (event) => {
      if (!event || event.type !== type) return;
      callback(event.payload, event);
    };
    return this.subscribe(handler);
  }

  off(_type, _callback) {
    // Unsubscribe is returned from on(); kept for API compatibility
  }

  setPhase(phase) {
    if (this.destroyed || this.phase === phase) return;

    const previousPhase = this.phase;
    this.phase = phase;

    this.emit("phase:changed", {
      previousPhase,
      phase,
    });
  }

  startRun() {
    if (this.destroyed) return false;

    this.run = this.createRunState();
    this.run.active = true;

    this.setPhase("playing");

    this.emit("run:started");

    return true;
  }

  resetRun() {
    if (this.destroyed) return false;

    this.run = this.createRunState();

    this.emit("run:reset");

    return true;
  }

  pauseRun() {
    if (!this.run.active || this.phase !== "playing") return false;

    this.setPhase("paused");
    this.emit("run:paused");

    return true;
  }

  resumeRun() {
    if (!this.run.active || this.phase !== "paused") return false;

    this.setPhase("playing");
    this.emit("run:resumed");

    return true;
  }

  finishRun(reason = "completed") {
    if (this.destroyed || !this.run.active) return false;

    this.run.active = false;
    this.run.gameOverReason = reason;

    this.profile.totalScore += this.run.score;
    this.profile.totalDistance += this.run.distance;
    this.profile.totalDeliveries += this.run.deliveries;
    this.profile.totalEarnings += this.run.earnings;
    this.profile.totalCollisions += this.run.collisions;
    this.profile.totalNearMisses += this.run.nearMisses;

    this.setPhase("gameover");

    this.emit("run:finished", {
      reason,
      score: this.run.score,
      earnings: this.run.earnings,
      distance: this.run.distance,
      deliveries: this.run.deliveries,
    });

    return true;
  }

  setSpeed(speed) {
    const value = Math.max(0, Number(speed) || 0);

    this.run.speed = value;
    this.run.maxSpeed = Math.max(this.run.maxSpeed, value);
  }

  addDistance(distance) {
    const value = this.nonNegative(distance);

    if (value === 0) return;

    this.run.distance += value;

    this.emit("run:distance", {
      amount: value,
      total: this.run.distance,
    });
  }

  addScore(points) {
    const value = this.integer(points);

    if (value === 0) return;

    this.run.score = Math.max(0, this.run.score + value);

    this.emit("score:changed", {
      amount: value,
      score: this.run.score,
    });
  }

  addMoney(amount, reason = "unspecified") {
    const value = this.integer(amount);

    if (value <= 0) return false;

    this.profile.money += value;
    this.run.earnings += value;

    this.emit("money:earned", {
      amount: value,
      reason,
      balance: this.profile.money,
      runEarnings: this.run.earnings,
    });

    return true;
  }

  spendMoney(amount, reason = "purchase") {
    const value = this.integer(amount);

    if (value <= 0 || this.profile.money < value) {
      return false;
    }

    this.profile.money -= value;

    this.emit("money:spent", {
      amount: value,
      reason,
      balance: this.profile.money,
    });

    return true;
  }

  addXP(amount, reason = "unspecified") {
    const value = this.integer(amount);

    if (value <= 0) return false;

    this.profile.xp += value;

    this.emit("xp:earned", {
      amount: value,
      reason,
      xp: this.profile.xp,
    });

    this.updateLevel();

    return true;
  }

  updateLevel() {
    const xpPerLevel = Math.max(
      1,
      GAME_CONFIG.progression.xpPerLevel
    );

    const maxLevel = Math.max(
      1,
      GAME_CONFIG.progression.maximumLevel
    );

    const calculatedLevel = Math.min(
      maxLevel,
      Math.floor(this.profile.xp / xpPerLevel) + 1
    );

    if (calculatedLevel <= this.profile.level) return;

    const previousLevel = this.profile.level;
    this.profile.level = calculatedLevel;

    this.emit("level:up", {
      previousLevel,
      level: calculatedLevel,
    });
  }

  recordDelivery({ fare = 0, xp = 0, score = 0 } = {}) {
    this.run.deliveries += 1;

    if (fare > 0) {
      this.addMoney(fare, "passenger_delivery");
    }

    if (xp > 0) {
      this.addXP(xp, "passenger_delivery");
    }

    if (score > 0) {
      this.addScore(score);
    }

    this.emit("passenger:delivered", {
      deliveries: this.run.deliveries,
      fare,
      xp,
      score,
    });
  }

  recordCollision(damage = 0) {
    this.run.collisions += 1;

    this.run.condition = Math.max(
      0,
      this.run.condition - this.nonNegative(damage)
    );

    this.emit("collision", {
      collisions: this.run.collisions,
      damage,
      condition: this.run.condition,
    });

    if (this.run.condition <= 0) {
      this.finishRun("vehicle_damaged");
    }
  }

  recordNearMiss() {
    this.run.nearMisses += 1;

    this.emit("near-miss", {
      nearMisses: this.run.nearMisses,
    });
  }

  setFuel(fuel) {
    this.run.fuel = Math.min(
      GAME_CONFIG.driving.maxFuel,
      this.nonNegative(fuel)
    );

    if (this.run.fuel <= 0 && this.run.active) {
      this.emit("fuel:empty");
    }
  }

  setCondition(condition) {
    this.run.condition = Math.min(
      GAME_CONFIG.driving.maxCondition,
      this.nonNegative(condition)
    );

    if (this.run.condition <= 0 && this.run.active) {
      this.finishRun("vehicle_damaged");
    }
  }

  setLane(lane) {
    const maxLane = GAME_CONFIG.world.laneCount - 1;
    this.run.lane = Math.max(
      0,
      Math.min(maxLane, this.integer(lane, 1))
    );
  }

  setWeather(weather) {
    this.run.weather = String(weather || "clear");

    this.emit("weather:changed", {
      weather: this.run.weather,
    });
  }

  setTimePeriod(period) {
    this.run.timePeriod = String(period || "morning");

    this.emit("time:period-changed", {
      period: this.run.timePeriod,
    });
  }

  setPassengers(passengers) {
    this.run.passengers = Array.isArray(passengers)
      ? [...passengers]
      : [];

    this.emit("passengers:changed", {
      passengers: this.run.passengers,
      count: this.run.passengers.length,
    });
  }

  unlock(type, id) {
    const keys = {
      driver: "unlockedDrivers",
      vehicle: "unlockedVehicles",
      paint: "unlockedPaints",
      route: "unlockedRoutes",
      achievement: "achievements",
    };

    const key = keys[type];

    if (!key || !id || this.profile[key].includes(id)) {
      return false;
    }

    this.profile[key].push(id);

    this.emit("item:unlocked", {
      type,
      id,
    });

    return true;
  }

  select(type, id) {
    const selections = {
      driver: ["selectedDriver", "unlockedDrivers"],
      vehicle: ["selectedVehicle", "unlockedVehicles"],
      paint: ["selectedPaint", "unlockedPaints"],
      route: ["selectedRoute", "unlockedRoutes"],
    };

    const selection = selections[type];

    if (!selection) return false;

    const [selectedKey, unlockedKey] = selection;

    if (!this.profile[unlockedKey].includes(id)) {
      return false;
    }

    this.profile[selectedKey] = id;

    this.emit("selection:changed", {
      type,
      id,
    });

    return true;
  }

  updateSetting(key, value) {
    if (!(key in this.profile.settings)) return false;

    this.profile.settings[key] = value;

    this.emit("settings:changed", {
      key,
      value,
    });

    return true;
  }

  getProfile() {
    return structuredClone(this.profile);
  }

  getRunState() {
    return structuredClone(this.run);
  }

  getSnapshot() {
    return {
      phase: this.phase,
      profile: this.getProfile(),
      run: this.getRunState(),
    };
  }

  loadProfile(profile) {
    if (this.destroyed || !profile || typeof profile !== "object") {
      return false;
    }

    this.profile = this.createProfile(profile);
    this.updateLevel();

    this.emit("profile:loaded");

    return true;
  }

  exportProfile() {
    return JSON.stringify({
      version: GAME_CONFIG.version,
      profile: this.profile,
    });
  }

  importProfile(serialized) {
    try {
      const parsed = typeof serialized === "string"
        ? JSON.parse(serialized)
        : serialized;

      const profile = parsed?.profile || parsed;

      if (!profile || typeof profile !== "object") {
        return false;
      }

      return this.loadProfile(profile);
    } catch {
      return false;
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.listeners.clear();
    this.eventBus = null;
    this.destroyed = true;
  }
}