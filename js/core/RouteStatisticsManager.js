import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteStatistics";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createRouteStats(routeId) {
  return {
    routeId,
    runs: 0,
    completedRuns: 0,
    failedRuns: 0,
    totalDistance: 0,
    totalDuration: 0,
    totalScore: 0,
    bestScore: 0,
    totalEarnings: 0,
    totalPassengers: 0,
    totalCrashes: 0,
    cleanRuns: 0,
    lastPlayedAt: null,
    bestRunAt: null,
  };
}

export class RouteStatisticsManager {
  constructor({
    eventBus = EventBus,
    saveManager = null,
    storage = globalThis.localStorage,
    maxHistory = 500,
  } = {}) {
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.storage = storage;
    this.maxHistory = Math.max(1, Math.floor(maxHistory));

    this.routes = new Map();
    this.history = [];
    this.destroyed = false;

    this.load();
  }

  load() {
    let saved = null;

    try {
      saved = this.saveManager?.get?.("routeStatistics") ?? null;
    } catch (error) {
      Logger.warn?.(
        "Could not load route statistics from SaveManager.",
        error
      );
    }

    if (!saved) {
      try {
        const raw = this.storage?.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch (error) {
        Logger.warn?.("Could not read saved route statistics.", error);
      }
    }

    if (!saved || typeof saved !== "object") return;

    if (Array.isArray(saved.routes)) {
      for (const item of saved.routes) {
        if (!item || typeof item.routeId !== "string") continue;

        const stats = {
          ...createRouteStats(item.routeId),
          ...item,
        };

        for (const key of [
          "runs",
          "completedRuns",
          "failedRuns",
          "totalDistance",
          "totalDuration",
          "totalScore",
          "bestScore",
          "totalEarnings",
          "totalPassengers",
          "totalCrashes",
          "cleanRuns",
        ]) {
          stats[key] = Math.max(0, toNumber(stats[key]));
        }

        this.routes.set(stats.routeId, stats);
      }
    }

    if (Array.isArray(saved.history)) {
      this.history = saved.history
        .filter((item) => item && typeof item === "object")
        .slice(-this.maxHistory)
        .map((item) => ({ ...item }));
    }
  }

  recordRun(run = {}) {
    if (this.destroyed) {
      throw new Error("RouteStatisticsManager has been destroyed.");
    }

    const routeId = String(run.routeId || "citycenter");
    const stats = this.getOrCreateRoute(routeId);

    const distance = Math.max(0, toNumber(run.distance));
    const duration = Math.max(0, toNumber(run.duration));
    const score = Math.max(0, Math.floor(toNumber(run.score)));
    const earnings = Math.max(0, Math.floor(toNumber(run.earnings)));
    const passengers = Math.max(0, Math.floor(toNumber(run.passengers)));
    const crashes = Math.max(0, Math.floor(toNumber(run.crashes)));

    const completed = run.completed !== false;
    const timestamp = Math.max(0, toNumber(run.completedAt, Date.now()));

    stats.runs += 1;
    stats.completedRuns += completed ? 1 : 0;
    stats.failedRuns += completed ? 0 : 1;
    stats.totalDistance += distance;
    stats.totalDuration += duration;
    stats.totalScore += score;
    stats.totalEarnings += earnings;
    stats.totalPassengers += passengers;
    stats.totalCrashes += crashes;
    stats.lastPlayedAt = timestamp;

    if (crashes === 0 && completed) {
      stats.cleanRuns += 1;
    }

    if (score > stats.bestScore) {
      stats.bestScore = score;
      stats.bestRunAt = timestamp;
    }

    const historyEntry = {
      id:
        typeof run.id === "string" && run.id
          ? run.id
          : `run-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      routeId,
      routeName: String(run.routeName || routeId),
      distance,
      duration,
      score,
      earnings,
      passengers,
      crashes,
      completed,
      completedAt: timestamp,
    };

    this.history.push(historyEntry);

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    this.persist();

    const result = {
      route: this.getRouteStatistics(routeId),
      overall: this.getOverallStatistics(),
      run: { ...historyEntry },
    };

    this.emit("route-statistics:updated", result);

    return result;
  }

  getOrCreateRoute(routeId) {
    const key = String(routeId || "citycenter");

    if (!this.routes.has(key)) {
      this.routes.set(key, createRouteStats(key));
    }

    return this.routes.get(key);
  }

  getRouteStatistics(routeId) {
    const stats = this.routes.get(String(routeId));

    if (!stats) {
      return {
        ...createRouteStats(String(routeId)),
        averageScore: 0,
        averageDistance: 0,
        averageDuration: 0,
        completionRate: 0,
        crashRate: 0,
      };
    }

    return {
      ...stats,
      averageScore: stats.runs
        ? Math.round(stats.totalScore / stats.runs)
        : 0,
      averageDistance: stats.runs
        ? Number((stats.totalDistance / stats.runs).toFixed(2))
        : 0,
      averageDuration: stats.runs
        ? Number((stats.totalDuration / stats.runs).toFixed(2))
        : 0,
      completionRate: stats.runs
        ? Number(((stats.completedRuns / stats.runs) * 100).toFixed(1))
        : 0,
      crashRate: stats.runs
        ? Number(((stats.totalCrashes / stats.runs) * 100).toFixed(1))
        : 0,
    };
  }

  getOverallStatistics() {
    const all = [...this.routes.values()];

    const sum = (key) =>
      all.reduce((total, item) => total + toNumber(item[key]), 0);

    const runs = sum("runs");
    const completedRuns = sum("completedRuns");
    const totalDistance = sum("totalDistance");
    const totalDuration = sum("totalDuration");
    const totalScore = sum("totalScore");
    const totalEarnings = sum("totalEarnings");
    const totalPassengers = sum("totalPassengers");
    const totalCrashes = sum("totalCrashes");

    return {
      routesPlayed: all.filter((item) => item.runs > 0).length,
      runs,
      completedRuns,
      failedRuns: sum("failedRuns"),
      totalDistance: Number(totalDistance.toFixed(2)),
      totalDuration: Number(totalDuration.toFixed(2)),
      totalScore,
      bestScore: Math.max(0, ...all.map((item) => item.bestScore)),
      totalEarnings,
      totalPassengers,
      totalCrashes,
      cleanRuns: sum("cleanRuns"),
      averageScore: runs ? Math.round(totalScore / runs) : 0,
      averageDistance: runs
        ? Number((totalDistance / runs).toFixed(2))
        : 0,
      averageDuration: runs
        ? Number((totalDuration / runs).toFixed(2))
        : 0,
      completionRate: runs
        ? Number(((completedRuns / runs) * 100).toFixed(1))
        : 0,
    };
  }

  getRouteRanking(metric = "bestScore", limit = 10) {
    const allowedMetrics = new Set([
      "runs",
      "completedRuns",
      "totalDistance",
      "totalScore",
      "bestScore",
      "totalEarnings",
      "totalPassengers",
      "cleanRuns",
    ]);

    if (!allowedMetrics.has(metric)) {
      throw new TypeError(`Unsupported route ranking metric: ${metric}`);
    }

    return [...this.routes.values()]
      .filter((item) => item.runs > 0)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, Math.max(0, Math.floor(toNumber(limit, 10))))
      .map((item, index) => ({
        rank: index + 1,
        routeId: item.routeId,
        value: item[metric],
        ...this.getRouteStatistics(item.routeId),
      }));
  }

  getHistory({
    routeId = null,
    limit = 50,
    completed = null,
  } = {}) {
    return this.history
      .filter((item) => !routeId || item.routeId === routeId)
      .filter(
        (item) => completed === null || item.completed === completed
      )
      .slice(-Math.max(0, Math.floor(toNumber(limit, 50))))
      .reverse()
      .map((item) => ({ ...item }));
  }

  getPersonalBest(routeId) {
    const stats = this.routes.get(String(routeId));

    if (!stats || stats.runs === 0) return null;

    const bestRun = this.history
      .filter((item) => item.routeId === String(routeId))
      .sort((a, b) => b.score - a.score)[0];

    return bestRun ? { ...bestRun } : null;
  }

  resetRoute(routeId) {
    const key = String(routeId);

    this.routes.delete(key);
    this.history = this.history.filter((item) => item.routeId !== key);

    this.persist();

    this.emit("route-statistics:route-reset", {
      routeId: key,
    });
  }

  resetAll() {
    this.routes.clear();
    this.history = [];

    this.persist();

    this.emit("route-statistics:reset", {});
  }

  exportData() {
    return {
      version: 1,
      exportedAt: Date.now(),
      routes: [...this.routes.values()].map((item) => ({ ...item })),
      history: this.history.map((item) => ({ ...item })),
    };
  }

  importData(data, { merge = false } = {}) {
    if (!data || !Array.isArray(data.routes)) {
      throw new TypeError("Invalid route statistics import data.");
    }

    if (!merge) {
      this.routes.clear();
      this.history = [];
    }

    for (const item of data.routes) {
      if (!item || typeof item.routeId !== "string") continue;

      const incoming = {
        ...createRouteStats(item.routeId),
        ...item,
      };

      if (!merge || !this.routes.has(incoming.routeId)) {
        this.routes.set(incoming.routeId, incoming);
        continue;
      }

      const current = this.routes.get(incoming.routeId);

      for (const key of [
        "runs",
        "completedRuns",
        "failedRuns",
        "totalDistance",
        "totalDuration",
        "totalScore",
        "totalEarnings",
        "totalPassengers",
        "totalCrashes",
        "cleanRuns",
      ]) {
        current[key] =
          toNumber(current[key]) + toNumber(incoming[key]);
      }

      if (incoming.bestScore > current.bestScore) {
        current.bestScore = incoming.bestScore;
        current.bestRunAt = incoming.bestRunAt;
      }

      if (
        incoming.lastPlayedAt &&
        (!current.lastPlayedAt ||
          incoming.lastPlayedAt > current.lastPlayedAt)
      ) {
        current.lastPlayedAt = incoming.lastPlayedAt;
      }
    }

    if (Array.isArray(data.history)) {
      this.history.push(
        ...data.history
          .filter((item) => item && typeof item === "object")
          .map((item) => ({ ...item }))
      );

      this.history = this.history.slice(-this.maxHistory);
    }

    this.persist();

    this.emit("route-statistics:imported", {
      overall: this.getOverallStatistics(),
    });

    return this.getOverallStatistics();
  }

  persist() {
    const data = this.exportData();

    try {
      this.saveManager?.set?.("routeStatistics", data);
    } catch (error) {
      Logger.warn?.(
        "Could not save route statistics through SaveManager.",
        error
      );
    }

    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      Logger.warn?.(
        "Could not persist route statistics to local storage.",
        error
      );
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
    this.routes.clear();
    this.history = [];
    this.eventBus = null;
    this.saveManager = null;
    this.storage = null;
  }
}

export default RouteStatisticsManager;