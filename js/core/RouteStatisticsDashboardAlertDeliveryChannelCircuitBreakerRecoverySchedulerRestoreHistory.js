import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const DEFAULT_MAX_ENTRIES = 1000;
const HISTORY_VERSION = 1;

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Use JSON fallback.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHistory {
  constructor({
    storage = null,
    storageKey = "kano-run-scheduler-restore-history",
    maxEntries = DEFAULT_MAX_ENTRIES,
    logger = Logger,
  } = {}) {
    this.storage =
      storage ??
      (typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage
        : null);

    this.storageKey = String(storageKey);
    this.maxEntries = Math.max(
      1,
      Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES),
    );

    this.logger = logger;
    this.events = new EventEmitter();
    this.entries = [];
    this.sequence = 0;
    this.disposed = false;
    this.lastError = null;

    this.load();
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  emit(type, payload = {}) {
    this.events.emit("change", {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  add({
    restoreId = null,
    backupId = null,
    status = "unknown",
    startedAt = Date.now(),
    completedAt = null,
    durationMs = null,
    restoredCount = 0,
    error = null,
    metadata = {},
  } = {}) {
    this.assertActive();

    const started = Number(startedAt);
    const completed = completedAt === null ? null : Number(completedAt);

    const entry = {
      id: `restore-history-${Date.now()}-${++this.sequence}`,
      sequence: this.sequence,
      restoreId: restoreId === null ? null : String(restoreId),
      backupId: backupId === null ? null : String(backupId),
      status: String(status),
      startedAt: Number.isFinite(started) ? started : Date.now(),
      completedAt:
        completed !== null && Number.isFinite(completed) ? completed : null,
      durationMs:
        Number.isFinite(Number(durationMs)) && durationMs !== null
          ? Math.max(0, Number(durationMs))
          : null,
      restoredCount: Math.max(0, Number(restoredCount) || 0),
      error: error === null ? null : String(error).slice(0, 2000),
      metadata: isObject(metadata) ? clone(metadata) : {},
      recordedAt: Date.now(),
    };

    this.entries.unshift(entry);
    this.trim();

    this.emit("change", {
      action: "added",
      entry: clone(entry),
    });

    return clone(entry);
  }

  recordSuccess(details = {}) {
    return this.add({
      ...details,
      status: "success",
      completedAt: details.completedAt ?? Date.now(),
    });
  }

  recordFailure(details = {}) {
    return this.add({
      ...details,
      status: "failed",
      completedAt: details.completedAt ?? Date.now(),
    });
  }

  recordStart(details = {}) {
    return this.add({
      ...details,
      status: "started",
      completedAt: null,
      durationMs: null,
    });
  }

  complete(restoreId, result = {}) {
    this.assertActive();

    const id = String(restoreId);
    const entry = this.entries.find(
      (item) => item.restoreId === id && item.status === "started",
    );

    if (!entry) return null;

    const completedAt = Date.now();

    entry.status = result.success === false ? "failed" : "success";
    entry.completedAt = completedAt;
    entry.durationMs = Math.max(0, completedAt - entry.startedAt);
    entry.restoredCount = Math.max(
      0,
      Number(result.restoredCount ?? entry.restoredCount) || 0,
    );
    entry.error = result.error ? String(result.error).slice(0, 2000) : null;
    entry.metadata = {
      ...entry.metadata,
      ...(isObject(result.metadata) ? clone(result.metadata) : {}),
    };

    this.emit("change", {
      action: "completed",
      entry: clone(entry),
    });

    return clone(entry);
  }

  get(id) {
    const entry = this.entries.find((item) => item.id === String(id));
    return entry ? clone(entry) : null;
  }

  getByRestoreId(restoreId) {
    return this.entries
      .filter((entry) => entry.restoreId === String(restoreId))
      .map((entry) => clone(entry));
  }

  query({
    limit = 100,
    status = null,
    backupId = null,
    restoreId = null,
    since = null,
    until = null,
  } = {}) {
    this.assertActive();

    const count = Math.max(0, Math.floor(Number(limit) || 0));
    const start = since === null ? null : Number(since);
    const end = until === null ? null : Number(until);

    return this.entries
      .filter((entry) => {
        if (status !== null && entry.status !== String(status)) return false;
        if (backupId !== null && entry.backupId !== String(backupId)) return false;
        if (restoreId !== null && entry.restoreId !== String(restoreId)) return false;

        if (start !== null && Number.isFinite(start) && entry.recordedAt < start) {
          return false;
        }

        if (end !== null && Number.isFinite(end) && entry.recordedAt > end) {
          return false;
        }

        return true;
      })
      .slice(0, count)
      .map((entry) => clone(entry));
  }

  getSummary() {
    const statuses = {};
    let totalDuration = 0;
    let durationSamples = 0;
    let totalRestored = 0;

    for (const entry of this.entries) {
      statuses[entry.status] = (statuses[entry.status] ?? 0) + 1;
      totalRestored += entry.restoredCount;

      if (Number.isFinite(entry.durationMs)) {
        totalDuration += entry.durationMs;
        durationSamples += 1;
      }
    }

    return {
      total: this.entries.length,
      statuses,
      totalRestored,
      averageDurationMs:
        durationSamples > 0 ? totalDuration / durationSamples : null,
      latest: this.entries[0] ? clone(this.entries[0]) : null,
    };
  }

  trim() {
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  exportData() {
    return {
      version: HISTORY_VERSION,
      exportedAt: Date.now(),
      sequence: this.sequence,
      entries: this.entries.map((entry) => clone(entry)),
    };
  }

  importData(data, { replace = true } = {}) {
    this.assertActive();

    if (
      !isObject(data) ||
      data.version !== HISTORY_VERSION ||
      !Array.isArray(data.entries)
    ) {
      throw new TypeError("Invalid restore history archive.");
    }

    const imported = data.entries.filter(
      (entry) =>
        isObject(entry) &&
        typeof entry.id === "string" &&
        typeof entry.status === "string" &&
        Number.isFinite(entry.recordedAt),
    ).map((entry) => clone(entry));

    if (replace) {
      this.entries = imported;
    } else {
      const ids = new Set(this.entries.map((entry) => entry.id));

      for (const entry of imported) {
        if (!ids.has(entry.id)) {
          this.entries.push(entry);
          ids.add(entry.id);
        }
      }
    }

    this.entries.sort((a, b) => b.recordedAt - a.recordedAt);
    this.trim();

    this.sequence = Math.max(
      this.sequence,
      Number(data.sequence) || 0,
      ...this.entries.map((entry) => Number(entry.sequence) || 0),
    );

    this.emit("change", {
      action: "imported",
      count: imported.length,
    });

    return imported.length;
  }

  save() {
    if (!this.storage) {
      this.lastError = "Restore history storage is unavailable.";
      return false;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.exportData()));
      this.lastError = null;

      this.emit("saved", {
        count: this.entries.length,
        savedAt: Date.now(),
      });

      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[SchedulerRestoreHistory] Save failed.",
        error,
      );

      this.emit("error", {
        operation: "save",
        message: this.lastError,
      });

      return false;
    }
  }

  load() {
    if (!this.storage) return false;

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return false;

      this.importData(JSON.parse(raw), { replace: true });
      this.lastError = null;

      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[SchedulerRestoreHistory] Load failed.",
        error,
      );

      this.emit("error", {
        operation: "load",
        message: this.lastError,
      });

      return false;
    }
  }

  clear() {
    this.assertActive();

    const removed = this.entries.length;
    this.entries = [];
    this.sequence = 0;
    this.save();

    this.emit("change", {
      action: "cleared",
      removed,
    });

    return removed;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore history has been disposed.");
    }
  }

  getStatus() {
    return {
      entryCount: this.entries.length,
      maxEntries: this.maxEntries,
      sequence: this.sequence,
      storageAvailable: Boolean(this.storage),
      lastError: this.lastError,
      disposed: this.disposed,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.save();
    this.disposed = true;
    this.events.removeAllListeners?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHistory;