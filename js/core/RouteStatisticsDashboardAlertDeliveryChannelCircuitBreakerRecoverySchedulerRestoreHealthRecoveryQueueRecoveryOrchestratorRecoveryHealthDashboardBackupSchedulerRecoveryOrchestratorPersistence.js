import RecoveryHealthDashboardBackupSchedulerRecoveryPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryPersistence.js";

const DEFAULT_PERSISTENCE_INTERVAL_MS = 15_000;
const DEFAULT_SCHEMA_VERSION = 1;

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence {
  constructor(options = {}) {
    this.persistence =
      options.persistence ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryPersistence(
        options
      );

    this.intervalMs = Math.max(
      1_000,
      Number(options.intervalMs) ||
        DEFAULT_PERSISTENCE_INTERVAL_MS
    );

    this.schemaVersion = DEFAULT_SCHEMA_VERSION;
    this.clock = options.clock ?? (() => Date.now());
    this.onEvent = options.onEvent ?? (() => {});

    this.timer = null;
    this.orchestrator = null;
    this.started = false;
    this.persisting = false;
    this.pendingPersist = false;
    this.lastPersistAt = null;
    this.lastRestoreAt = null;
    this.lastError = null;
    this.lastResult = null;
  }

  attach(orchestrator) {
    if (!orchestrator || typeof orchestrator.getStatus !== "function") {
      throw new TypeError(
        "A valid recovery orchestrator with getStatus() is required."
      );
    }

    this.orchestrator = orchestrator;

    this.emit("orchestrator_attached", {});

    return this;
  }

  start(options = {}) {
    if (!this.orchestrator) {
      throw new Error(
        "Attach a recovery orchestrator before starting persistence."
      );
    }

    if (this.started) {
      return this.getStatus();
    }

    this.started = true;

    if (options.immediate !== false) {
      void this.persistNow();
    }

    this.timer = setInterval(() => {
      void this.persistNow();
    }, this.intervalMs);

    this.timer.unref?.();

    this.emit("persistence_started", {
      intervalMs: this.intervalMs,
    });

    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;

    this.emit("persistence_stopped", {});

    return this.getStatus();
  }

  async persistNow() {
    if (!this.orchestrator) {
      return {
        success: false,
        error: "orchestrator_not_attached",
      };
    }

    if (this.persisting) {
      this.pendingPersist = true;

      return {
        success: false,
        skipped: true,
        reason: "persistence_in_progress",
      };
    }

    this.persisting = true;
    let result;

    try {
      do {
        this.pendingPersist = false;

        const state = this.createSnapshot();
        result = await this.persistence.persist(state);

        if (!result.success) {
          throw new Error(
            result.error?.message ??
              "Unable to persist orchestrator state."
          );
        }

        this.lastPersistAt = this.clock();
        this.lastError = null;
        this.lastResult = result;

        this.emit("persistence_completed", {
          revision: result.revision,
          persistedAt: this.lastPersistAt,
        });
      } while (this.pendingPersist);
    } catch (error) {
      this.lastError = this.serializeError(error);

      result = {
        success: false,
        error: this.lastError,
      };

      this.lastResult = result;

      this.emit("persistence_failed", {
        error: this.lastError,
      });
    } finally {
      this.persisting = false;
    }

    return result;
  }

  async restore() {
    try {
      const result = await this.persistence.restore();

      if (!result.success) {
        throw new Error(
          result.error?.message ?? "Unable to restore recovery state."
        );
      }

      this.lastRestoreAt = this.clock();
      this.lastError = null;

      const state = result.state;

      this.emit("restore_completed", {
        restored: result.restored,
        revision: result.revision ?? null,
        restoredAt: this.lastRestoreAt,
      });

      return {
        success: true,
        restored: result.restored,
        state: this.validateSnapshot(state),
        restoredAt: this.lastRestoreAt,
      };
    } catch (error) {
      this.lastError = this.serializeError(error);

      this.emit("restore_failed", {
        error: this.lastError,
      });

      return {
        success: false,
        restored: false,
        error: this.lastError,
      };
    }
  }

  createSnapshot() {
    const status = this.orchestrator.getStatus();

    return {
      schemaVersion: this.schemaVersion,
      savedAt: this.clock(),
      orchestrator: {
        paused: Boolean(status.paused),
        sequence: Number(status.sequence) || 0,
        concurrency: Number(status.concurrency) || 1,
        queuedCount: Number(status.queuedCount) || 0,
        activeCount: Number(status.activeCount) || 0,
        completedCount: Number(status.completedCount) || 0,
        failedCount: Number(status.failedCount) || 0,
        cancelledCount: Number(status.cancelledCount) || 0,
      },
      queue: Array.isArray(status.queue)
        ? status.queue.map((item) => ({
            id: item.id,
            name: item.name,
            priority: Number(item.priority) || 0,
            attempts: Number(item.attempts) || 0,
            maxRetries: Number(item.maxRetries) || 0,
            createdAt: Number(item.createdAt) || this.clock(),
          }))
        : [],
      capturedAt: this.clock(),
    };
  }

  validateSnapshot(state) {
    if (!state || typeof state !== "object") {
      return null;
    }

    if (state.schemaVersion !== this.schemaVersion) {
      return {
        compatible: false,
        reason: "unsupported_schema_version",
        schemaVersion: state.schemaVersion ?? null,
      };
    }

    return {
      compatible: true,
      schemaVersion: state.schemaVersion,
      savedAt: Number(state.savedAt) || null,
      orchestrator: state.orchestrator ?? {},
      queue: Array.isArray(state.queue) ? state.queue : [],
      capturedAt: Number(state.capturedAt) || null,
    };
  }

  getStatus() {
    return {
      started: this.started,
      persisting: this.persisting,
      pendingPersist: this.pendingPersist,
      intervalMs: this.intervalMs,
      lastPersistAt: this.lastPersistAt,
      lastRestoreAt: this.lastRestoreAt,
      lastError: this.lastError,
      lastResult: this.lastResult,
      persistence: this.persistence.getStatus(),
    };
  }

  emit(type, details = {}) {
    try {
      this.onEvent({
        type,
        timestamp: this.clock(),
        details: this.sanitize(details),
      });
    } catch {
      // Event callbacks must not interrupt persistence.
    }
  }

  sanitize(value) {
    try {
      return JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Error) {
            return this.serializeError(item);
          }

          if (typeof item === "bigint") {
            return item.toString();
          }

          if (typeof item === "function") {
            return undefined;
          }

          return item;
        })
      );
    } catch {
      return { summary: String(value) };
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  destroy() {
    this.stop();
    this.orchestrator = null;
    this.lastResult = null;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence;