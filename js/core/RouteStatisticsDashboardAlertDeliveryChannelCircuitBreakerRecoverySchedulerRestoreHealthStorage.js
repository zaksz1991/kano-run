import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  storageKey: "kano-run:restore-health",
  version: 1,
  maxSamples: 500,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthStorage {
  constructor({
    storage = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.storage = storage ?? this.getDefaultStorage();
    this.clock = clock;
    this.events = new EventEmitter();
    this.disposed = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  getDefaultStorage() {
    try {
      return typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage
        : null;
    } catch {
      return null;
    }
  }

  save(data) {
    this.assertActive();

    if (!this.storage || typeof this.storage.setItem !== "function") {
      return {
        saved: false,
        reason: "storage_unavailable",
      };
    }

    const archive = this.normalizeArchive(data);
    const serialized = JSON.stringify(archive);

    try {
      this.storage.setItem(this.options.storageKey, serialized);

      const result = {
        saved: true,
        key: this.options.storageKey,
        sampleCount: archive.samples.length,
        savedAt: archive.savedAt,
      };

      this.events.emit("storage:saved", result);
      return result;
    } catch (error) {
      const result = {
        saved: false,
        reason: "storage_write_failed",
        error: error instanceof Error ? error.message : String(error),
      };

      this.events.emit("storage:error", result);
      return result;
    }
  }

  load() {
    this.assertActive();

    if (!this.storage || typeof this.storage.getItem !== "function") {
      return {
        loaded: false,
        reason: "storage_unavailable",
        data: null,
      };
    }

    try {
      const serialized = this.storage.getItem(this.options.storageKey);

      if (!serialized) {
        return {
          loaded: false,
          reason: "not_found",
          data: null,
        };
      }

      const parsed = JSON.parse(serialized);
      const archive = this.normalizeArchive(parsed);

      const result = {
        loaded: true,
        data: archive,
        sampleCount: archive.samples.length,
      };

      this.events.emit("storage:loaded", {
        sampleCount: archive.samples.length,
        loadedAt: new Date(this.clock()).toISOString(),
      });

      return result;
    } catch (error) {
      const result = {
        loaded: false,
        reason: "storage_read_failed",
        error: error instanceof Error ? error.message : String(error),
        data: null,
      };

      this.events.emit("storage:error", result);
      return result;
    }
  }

  normalizeArchive(data) {
    if (!data || typeof data !== "object") {
      throw new TypeError("A valid health metrics archive is required.");
    }

    if (data.version !== this.options.version) {
      throw new TypeError(
        `Unsupported archive version: ${String(data.version)}.`
      );
    }

    if (!Array.isArray(data.samples)) {
      throw new TypeError("Archive samples must be an array.");
    }

    const samples = data.samples
      .filter((sample) =>
        sample &&
        Number.isFinite(sample.timestamp) &&
        typeof sample.status === "string"
      )
      .map((sample) => ({
        timestamp: sample.timestamp,
        status: sample.status,
        healthy: Boolean(sample.healthy),
        issueCount: Math.max(0, Number(sample.issueCount) || 0),
        source: String(sample.source ?? "unknown"),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-this.options.maxSamples);

    return {
      version: this.options.version,
      savedAt: new Date(this.clock()).toISOString(),
      exportedAt: data.exportedAt ?? null,
      samples,
    };
  }

  remove() {
    this.assertActive();

    if (!this.storage || typeof this.storage.removeItem !== "function") {
      return false;
    }

    try {
      this.storage.removeItem(this.options.storageKey);
      this.events.emit("storage:removed", {
        key: this.options.storageKey,
        timestamp: this.clock(),
      });

      return true;
    } catch (error) {
      this.events.emit("storage:error", {
        reason: "storage_remove_failed",
        error: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }

  getInfo() {
    let available = false;
    let exists = false;
    let sizeBytes = 0;

    try {
      available = Boolean(
        this.storage &&
        typeof this.storage.getItem === "function"
      );

      if (available) {
        const value = this.storage.getItem(this.options.storageKey);
        exists = value !== null;

        if (typeof value === "string") {
          sizeBytes = new TextEncoder().encode(value).length;
        }
      }
    } catch {
      available = false;
    }

    return {
      key: this.options.storageKey,
      available,
      exists,
      sizeBytes,
      version: this.options.version,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health storage has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.emit("storage:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthStorage;