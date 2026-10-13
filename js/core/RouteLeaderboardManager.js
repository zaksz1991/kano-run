import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteLeaderboard";
const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 24;

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEntry(entry = {}) {
  return {
    id:
      typeof entry.id === "string" && entry.id
        ? entry.id
        : `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerName:
      typeof entry.playerName === "string"
        ? entry.playerName.trim().slice(0, MAX_NAME_LENGTH) || "Driver"
        : "Driver",
    routeId: String(entry.routeId || "citycenter"),
    routeName: String(entry.routeName || "Kano City Centre"),
    score: Math.max(0, Math.floor(safeNumber(entry.score))),
    distance: Math.max(0, safeNumber(entry.distance)),
    earnings: Math.max(0, Math.floor(safeNumber(entry.earnings))),
    passengers: Math.max(0, Math.floor(safeNumber(entry.passengers))),
    duration: Math.max(0, safeNumber(entry.duration)),
    crashes: Math.max(0, Math.floor(safeNumber(entry.crashes))),
    completedAt: safeNumber(entry.completedAt, Date.now()),
  };
}

export class RouteLeaderboardManager {
  constructor({
    eventBus = EventBus,
    saveManager = null,
    storage = globalThis.localStorage,
    maxEntries = MAX_ENTRIES,
    playerName = "Driver",
  } = {}) {
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.storage = storage;
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.playerName = String(playerName).slice(0, MAX_NAME_LENGTH);
    this.entries = [];
    this.destroyed = false;

    this.load();
  }

  load() {
    let saved = null;

    try {
      saved = this.saveManager?.get?.("routeLeaderboard") ?? null;
    } catch (error) {
      Logger.warn?.("Could not load leaderboard from SaveManager.", error);
    }

    if (!Array.isArray(saved)) {
      try {
        const raw = this.storage?.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : [];
      } catch (error) {
        Logger.warn?.("Could not read saved leaderboard.", error);
        saved = [];
      }
    }

    this.entries = (Array.isArray(saved) ? saved : [])
      .filter((entry) => entry && typeof entry === "object")
      .map(normalizeEntry)
      .sort((a, b) => b.score - a.score || a.duration - b.duration)
      .slice(0, this.maxEntries);

    this.emit("leaderboard:loaded", {
      count: this.entries.length,
    });

    return this.getEntries();
  }

  setPlayerName(name) {
    const normalized = String(name || "").trim().slice(0, MAX_NAME_LENGTH);
    this.playerName = normalized || "Driver";

    this.emit("leaderboard:player-name-changed", {
      playerName: this.playerName,
    });

    return this.playerName;
  }

  submitRun(run = {}) {
    if (this.destroyed) {
      throw new Error("RouteLeaderboardManager has been destroyed.");
    }

    const entry = normalizeEntry({
      ...run,
      playerName: run.playerName || this.playerName,
    });

    const existing = this.entries.find((item) => item.id === entry.id);

    if (existing) {
      return {
        entry: { ...existing },
        rank: this.getRank(existing.id),
        inserted: false,
      };
    }

    this.entries.push(entry);
    this.entries.sort(
      (a, b) => b.score - a.score || a.duration - b.duration
    );
    this.entries = this.entries.slice(0, this.maxEntries);

    const rank = this.getRank(entry.id);
    const rankedEntry = rank > 0 ? { ...entry } : null;

    this.persist();

    this.emit("leaderboard:run-submitted", {
      entry: { ...entry },
      rank,
      qualified: rank > 0,
    });

    if (rank === 1) {
      this.emit("leaderboard:new-record", {
        entry: { ...entry },
      });
    }

    return {
      entry: rankedEntry,
      rank,
      inserted: true,
    };
  }

  getEntries({ routeId = null, limit = this.maxEntries } = {}) {
    const normalizedLimit = Math.max(0, Math.floor(safeNumber(limit)));

    return this.entries
      .filter((entry) => !routeId || entry.routeId === routeId)
      .sort((a, b) => b.score - a.score || a.duration - b.duration)
      .slice(0, normalizedLimit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
  }

  getRank(entryId) {
    const index = this.entries.findIndex((entry) => entry.id === entryId);
    return index === -1 ? 0 : index + 1;
  }

  getPersonalBest(routeId) {
    const entries = this.entries.filter((entry) => entry.routeId === routeId);

    if (!entries.length) {
      return null;
    }

    return {
      ...entries.sort(
        (a, b) => b.score - a.score || a.duration - b.duration
      )[0],
    };
  }

  getStatistics(routeId = null) {
    const entries = this.entries.filter(
      (entry) => !routeId || entry.routeId === routeId
    );

    if (!entries.length) {
      return {
        runs: 0,
        highestScore: 0,
        averageScore: 0,
        totalEarnings: 0,
        totalPassengers: 0,
        totalDistance: 0,
        totalCrashes: 0,
      };
    }

    const sum = (key) =>
      entries.reduce((total, entry) => total + entry[key], 0);

    return {
      runs: entries.length,
      highestScore: Math.max(...entries.map((entry) => entry.score)),
      averageScore: Math.round(sum("score") / entries.length),
      totalEarnings: sum("earnings"),
      totalPassengers: sum("passengers"),
      totalDistance: Number(sum("distance").toFixed(2)),
      totalCrashes: sum("crashes"),
    };
  }

  clear({ routeId = null } = {}) {
    if (routeId) {
      this.entries = this.entries.filter(
        (entry) => entry.routeId !== routeId
      );
    } else {
      this.entries = [];
    }

    this.persist();

    this.emit("leaderboard:cleared", {
      routeId,
      count: this.entries.length,
    });
  }

  exportData() {
    return {
      version: 1,
      exportedAt: Date.now(),
      playerName: this.playerName,
      entries: this.entries.map((entry) => ({ ...entry })),
    };
  }

  importData(data, { merge = false } = {}) {
    if (!data || !Array.isArray(data.entries)) {
      throw new TypeError("Invalid leaderboard import data.");
    }

    const imported = data.entries
      .filter((entry) => entry && typeof entry === "object")
      .map(normalizeEntry);

    const combined = merge
      ? [...this.entries, ...imported]
      : imported;

    const unique = new Map();

    for (const entry of combined) {
      const existing = unique.get(entry.id);

      if (!existing || entry.score > existing.score) {
        unique.set(entry.id, entry);
      }
    }

    this.entries = [...unique.values()]
      .sort((a, b) => b.score - a.score || a.duration - b.duration)
      .slice(0, this.maxEntries);

    if (typeof data.playerName === "string") {
      this.setPlayerName(data.playerName);
    }

    this.persist();

    this.emit("leaderboard:imported", {
      count: this.entries.length,
    });

    return this.getEntries();
  }

  persist() {
    const data = this.entries.map((entry) => ({ ...entry }));

    try {
      this.saveManager?.set?.("routeLeaderboard", data);
    } catch (error) {
      Logger.warn?.("Could not save leaderboard through SaveManager.", error);
    }

    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      Logger.warn?.("Could not persist leaderboard to local storage.", error);
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
    this.entries = [];
    this.eventBus = null;
    this.saveManager = null;
    this.storage = null;
  }
}

export default RouteLeaderboardManager;