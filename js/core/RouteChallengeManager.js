import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteChallenges";

const DEFAULT_CHALLENGES = [
  {
    id: "first-fare",
    title: "First Fare",
    description: "Complete your first passenger trip.",
    type: "passengers",
    target: 1,
    reward: 250,
    difficulty: "easy",
  },
  {
    id: "city-explorer",
    title: "City Explorer",
    description: "Travel 5 kilometres in a single run.",
    type: "distance",
    target: 5,
    reward: 500,
    difficulty: "easy",
  },
  {
    id: "safe-driver",
    title: "Safe Driver",
    description: "Complete a run without crashing.",
    type: "no_crashes",
    target: 1,
    reward: 750,
    difficulty: "medium",
  },
  {
    id: "daily-earner",
    title: "Daily Earner",
    description: "Earn ₦2,000 from completed trips.",
    type: "earnings",
    target: 2000,
    reward: 600,
    difficulty: "medium",
  },
  {
    id: "long-haul",
    title: "Long-Haul Driver",
    description: "Travel 15 kilometres in total.",
    type: "total_distance",
    target: 15,
    reward: 1000,
    difficulty: "hard",
  },
];

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeChallenge(challenge) {
  return {
    ...challenge,
    id: String(challenge.id),
    target: Math.max(1, numberOr(challenge.target, 1)),
    reward: Math.max(0, Math.floor(numberOr(challenge.reward))),
    difficulty: String(challenge.difficulty || "easy"),
    progress: 0,
    completed: false,
    claimed: false,
  };
}

export class RouteChallengeManager {
  constructor({
    eventBus = EventBus,
    saveManager = null,
    economySystem = null,
    storage = globalThis.localStorage,
    challenges = DEFAULT_CHALLENGES,
    dailyReset = true,
  } = {}) {
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.economySystem = economySystem;
    this.storage = storage;
    this.dailyReset = dailyReset;
    this.dateKey = localDateKey();
    this.challenges = new Map();
    this.destroyed = false;

    for (const challenge of challenges) {
      if (!challenge?.id) continue;

      this.challenges.set(
        String(challenge.id),
        normalizeChallenge(challenge)
      );
    }

    this.load();
    this.checkDailyReset();
  }

  load() {
    let saved = null;

    try {
      saved = this.saveManager?.get?.("routeChallenges") ?? null;
    } catch (error) {
      Logger.warn?.("Could not load challenges from SaveManager.", error);
    }

    if (!saved) {
      try {
        const raw = this.storage?.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch (error) {
        Logger.warn?.("Could not read saved challenges.", error);
      }
    }

    if (!saved || typeof saved !== "object") return;

    if (saved.dateKey) {
      this.dateKey = String(saved.dateKey);
    }

    if (!Array.isArray(saved.challenges)) return;

    for (const item of saved.challenges) {
      if (!item || typeof item.id !== "string") continue;

      const challenge = this.challenges.get(item.id);
      if (!challenge) continue;

      challenge.progress = Math.max(
        0,
        numberOr(item.progress, 0)
      );

      challenge.completed = Boolean(item.completed);
      challenge.claimed = Boolean(item.claimed);
    }
  }

  checkDailyReset() {
    if (!this.dailyReset) return false;

    const today = localDateKey();

    if (today === this.dateKey) return false;

    this.dateKey = today;

    for (const challenge of this.challenges.values()) {
      challenge.progress = 0;
      challenge.completed = false;
      challenge.claimed = false;
    }

    this.persist();

    this.emit("challenges:daily-reset", {
      dateKey: this.dateKey,
    });

    return true;
  }

  updateProgress(type, amount = 1, metadata = {}) {
    if (this.destroyed) return [];

    this.checkDailyReset();

    const delta = Math.max(0, numberOr(amount, 0));
    const newlyCompleted = [];

    for (const challenge of this.challenges.values()) {
      if (challenge.type !== type || challenge.completed) continue;

      if (
        metadata.challengeId &&
        metadata.challengeId !== challenge.id
      ) {
        continue;
      }

      challenge.progress = Math.min(
        challenge.target,
        challenge.progress + delta
      );

      if (challenge.progress >= challenge.target) {
        challenge.completed = true;

        const completed = this.getChallenge(challenge.id);
        newlyCompleted.push(completed);

        this.emit("challenges:completed", {
          challenge: completed,
        });
      } else {
        this.emit("challenges:progress", {
          challenge: this.getChallenge(challenge.id),
        });
      }
    }

    if (newlyCompleted.length > 0 || delta > 0) {
      this.persist();
    }

    return newlyCompleted;
  }

  recordRun(run = {}) {
    if (this.destroyed) return [];

    this.checkDailyReset();

    const completed = [];

    const addCompleted = (items) => {
      completed.push(...items);
    };

    addCompleted(
      this.updateProgress("distance", numberOr(run.distance, 0))
    );

    addCompleted(
      this.updateProgress("earnings", numberOr(run.earnings, 0))
    );

    addCompleted(
      this.updateProgress("passengers", numberOr(run.passengers, 0))
    );

    addCompleted(
      this.updateProgress(
        "total_distance",
        numberOr(run.distance, 0)
      )
    );

    if (numberOr(run.crashes, 0) === 0) {
      addCompleted(this.updateProgress("no_crashes", 1));
    }

    this.emit("challenges:run-recorded", {
      run: { ...run },
      completed: completed.map((item) => ({ ...item })),
    });

    this.persist();

    return completed;
  }

  getChallenge(id) {
    const challenge = this.challenges.get(String(id));

    return challenge ? { ...challenge } : null;
  }

  getChallenges({ completed = null, claimed = null } = {}) {
    return [...this.challenges.values()]
      .filter((challenge) => {
        if (
          completed !== null &&
          challenge.completed !== completed
        ) {
          return false;
        }

        if (claimed !== null && challenge.claimed !== claimed) {
          return false;
        }

        return true;
      })
      .map((challenge) => ({
        ...challenge,
        progressRatio: Math.min(
          1,
          challenge.progress / challenge.target
        ),
      }));
  }

  claimReward(id) {
    if (this.destroyed) {
      return { success: false, reason: "destroyed" };
    }

    const challenge = this.challenges.get(String(id));

    if (!challenge) {
      return { success: false, reason: "not_found" };
    }

    if (!challenge.completed) {
      return { success: false, reason: "not_completed" };
    }

    if (challenge.claimed) {
      return { success: false, reason: "already_claimed" };
    }

    const result = this.creditReward(challenge.reward);

    if (!result.success) {
      return {
        success: false,
        reason: "economy_unavailable",
      };
    }

    challenge.claimed = true;
    this.persist();

    const payload = {
      challenge: this.getChallenge(challenge.id),
      reward: challenge.reward,
    };

    this.emit("challenges:reward-claimed", payload);

    return {
      success: true,
      ...payload,
    };
  }

  creditReward(amount) {
    if (amount <= 0) {
      return { success: true };
    }

    const economy = this.economySystem;

    if (!economy) {
      this.emit("challenges:reward-issued", { amount });
      return { success: true, externalHandling: true };
    }

    try {
      if (typeof economy.addMoney === "function") {
        economy.addMoney(amount, "route-challenge");
        return { success: true };
      }

      if (typeof economy.earn === "function") {
        economy.earn(amount, "route-challenge");
        return { success: true };
      }

      if (typeof economy.credit === "function") {
        economy.credit(amount, "route-challenge");
        return { success: true };
      }
    } catch (error) {
      Logger.error?.("Failed to credit challenge reward.", error);
      return { success: false };
    }

    return { success: false };
  }

  getSummary() {
    const challenges = [...this.challenges.values()];

    return {
      dateKey: this.dateKey,
      total: challenges.length,
      completed: challenges.filter((item) => item.completed).length,
      claimed: challenges.filter((item) => item.claimed).length,
      claimable: challenges.filter(
        (item) => item.completed && !item.claimed
      ).length,
      availableRewards: challenges
        .filter((item) => item.completed && !item.claimed)
        .reduce((total, item) => total + item.reward, 0),
    };
  }

  reset({ force = false } = {}) {
    if (this.destroyed) return;

    for (const challenge of this.challenges.values()) {
      challenge.progress = 0;
      challenge.completed = false;
      challenge.claimed = false;
    }

    this.dateKey = localDateKey();

    this.persist();

    this.emit("challenges:reset", {
      force,
      dateKey: this.dateKey,
    });
  }

  exportData() {
    return {
      version: 1,
      dateKey: this.dateKey,
      challenges: [...this.challenges.values()].map((challenge) => ({
        id: challenge.id,
        progress: challenge.progress,
        completed: challenge.completed,
        claimed: challenge.claimed,
      })),
    };
  }

  importData(data) {
    if (!data || !Array.isArray(data.challenges)) {
      throw new TypeError("Invalid challenge import data.");
    }

    for (const item of data.challenges) {
      if (!item || typeof item.id !== "string") continue;

      const challenge = this.challenges.get(item.id);
      if (!challenge) continue;

      challenge.progress = Math.min(
        challenge.target,
        Math.max(0, numberOr(item.progress, 0))
      );

      challenge.completed =
        Boolean(item.completed) ||
        challenge.progress >= challenge.target;

      challenge.claimed =
        challenge.completed && Boolean(item.claimed);
    }

    if (typeof data.dateKey === "string") {
      this.dateKey = data.dateKey;
    }

    this.persist();

    this.emit("challenges:imported", this.getSummary());

    return this.getChallenges();
  }

  persist() {
    const data = this.exportData();

    try {
      this.saveManager?.set?.("routeChallenges", data);
    } catch (error) {
      Logger.warn?.("Could not save challenges through SaveManager.", error);
    }

    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      Logger.warn?.("Could not persist challenges to local storage.", error);
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
    this.challenges.clear();
    this.eventBus = null;
    this.saveManager = null;
    this.economySystem = null;
    this.storage = null;
  }
}

export default RouteChallengeManager;