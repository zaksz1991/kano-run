import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  autosaveIntervalMs: 30_000,
  debounceMs: 500,
  saveOnChange: true,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthPersistence {
  constructor({
    metrics = null,
    storage = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.metrics = metrics;
    this.storage = storage;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();

    this.unsubscribe = [];
    this.autosaveTimer = null;
    this.debounceTimer = null;
    this.started = false;
    this.disposed = false;
    this.lastSavedAt = null;
    this.lastSaveResult = null;
    this.saveInProgress = false;
    this.saveRequested = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  start({ autosave = true, loadExisting = false } = {}) {
    this.assertActive();

    if (this.started) return false;

    if (!this.metrics || typeof this.metrics.exportData !== "function") {
      throw new Error("Metrics provider must expose exportData().");
    }

    if (!this.storage || typeof this.storage.save !== "function") {
      throw new Error("Storage provider must expose save().");
    }

    this.started = true;

    if (this.options.saveOnChange && typeof this.metrics.on === "function") {
      const unsubscribe = this.metrics.on("metrics:recorded", () => {
        this.scheduleSave();
      });

      if (typeof unsubscribe === "function") {
        this.unsubscribe.push(unsubscribe);
      }
    }

    if (loadExisting) {
      this.load();
    }

    if (autosave) {
      this.autosaveTimer = setInterval(() => {
        this.save();
      }, Math.max(1000, this.options.autosaveIntervalMs));
    }

    this.events.emit("persistence:started", {
      timestamp: this.clock(),
      autosave,
    });

    return true;
  }

  scheduleSave() {
    if (this.disposed || !this.started) return;

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save();
    }, Math.max(0, this.options.debounceMs));
  }

  save() {
    this.assertActive();

    if (this.saveInProgress) {
      this.saveRequested = true;
      return {
        saved: false,
        reason: "save_in_progress",
      };
    }

    this.saveInProgress = true;

    try {
      const archive = this.metrics.exportData();
      const result = this.storage.save(archive);

      this.lastSaveResult = result;

      if (result?.saved) {
        this.lastSavedAt = this.clock();

        this.events.emit("persistence:saved", {
          timestamp: this.lastSavedAt,
          sampleCount: result.sampleCount ?? archive.samples?.length ?? 0,
        });
      } else {
        this.events.emit("persistence:save-failed", {
          timestamp: this.clock(),
          result,
        });
      }

      return result;
    } catch (error) {
      const result = {
        saved: false,
        reason: "persistence_error",
        error: error instanceof Error ? error.message : String(error),
      };

      this.lastSaveResult = result;
      this.events.emit("persistence:save-failed", {
        timestamp: this.clock(),
        result,
      });

      return result;
    } finally {
      this.saveInProgress = false;

      if (this.saveRequested && !this.disposed) {
        this.saveRequested = false;
        queueMicrotask(() => {
          if (!this.disposed) this.save();
        });
      }
    }
  }

  load() {
    this.assertActive();

    if (typeof this.storage.load !== "function") {
      return {
        loaded: false,
        reason: "load_not_supported",
      };
    }

    const result = this.storage.load();

    if (!result?.loaded || !result.data) {
      this.events.emit("persistence:load-failed", {
        timestamp: this.clock(),
        result,
      });

      return result;
    }

    if (typeof this.metrics.importData !== "function") {
      return {
        loaded: false,
        reason: "metrics_import_not_supported",
      };
    }

    try {
      const count = this.metrics.importData(result.data);

      this.events.emit("persistence:loaded", {
        timestamp: this.clock(),
        sampleCount: count,
      });

      return {
        loaded: true,
        sampleCount: count,
      };
    } catch (error) {
      const failure = {
        loaded: false,
        reason: "import_failed",
        error: error instanceof Error ? error.message : String(error),
      };

      this.events.emit("persistence:load-failed", {
        timestamp: this.clock(),
        result: failure,
      });

      return failure;
    }
  }

  stop({ saveFinal = true } = {}) {
    if (!this.started) return false;

    this.started = false;

    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const finalSave = saveFinal ? this.save() : null;

    this.events.emit("persistence:stopped", {
      timestamp: this.clock(),
      finalSave,
    });

    return true;
  }

  getStatus() {
    return {
      started: this.started,
      disposed: this.disposed,
      saveInProgress: this.saveInProgress,
      lastSavedAt: this.lastSavedAt
        ? new Date(this.lastSavedAt).toISOString()
        : null,
      lastSaveResult: this.lastSaveResult,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health persistence has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.stop({ saveFinal: true });

    for (const unsubscribe of this.unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // Continue disposing remaining subscriptions.
      }
    }

    this.unsubscribe = [];
    this.disposed = true;

    this.events.emit("persistence:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthPersistence;