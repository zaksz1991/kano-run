import GAME_CONFIG from "../core/config.js";

const DEFAULT_PROGRESSION = {
  level: 1,
  xp: 0,
  totalDistance: 0,
  totalDeliveries: 0,
  totalEarnings: 0,
  totalNearMisses: 0,
  totalTrips: 0,
  unlockedDrivers: ["ruffneck"],
  unlockedVehicles: ["standard"],
  unlockedRoutes: ["citycenter"],
  achievements: [],
};

const ACHIEVEMENTS = [
  {
    id: "first_trip",
    name: "First Trip",
    description: "Complete your first trip.",
    reward: 250,
    check: (stats) => stats.totalTrips >= 1,
  },
  {
    id: "first_delivery",
    name: "Arewa Courier",
    description: "Deliver your first passenger.",
    reward: 300,
    check: (stats) => stats.totalDeliveries >= 1,
  },
  {
    id: "delivery_10",
    name: "Trusted Driver",
    description: "Complete 10 passenger deliveries.",
    reward: 1000,
    check: (stats) => stats.totalDeliveries >= 10,
  },
  {
    id: "delivery_50",
    name: "Kano Legend",
    description: "Complete 50 passenger deliveries.",
    reward: 5000,
    check: (stats) => stats.totalDeliveries >= 50,
  },
  {
    id: "distance_10k",
    name: "Road Explorer",
    description: "Travel 10 kilometres.",
    reward: 750,
    check: (stats) => stats.totalDistance >= 10000,
  },
  {
    id: "distance_100k",
    name: "Long-Distance Driver",
    description: "Travel 100 kilometres.",
    reward: 5000,
    check: (stats) => stats.totalDistance >= 100000,
  },
  {
    id: "near_miss_25",
    name: "Traffic Dancer",
    description: "Record 25 near misses.",
    reward: 1000,
    check: (stats) => stats.totalNearMisses >= 25,
  },
  {
    id: "earnings_10000",
    name: "Smart Earner",
    description: "Earn ₦10,000 in total fares.",
    reward: 1500,
    check: (stats) => stats.totalEarnings >= 10000,
  },
];

const DEFAULT_UNLOCKS = [
  { type: "vehicle", id: "luxury", level: 3, cost: 0 },
  { type: "vehicle", id: "cargo", level: 5, cost: 0 },
  { type: "vehicle", id: "open", level: 7, cost: 0 },
  { type: "vehicle", id: "police", level: 10, cost: 0 },
  { type: "vehicle", id: "karota", level: 12, cost: 0 },
  { type: "route", id: "sabongari", level: 2, cost: 0 },
  { type: "route", id: "tudunwada", level: 4, cost: 0 },
  { type: "route", id: "nassarawa", level: 6, cost: 0 },
  { type: "route", id: "kofarmazugal", level: 8, cost: 0 },
  { type: "route", id: "gyadi-gyadi", level: 10, cost: 0 },
];

export default class ProgressionSystem {
  constructor({ gameState, eventBus, saveManager, unlocks = [] }) {
    if (!gameState) {
      throw new Error("ProgressionSystem requires gameState.");
    }

    this.gameState = gameState;
    this.eventBus = eventBus ?? null;
    this.saveManager = saveManager ?? null;
    this.unlockDefinitions = [...DEFAULT_UNLOCKS, ...unlocks];
    this.listeners = [];
    this.destroyed = false;

    this.profile = this.ensureProfile();
    this.bindEvents();
    this.checkAchievements();
    this.checkUnlocks();
  }

  ensureProfile() {
    const profile = this.gameState.profile;

    if (!profile.progression || typeof profile.progression !== "object") {
      profile.progression = structuredClone(DEFAULT_PROGRESSION);
    }

    const progression = profile.progression;

    for (const [key, value] of Object.entries(DEFAULT_PROGRESSION)) {
      if (progression[key] === undefined || progression[key] === null) {
        progression[key] = Array.isArray(value) ? [...value] : value;
      }
    }

    progression.level = Math.max(1, Number(progression.level) || 1);
    progression.xp = Math.max(0, Number(progression.xp) || 0);

    for (const key of [
      "totalDistance",
      "totalDeliveries",
      "totalEarnings",
      "totalNearMisses",
      "totalTrips",
    ]) {
      progression[key] = Math.max(0, Number(progression[key]) || 0);
    }

    for (const key of [
      "unlockedDrivers",
      "unlockedVehicles",
      "unlockedRoutes",
      "achievements",
    ]) {
      if (!Array.isArray(progression[key])) {
        progression[key] = [...DEFAULT_PROGRESSION[key]];
      }
    }

    return progression;
  }

  bindEvents() {
    this.listen(this.gameState, "passengers:delivered", (payload) => {
      this.recordDelivery(payload);
    });

    this.listen(this.gameState, "traffic:near-miss", () => {
      this.recordNearMiss();
    });

    this.listen(this.gameState, "run:finished", (payload) => {
      this.recordTrip(payload);
    });

    this.listen(this.gameState, "run:distance", (payload) => {
      this.recordDistance(payload);
    });

    this.listen(this.eventBus, "passengers:delivered", (payload) => {
      this.recordDelivery(payload);
    });

    this.listen(this.eventBus, "traffic:near-miss", () => {
      this.recordNearMiss();
    });

    this.listen(this.eventBus, "run:finished", (payload) => {
      this.recordTrip(payload);
    });

    this.listen(this.eventBus, "run:distance", (payload) => {
      this.recordDistance(payload);
    });
  }

  listen(source, eventName, callback) {
    if (!source) return;

    if (typeof source.on === "function") {
      const unsubscribe = source.on(eventName, callback);

      if (typeof unsubscribe === "function") {
        this.listeners.push(unsubscribe);
      } else if (typeof source.off === "function") {
        this.listeners.push(() => source.off(eventName, callback));
      } else if (typeof source.removeListener === "function") {
        this.listeners.push(() =>
          source.removeListener(eventName, callback)
        );
      }
    } else if (typeof source.addEventListener === "function") {
      source.addEventListener(eventName, callback);
      this.listeners.push(() =>
        source.removeEventListener(eventName, callback)
      );
    }
  }

  getXPForNextLevel(level = this.profile.level) {
    const base = Number(GAME_CONFIG.progression?.baseXP) || 500;
    const growth = Number(GAME_CONFIG.progression?.xpGrowth) || 1.35;

    return Math.max(100, Math.floor(base * Math.pow(growth, level - 1)));
  }

  getTotalXPForLevel(level) {
    let total = 0;

    for (let current = 1; current < level; current += 1) {
      total += this.getXPForNextLevel(current);
    }

    return total;
  }

  getLevelProgress() {
    const level = this.profile.level;
    const xpNeeded = this.getXPForNextLevel(level);

    return {
      level,
      xp: this.profile.xp,
      xpNeeded,
      progress: Math.min(1, this.profile.xp / xpNeeded),
      remaining: Math.max(0, xpNeeded - this.profile.xp),
    };
  }

  addXP(amount, reason = "activity") {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return { gained: 0, levelsGained: 0, level: this.profile.level };
    }

    this.profile.xp += value;

    let levelsGained = 0;

    while (
      this.profile.xp >= this.getXPForNextLevel(this.profile.level)
    ) {
      this.profile.xp -= this.getXPForNextLevel(this.profile.level);
      this.profile.level += 1;
      levelsGained += 1;

      this.emit("progression:level-up", {
        level: this.profile.level,
        reason,
      });
    }

    if (levelsGained > 0) {
      this.checkUnlocks();
    }

    this.persist();

    this.emit("progression:xp-gained", {
      amount: value,
      reason,
      levelsGained,
      ...this.getLevelProgress(),
    });

    return {
      gained: value,
      levelsGained,
      level: this.profile.level,
    };
  }

  recordDelivery(payload = {}) {
    this.profile.totalDeliveries += 1;

    const fare = Math.max(0, Number(payload.fare ?? payload.amount) || 0);
    this.profile.totalEarnings += fare;

    const xp = Math.max(0, Number(payload.xp) || 0);

    if (xp > 0) {
      this.addXP(xp, "passenger_delivery");
    }

    this.checkAchievements();
    this.persist();
  }

  recordNearMiss() {
    this.profile.totalNearMisses += 1;
    this.checkAchievements();
    this.persist();
  }

  recordDistance(payload = {}) {
    const distance = Math.max(0, Number(payload.distance) || 0);

    if (distance <= 0) return;

    this.profile.totalDistance += distance;
    this.checkAchievements();
    this.persist();
  }

  recordTrip(payload = {}) {
    if (payload.cancelled === true) return;

    this.profile.totalTrips += 1;

    const distance = Math.max(0, Number(payload.distance) || 0);

    if (distance > 0) {
      this.profile.totalDistance += distance;
    }

    this.checkAchievements();
    this.persist();
  }

  checkAchievements() {
    const stats = this.profile;
    const unlocked = new Set(stats.achievements);
    const newlyUnlocked = [];

    for (const achievement of ACHIEVEMENTS) {
      if (unlocked.has(achievement.id)) continue;
      if (!achievement.check(stats)) continue;

      stats.achievements.push(achievement.id);
      newlyUnlocked.push(achievement);

      const reward = Math.max(0, Number(achievement.reward) || 0);

      if (reward > 0) {
        this.gameState.profile.money =
          Math.max(0, Number(this.gameState.profile.money) || 0) + reward;
      }

      this.emit("progression:achievement-unlocked", {
        ...achievement,
        reward,
      });
    }

    if (newlyUnlocked.length > 0) {
      this.persist();
    }

    return newlyUnlocked;
  }

  checkUnlocks() {
    const unlockedNow = [];

    for (const item of this.unlockDefinitions) {
      if (this.profile.level < item.level) continue;

      const list = this.getUnlockList(item.type);
      if (!list || list.includes(item.id)) continue;

      list.push(item.id);
      unlockedNow.push(item);

      this.emit("progression:item-unlocked", {
        ...item,
        currentLevel: this.profile.level,
      });
    }

    if (unlockedNow.length > 0) {
      this.persist();
    }

    return unlockedNow;
  }

  getUnlockList(type) {
    switch (type) {
      case "driver":
        return this.profile.unlockedDrivers;
      case "vehicle":
        return this.profile.unlockedVehicles;
      case "route":
        return this.profile.unlockedRoutes;
      default:
        return null;
    }
  }

  isUnlocked(type, id) {
    const list = this.getUnlockList(type);
    return Boolean(list?.includes(id));
  }

  getAchievements() {
    const unlocked = new Set(this.profile.achievements);

    return ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: unlocked.has(achievement.id),
    }));
  }

  getAvailableUnlocks(type = null) {
    return this.unlockDefinitions
      .filter((item) => !type || item.type === type)
      .map((item) => ({
        ...item,
        unlocked: this.isUnlocked(item.type, item.id),
        availableAtCurrentLevel: this.profile.level >= item.level,
      }));
  }

  persist() {
    if (this.saveManager && typeof this.saveManager.saveProfile === "function") {
      this.saveManager.saveProfile(this.gameState.profile);
    }

    this.emit("progression:updated", {
      ...this.profile,
      levelProgress: this.getLevelProgress(),
    });
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
    this.gameState.profile.progression = structuredClone(DEFAULT_PROGRESSION);
    this.profile = this.ensureProfile();
    this.persist();
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Ignore already-removed listeners.
      }
    }

    this.listeners.length = 0;
  }
}