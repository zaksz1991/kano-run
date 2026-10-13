import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteHistory";
const STORAGE_VERSION = 1;

export class RouteHistoryManager {
  constructor({
    saveManager = null,
    storage = globalThis.localStorage,
    eventBus = EventBus,
    logger = Logger,
    maxEntries = 500,
  } = {}) {
    this.saveManager = saveManager;
    this.storage = storage;
    this.eventBus = eventBus;
    this.logger = logger;

    this.maxEntries = Math.max(
      1,
      Math.floor(Number(maxEntries) || 500),
    );

    this.entries = [];
    this.sequence = 0;
    this.disposed = false;

    this.load();
  }

  record(routeId, details = {}) {
    this.assertActive();

    if (routeId == null || routeId === "") {
      return {
        success: false,
        reason: "invalid_route_id",
      };
    }

    const entry = {
      id: this.createEntryId(),
      routeId,
      startedAt: this.normalizeTimestamp(details.startedAt),
      finishedAt: this.normalizeOptionalTimestamp(details.finishedAt),
      duration: this.normalizeNonNegative(details.duration),
      completed: Boolean(details.completed),
      distance: this.normalizeNonNegative(details.distance),
      reward: this.normalizeNonNegative(details.reward),
      fareTotal: this.normalizeNonNegative(details.fareTotal),
      passengers: this.normalizeNonNegative(details.passengers),
      collisions: this.normalizeNonNegative(details.collisions),
      score: this.normalizeNonNegative(details.score),
      weather: String(details.weather ?? "clear"),
      vehicleId: details.vehicleId ?? null,
      routeName: String(details.routeName ?? ""),
      metadata: this.sanitizeMetadata(details.metadata),
      recordedAt: Date.now(),
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(
        0,
        this.entries.length - this.maxEntries,
      );
    }

    this.persist();

    this.emit("route-history:recorded", {
      entry: { ...entry },
    });

    return {
      success: true,
      entry: { ...entry },
    };
  }

  createEntryId() {
    this.sequence += 1;

    return `rh-${Date.now().toString(36)}-${this.sequence.toString(36)}`;
  }

  normalizeTimestamp(value) {
    const timestamp = Number(value);

    return Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : Date.now();
  }

  normalizeOptionalTimestamp(value) {
    if (value == null) return null;

    const timestamp = Number(value);

    return Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : null;
  }

  normalizeNonNegative(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, number)
      : 0;
  }

  sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch {
      return {};
    }
  }

  getHistory({
    routeId = null,
    completedOnly = false,
    from = null,
    to = null,
    limit = 50,
    newestFirst = true,
  } = {}) {
    this.assertActive();

    const startTime = from == null ? null : Number(from);
    const endTime = to == null ? null : Number(to);

    let result = this.entries.filter((entry) => {
      if (routeId != null && entry.routeId !== routeId) {
        return false;
      }

      if (completedOnly && !entry.completed) {
        return false;
      }

      if (
        Number.isFinite(startTime) &&
        entry.startedAt < startTime
      ) {
        return false;
      }

      if (
        Number.isFinite(endTime) &&
        entry.startedAt > endTime
      ) {
        return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      return newestFirst
        ? b.startedAt - a.startedAt
        : a.startedAt - b.startedAt;
    });

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit > 0) {
      result = result.slice(0, safeLimit);
    }

    return result.map((entry) => ({
      ...entry,
      metadata: { ...entry.metadata },
    }));
  }

  getEntry(entryId) {
    this.assertActive();

    const entry = this.entries.find(
      (item) => item.id === entryId,
    );

    return entry
      ? {
          ...entry,
          metadata: { ...entry.metadata },
        }
      : null;
  }

  getRouteHistory(routeId, options = {}) {
    return this.getHistory({
      ...options,
      routeId,
    });
  }

  getRecentHistory(limit = 10) {
    return this.getHistory({
      limit,
      newestFirst: true,
    });
  }

  getCompletedHistory(limit = 50) {
    return this.getHistory({
      limit,
      completedOnly: true,
      newestFirst: true,
    });
  }

  getStatistics({ routeId = null } = {}) {
    this.assertActive();

    const entries = routeId == null
      ? this.entries
      : this.entries.filter(
          (entry) => entry.routeId === routeId,
        );

    const completed = entries.filter(
      (entry) => entry.completed,
    );

    const totalReward = entries.reduce(
      (sum, entry) => sum + entry.reward,
      0,
    );

    const totalDistance = entries.reduce(
      (sum, entry) => sum + entry.distance,
      0,
    );

    const totalDuration = entries.reduce(
      (sum, entry) => sum + entry.duration,
      0,
    );

    const totalPassengers = entries.reduce(
      (sum, entry) => sum + entry.passengers,
      0,
    );

    const totalCollisions = entries.reduce(
      (sum, entry) => sum + entry.collisions,
      0,
    );

    return {
      totalRuns: entries.length,
      completedRuns: completed.length,
      failedRuns: entries.length - completed.length,
      completionRate: entries.length
        ? completed.length / entries.length
        : 0,
      totalReward,
      totalDistance,
      totalDuration,
      totalPassengers,
      totalCollisions,
      averageReward: entries.length
        ? totalReward / entries.length
        : 0,
      averageDuration: entries.length
        ? totalDuration / entries.length
        : 0,
      bestScore: entries.reduce(
        (best, entry) => Math.max(best, entry.score),
        0,
      ),
    };
  }

  getRouteSummaries() {
    this.assertActive();

    const summaries = new Map();

    for (const entry of this.entries) {
      let summary = summaries.get(entry.routeId);

      if (!summary) {
        summary = {
          routeId: entry.routeId,
          routeName: entry.routeName,
          attempts: 0,
          completions: 0,
          totalReward: 0,
          totalDistance: 0,
          totalDuration: 0,
          lastPlayedAt: 0,
        };

        summaries.set(entry.routeId, summary);
      }

      summary.attempts += 1;
      summary.completions += entry.completed ? 1 : 0;
      summary.totalReward += entry.reward;
      summary.totalDistance += entry.distance;
      summary.totalDuration += entry.duration;
      summary.lastPlayedAt = Math.max(
        summary.lastPlayedAt,
        entry.startedAt,
      );

      if (entry.routeName) {
        summary.routeName = entry.routeName;
      }
    }

    return [...summaries.values()]
      .map((summary) => ({
        ...summary,
        completionRate: summary.attempts
          ? summary.completions / summary.attempts
          : 0,
      }))
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  }

  removeEntry(entryId) {
    this.assertActive();

    const index = this.entries.findIndex(
      (entry) => entry.id === entryId,
    );

    if (index < 0) {
      return {
        success: false,
        reason: "entry_not_found",
      };
    }

    const [removed] = this.entries.splice(index, 1);

    this.persist();

    this.emit("route-history:removed", {
      entry: { ...removed },
    });

    return {
      success: true,
      entry: { ...removed },
    };
  }

  clearHistory({ routeId = null } = {}) {
    this.assertActive();

    const previousCount = this.entries.length;

    if (routeId == null) {
      this.entries = [];
    } else {
      this.entries = this.entries.filter(
        (entry) => entry.routeId !== routeId,
      );
    }

    const removedCount = previousCount - this.entries.length;

    if (removedCount > 0) {
      this.persist();

      this.emit("route-history:cleared", {
        routeId,
        removedCount,
      });
    }

    return {
      success: true,
      removedCount,
    };
  }

  exportData() {
    this.assertActive();

    return {
      version: STORAGE_VERSION,
      exportedAt: Date.now(),
      sequence: this.sequence,
      entries: this.entries.map((entry) => ({
        ...entry,
        metadata: { ...entry.metadata },
      })),
    };
  }

  importData(data, { merge = false } = {}) {
    this.assertActive();

    if (
      !data ||
      data.version !== STORAGE_VERSION ||
      !Array.isArray(data.entries)
    ) {
      return {
        success: false,
        reason: "invalid_import_data",
      };
    }

    const imported = data.entries
      .filter(
        (entry) =>
          entry &&
          entry.routeId != null &&
          typeof entry.id === "string",
      )
      .map((entry) => ({
        id: entry.id,
        routeId: entry.routeId,
        startedAt: this.normalizeTimestamp(entry.startedAt),
        finishedAt: this.normalizeOptionalTimestamp(
          entry.finishedAt,
        ),
        duration: this.normalizeNonNegative(entry.duration),
        completed: Boolean(entry.completed),
        distance: this.normalizeNonNegative(entry.distance),
        reward: this.normalizeNonNegative(entry.reward),
        fareTotal: this.normalizeNonNegative(entry.fareTotal),
        passengers: this.normalizeNonNegative(entry.passengers),
        collisions: this.normalizeNonNegative(entry.collisions),
        score: this.normalizeNonNegative(entry.score),
        weather: String(entry.weather ?? "clear"),
        vehicleId: entry.vehicleId ?? null,
        routeName: String(entry.routeName ?? ""),
        metadata: this.sanitizeMetadata(entry.metadata),
        recordedAt: this.normalizeTimestamp(entry.recordedAt),
      }));

    if (!merge) {
      this.entries = [];
    }

    const existingIds = new Set(
      this.entries.map((entry) => entry.id),
    );

    for (const entry of imported) {
      if (existingIds.has(entry.id)) continue;

      this.entries.push(entry);
      existingIds.add(entry.id);
    }

    this.entries.sort((a, b) => a.startedAt - b.startedAt);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    this.sequence = Math.max(
      this.sequence,
      Number(data.sequence) || 0,
    );

    this.persist();

    this.emit("route-history:imported", {
      count: this.entries.length,
    });

    return {
      success: true,
      count: this.entries.length,
    };
  }

  load() {
    this.assertActive();

    try {
      const raw = this.storage?.getItem(STORAGE_KEY);

      if (!raw) {
        this.loadFromSaveManager();
        return false;
      }

      const data = JSON.parse(raw);

      if (
        !data ||
        data.version !== STORAGE_VERSION ||
        !Array.isArray(data.entries)
      ) {
        this.logger?.warn?.(
          "RouteHistoryManager: saved history format is invalid.",
        );

        this.loadFromSaveManager();
        return false;
      }

      const imported = this.importData(data);

      return imported.success;
    } catch (error) {
      this.logger?.warn?.(
        "RouteHistoryManager: failed to load history.",
        error,
      );

      this.loadFromSaveManager();
      return false;
    }
  }

  loadFromSaveManager() {
    try {
      if (typeof this.saveManager?.get === "function") {
        const data = this.saveManager.get(STORAGE_KEY);

        if (data && Array.isArray(data.entries)) {
          this.importData(data);
        }
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteHistoryManager: save-manager fallback failed.",
        error,
      );
    }
  }

  persist() {
    const data = this.exportData();
    let saved = false;

    try {
      if (this.storage) {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
        saved = true;
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteHistoryManager: local storage save failed.",
        error,
      );
    }

    try {
      if (typeof this.saveManager?.set === "function") {
        this.saveManager.set(STORAGE_KEY, data);
      } else if (typeof this.saveManager?.save === "function") {
        this.saveManager.save(STORAGE_KEY, data);
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteHistoryManager: save-manager persistence failed.",
        error,
      );
    }

    return saved;
  }

  emit(eventName, payload) {
    if (typeof this.eventBus?.emit === "function") {
      this.eventBus.emit(eventName, payload);
    } else if (typeof this.eventBus?.publish === "function") {
      this.eventBus.publish(eventName, payload);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteHistoryManager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.entries = [];
    this.saveManager = null;
    this.storage = null;
    this.eventBus = null;
    this.logger = null;
    this.disposed = true;
  }
}

export default RouteHistoryManager;