import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteAchievements";

const DEFAULT_ACHIEVEMENTS = [
  {
    id: "first-drive",
    title: "First Drive",
    description: "Complete your first driving run.",
    category: "driving",
    type: "runs",
    target: 1,
    reward: 250,
  },
  {
    id: "road-warrior",
    title: "Road Warrior",
    description: "Complete 25 driving runs.",
    category: "driving",
    type: "runs",
    target: 25,
    reward: 1500,
  },
  {
    id: "distance-explorer",
    title: "Distance Explorer",
    description: "Travel 100 kilometres.",
    category: "exploration",
    type: "distance",
    target: 100,
    reward: 2000,
  },
  {
    id: "passenger-champion",
    title: "Passenger Champion",
    description: "Transport 100 passengers.",
    category: "service",
    type: "passengers",
    target: 100,
    reward: 1500,
  },
  {
    id: "fare-master",
    title: "Fare Master",
    description: "Earn ₦50,000 in fares.",
    category: "economy",
    type: "earnings",
    target: 50000,
    reward: 3000,
  },
  {
    id: "clean-driver",
    title: "Clean Driver",
    description: "Complete 10 runs without crashing.",
    category: "driving",
    type: "clean_runs",
    target: 10,
    reward: 2000,
  },
  {
    id: "route-collector",
    title: "Route Collector",
    description: "Complete runs on 10 different routes.",
    category: "exploration",
    type: "unique_routes",
    target: 10,
    reward: 2500,
  },
  {
    id: "high-scorer",
    title: "High Scorer",
    description: "Score at least 10,000 points in one run.",
    category: "skill",
    type: "single_score",
    target: 10000,
    reward: 1500,
  },
  {
    id: "collision-survivor",
    title: "Collision Survivor",
    description: "Complete 5 runs with at least one crash.",
    category: "skill",
    type: "crash_runs",
    target: 5,
    reward: 1000,
  },
  {
    id: "kano-legend",
    title: "Kano Legend",
    description: "Complete 100 driving runs.",
    category: "driving",
    type: "runs",
    target: 100,
    reward: 10000,
  },
];

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAchievement(definition) {
  return {
    ...definition,
    id: String(definition.id),
    title: String(definition.title || definition.id),
    description: String(definition.description || ""),
    category: String(definition.category || "general"),
    type: String(definition.type || "runs"),
    target: Math.max(1, toNumber(definition.target, 1)),
    reward: Math.max(0, Math.floor(toNumber(definition.reward))),
    progress: 0,
    unlocked: false,
    unlockedAt: null,
    rewardClaimed: false,
  };
}

export class RouteAchievementManager {
  constructor({
    eventBus = EventBus,
    saveManager = null,
    economySystem = null,
    storage = globalThis.localStorage,
    achievements = DEFAULT_ACHIEVEMENTS,
  } = {}) {
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.economySystem = economySystem;
    this.storage = storage;
    this.achievements = new Map();
    this.completedRoutes = new Set();
    this.destroyed = false;

    for (const definition of achievements) {
      if (!definition?.id) continue;

      this.achievements.set(
        String(definition.id),
        normalizeAchievement(definition)
      );
    }

    this.load();
  }

  load() {
    let saved = null;

    try {
      saved = this.saveManager?.get?.("routeAchievements") ?? null;
    } catch (error) {
      Logger.warn?.("Could not load achievements from SaveManager.", error);
    }

    if (!saved) {
      try {
        const raw = this.storage?.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch (error) {
        Logger.warn?.("Could not read saved achievements.", error);
      }
    }

    if (!saved || typeof saved !== "object") return;

    if (Array.isArray(saved.completedRoutes)) {
      this.completedRoutes = new Set(
        saved.completedRoutes.map(String)
      );
    }

    if (!Array.isArray(saved.achievements)) return;

    for (const item of saved.achievements) {
      if (!item || typeof item.id !== "string") continue;

      const achievement = this.achievements.get(item.id);
      if (!achievement) continue;

      achievement.progress = Math.max(
        0,
        toNumber(item.progress, 0)
      );

      achievement.unlocked = Boolean(item.unlocked);
      achievement.unlockedAt =
        item.unlockedAt == null
          ? null
          : toNumber(item.unlockedAt, null);

      achievement.rewardClaimed = Boolean(item.rewardClaimed);
    }
  }

  recordRun(run = {}) {
    if (this.destroyed) return [];

    const distance = Math.max(0, toNumber(run.distance));
    const passengers = Math.max(0, toNumber(run.passengers));
    const earnings = Math.max(0, toNumber(run.earnings));
    const score = Math.max(0, toNumber(run.score));
    const crashes = Math.max(0, toNumber(run.crashes));
    const routeId = String(run.routeId || "citycenter");

    const newlyUnlocked = [];

    this.increment("runs", 1, newlyUnlocked);
    this.increment("distance", distance, newlyUnlocked);
    this.increment("passengers", passengers, newlyUnlocked);
    this.increment("earnings", earnings, newlyUnlocked);

    if (crashes === 0) {
      this.increment("clean_runs", 1, newlyUnlocked);
    }

    if (crashes > 0) {
      this.increment("crash_runs", 1, newlyUnlocked);
    }

    this.completedRoutes.add(routeId);
    this.setProgress(
      "unique_routes",
      this.completedRoutes.size,
      newlyUnlocked
    );

    this.setProgress("single_score", score, newlyUnlocked);

    this.persist();

    this.emit("achievements:run-recorded", {
      run: { ...run },
      newlyUnlocked: newlyUnlocked.map((item) => ({ ...item })),
    });

    return newlyUnlocked;
  }

  increment(type, amount, newlyUnlocked = []) {
    if (amount <= 0) return [];

    const changed = [];

    for (const achievement of this.achievements.values()) {
      if (achievement.type !== type || achievement.unlocked) continue;

      achievement.progress = Math.min(
        achievement.target,
        achievement.progress + amount
      );

      changed.push(achievement);

      if (achievement.progress >= achievement.target) {
        this.unlock(achievement, newlyUnlocked);
      } else {
        this.emit("achievements:progress", {
          achievement: this.getAchievement(achievement.id),
        });
      }
    }

    return changed;
  }

  setProgress(type, value, newlyUnlocked = []) {
    for (const achievement of this.achievements.values()) {
      if (achievement.type !== type || achievement.unlocked) continue;

      achievement.progress = Math.min(
        achievement.target,
        Math.max(0, toNumber(value))
      );

      if (achievement.progress >= achievement.target) {
        this.unlock(achievement, newlyUnlocked);
      } else {
        this.emit("achievements:progress", {
          achievement: this.getAchievement(achievement.id),
        });
      }
    }
  }

  unlock(achievement, newlyUnlocked = []) {
    if (achievement.unlocked) return;

    achievement.unlocked = true;
    achievement.unlockedAt = Date.now();
    achievement.progress = achievement.target;

    const result = this.getAchievement(achievement.id);
    newlyUnlocked.push(result);

    this.emit("achievements:unlocked", {
      achievement: result,
      reward: achievement.reward,
    });
  }

  getAchievement(id) {
    const achievement = this.achievements.get(String(id));

    return achievement ? { ...achievement } : null;
  }

  getAchievements({
    category = null,
    unlocked = null,
    rewardClaimed = null,
  } = {}) {
    return [...this.achievements.values()]
      .filter((achievement) => {
        if (category && achievement.category !== category) return false;

        if (
          unlocked !== null &&
          achievement.unlocked !== unlocked
        ) {
          return false;
        }

        if (
          rewardClaimed !== null &&
          achievement.rewardClaimed !== rewardClaimed
        ) {
          return false;
        }

        return true;
      })
      .map((achievement) => ({
        ...achievement,
        progressRatio: Math.min(
          1,
          achievement.progress / achievement.target
        ),
      }));
  }

  claimReward(id) {
    if (this.destroyed) {
      return { success: false, reason: "destroyed" };
    }

    const achievement = this.achievements.get(String(id));

    if (!achievement) {
      return { success: false, reason: "not_found" };
    }

    if (!achievement.unlocked) {
      return { success: false, reason: "not_unlocked" };
    }

    if (achievement.rewardClaimed) {
      return { success: false, reason: "already_claimed" };
    }

    const credit = this.creditReward(achievement.reward);

    if (!credit.success) {
      return { success: false, reason: "economy_unavailable" };
    }

    achievement.rewardClaimed = true;
    this.persist();

    const result = {
      success: true,
      achievement: this.getAchievement(id),
      reward: achievement.reward,
    };

    this.emit("achievements:reward-claimed", result);

    return result;
  }

  creditReward(amount) {
    if (amount <= 0) return { success: true };

    if (!this.economySystem) {
      this.emit("achievements:reward-issued", { amount });
      return { success: true, externalHandling: true };
    }

    try {
      if (typeof this.economySystem.addMoney === "function") {
        this.economySystem.addMoney(amount, "achievement");
        return { success: true };
      }

      if (typeof this.economySystem.earn === "function") {
        this.economySystem.earn(amount, "achievement");
        return { success: true };
      }

      if (typeof this.economySystem.credit === "function") {
        this.economySystem.credit(amount, "achievement");
        return { success: true };
      }
    } catch (error) {
      Logger.error?.("Failed to credit achievement reward.", error);
    }

    return { success: false };
  }

  getSummary() {
    const achievements = [...this.achievements.values()];

    return {
      total: achievements.length,
      unlocked: achievements.filter((item) => item.unlocked).length,
      locked: achievements.filter((item) => !item.unlocked).length,
      claimed: achievements.filter((item) => item.rewardClaimed).length,
      claimable: achievements.filter(
        (item) => item.unlocked && !item.rewardClaimed
      ).length,
      totalRewardsClaimable: achievements
        .filter((item) => item.unlocked && !item.rewardClaimed)
        .reduce((sum, item) => sum + item.reward, 0),
      completedRoutes: this.completedRoutes.size,
    };
  }

  exportData() {
    return {
      version: 1,
      exportedAt: Date.now(),
      completedRoutes: [...this.completedRoutes],
      achievements: [...this.achievements.values()].map((item) => ({
        id: item.id,
        progress: item.progress,
        unlocked: item.unlocked,
        unlockedAt: item.unlockedAt,
        rewardClaimed: item.rewardClaimed,
      })),
    };
  }

  importData(data, { merge = false } = {}) {
    if (!data || !Array.isArray(data.achievements)) {
      throw new TypeError("Invalid achievement import data.");
    }

    if (!merge) {
      this.completedRoutes.clear();

      for (const achievement of this.achievements.values()) {
        achievement.progress = 0;
        achievement.unlocked = false;
        achievement.unlockedAt = null;
        achievement.rewardClaimed = false;
      }
    }

    if (Array.isArray(data.completedRoutes)) {
      for (const routeId of data.completedRoutes) {
        this.completedRoutes.add(String(routeId));
      }
    }

    for (const item of data.achievements) {
      if (!item || typeof item.id !== "string") continue;

      const achievement = this.achievements.get(item.id);
      if (!achievement) continue;

      achievement.progress = Math.max(
        achievement.progress,
        Math.min(
          achievement.target,
          Math.max(0, toNumber(item.progress))
        )
      );

      achievement.unlocked =
        achievement.unlocked || Boolean(item.unlocked);

      achievement.unlockedAt =
        achievement.unlockedAt ??
        (item.unlockedAt == null
          ? null
          : toNumber(item.unlockedAt, null));

      achievement.rewardClaimed =
        achievement.rewardClaimed || Boolean(item.rewardClaimed);
    }

    this.persist();

    this.emit("achievements:imported", this.getSummary());

    return this.getAchievements();
  }

  persist() {
    const data = this.exportData();

    try {
      this.saveManager?.set?.("routeAchievements", data);
    } catch (error) {
      Logger.warn?.("Could not save achievements through SaveManager.", error);
    }

    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      Logger.warn?.("Could not persist achievements to local storage.", error);
    }
  }

  emit(eventName, payload) {
    if (typeof this.eventBus?.emit === "function") {
      this.eventBus.emit(eventName, payload);
    } else if (typeof this.eventBus?.dispatch === "function") {
      this.eventBus.dispatch(eventName, payload);
    }
  }

  destroy() {
    this.destroyed = true;
    this.achievements.clear();
    this.completedRoutes.clear();
    this.eventBus = null;
    this.saveManager = null;
    this.economySystem = null;
    this.storage = null;
  }
}

export default RouteAchievementManager;