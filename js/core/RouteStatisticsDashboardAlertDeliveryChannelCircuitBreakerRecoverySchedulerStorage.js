import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  storageKey: "ruffneck-route-statistics-circuit-recovery-scheduler",
  version: 1,
  maxHistory: 1000,
  autoSave: true,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerStorage {
  constructor({
    storage = globalThis.localStorage,
    metrics = null,
    registry = null,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    this.storage = storage;
    this.metrics = metrics;
    this.registry = registry;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.disposed = false;
    this.lastSavedAt = null;
    this.lastLoadedAt = null;
    this.lastError = null;
    this.saveCount = 0;
    this.loadCount = 0;
  }

  save({ includeMetrics = true, metadata = {} } = {}) {
    this.assertActive();

    if (!this.storage || typeof this.storage.setItem !== "function") {
      return this.fail("Storage is unavailable.");
    }

    try {
      const data = {
        version: this.config.version,
        savedAt: this.clock(),
        metadata: this.sanitizeMetadata(metadata),
        metrics: includeMetrics
          ? this.metrics?.exportData?.() ?? null
          : null,
        registry: this.getRegistrySnapshot(),
      };

      const serialized = JSON.stringify(data);

      this.storage.setItem(this.config.storageKey, serialized);

      this.lastSavedAt = data.savedAt;
      this.lastError = null;
      this.saveCount += 1;

      this.emit("saved", {
        key: this.config.storageKey,
        savedAt: this.lastSavedAt,
        bytes: serialized.length,
        saveCount: this.saveCount,
      });

      return {
        success: true,
        savedAt: this.lastSavedAt,
        bytes: serialized.length,
      };
    } catch (error) {
      this.lastError = this.serializeError(error);

      this.log("error", "Failed to save scheduler storage.", {
        error: this.lastError,
      });

      this.emit("save-failed", {
        at: this.clock(),
        error: this.lastError,
      });

      return {
        success: false,
        error: this.lastError,
      };
    }
  }

  load({ restoreMetrics = true } = {}) {
    this.assertActive();

    if (!this.storage || typeof this.storage.getItem !== "function") {
      return this.fail("Storage is unavailable.");
    }

    try {
      const serialized = this.storage.getItem(this.config.storageKey);

      if (!serialized) {
        return {
          success: true,
          found: false,
          data: null,
        };
      }

      const data = JSON.parse(serialized);

      if (!data || typeof data !== "object") {
        throw new TypeError("Stored scheduler data is invalid.");
      }

      if (data.version !== this.config.version) {
        throw new Error(
          `Unsupported storage version: ${data.version}.`,
        );
      }

      if (
        restoreMetrics &&
        data.metrics &&
        this.metrics &&
        typeof this.metrics.importData === "function"
      ) {
        this.metrics.importData(data.metrics, { replace: true });
      }

      this.lastLoadedAt = this.clock();
      this.lastError = null;
      this.loadCount += 1;

      const result = {
        success: true,
        found: true,
        savedAt: data.savedAt ?? null,
        loadedAt: this.lastLoadedAt,
        metadata: data.metadata ?? {},
        metricsRestored: Boolean(
          restoreMetrics && data.metrics && this.metrics,
        ),
        registry: data.registry ?? null,
      };

      this.emit("loaded", result);

      return result;
    } catch (error) {
      this.lastError = this.serializeError(error);

      this.log("error", "Failed to load scheduler storage.", {
        error: this.lastError,
      });

      this.emit("load-failed", {
        at: this.clock(),
        error: this.lastError,
      });

      return {
        success: false,
        error: this.lastError,
      };
    }
  }

  getRegistrySnapshot() {
    if (!this.registry) {
      return null;
    }

    try {
      const statuses = this.registry.getStatuses?.() ?? [];
      const summary = this.registry.getSummary?.() ?? null;

      return {
        capturedAt: this.clock(),
        summary,
        schedulers: statuses.map((entry) => ({
          id: String(entry.id),
          registeredAt: entry.registeredAt ?? null,
          status: entry.status
            ? {
                running: entry.status.running === true,
                disposed: entry.status.disposed === true,
                runCount: this.toNumber(entry.status.runCount),
                failureCount: this.toNumber(entry.status.failureCount),
                lastRunAt: entry.status.lastRunAt ?? null,
                nextRunAt: entry.status.nextRunAt ?? null,
              }
            : null,
        })),
      };
    } catch (error) {
      this.log("warn", "Unable to capture registry snapshot.", {
        error: this.serializeError(error),
      });

      return {
        capturedAt: this.clock(),
        error: this.serializeError(error),
      };
    }
  }

  getSavedData() {
    this.assertActive();

    try {
      const serialized = this.storage?.getItem?.(
        this.config.storageKey,
      );

      if (!serialized) {
        return null;
      }

      const data = JSON.parse(serialized);

      if (data?.version !== this.config.version) {
        return null;
      }

      return data;
    } catch (error) {
      this.lastError = this.serializeError(error);

      this.log("warn", "Unable to read saved scheduler data.", {
        error: this.lastError,
      });

      return null;
    }
  }

  remove() {
    this.assertActive();

    try {
      if (typeof this.storage?.removeItem !== "function") {
        return this.fail("Storage is unavailable.");
      }

      this.storage.removeItem(this.config.storageKey);

      this.emit("removed", {
        key: this.config.storageKey,
        at: this.clock(),
      });

      return { success: true };
    } catch (error) {
      this.lastError = this.serializeError(error);

      return {
        success: false,
        error: this.lastError,
      };
    }
  }

  hasSavedData() {
    this.assertActive();

    try {
      return Boolean(
        this.storage?.getItem?.(this.config.storageKey),
      );
    } catch {
      return false;
    }
  }

  getStatus() {
    return {
      disposed: this.disposed,
      storageAvailable: Boolean(this.storage),
      storageKey: this.config.storageKey,
      lastSavedAt: this.lastSavedAt,
      lastLoadedAt: this.lastLoadedAt,
      lastError: this.lastError,
      saveCount: this.saveCount,
      loadCount: this.loadCount,
      hasSavedData: this.hasSavedDataSafe(),
    };
  }

  hasSavedDataSafe() {
    try {
      return this.hasSavedData();
    } catch {
      return false;
    }
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

  toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  fail(message) {
    this.lastError = {
      name: "StorageError",
      message,
    };

    this.emit("storage-error", {
      at: this.clock(),
      error: this.lastError,
    });

    return {
      success: false,
      error: this.lastError,
    };
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-storage:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit storage event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Storage operations must not depend on successful logging.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerStorage has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerStorage;