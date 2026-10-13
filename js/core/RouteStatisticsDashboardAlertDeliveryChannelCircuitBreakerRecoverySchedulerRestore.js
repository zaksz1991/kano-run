import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const SUPPORTED_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON cloning.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestore {
  constructor({
    persistence = null,
    backupManager = null,
    logger = Logger,
    validate = null,
  } = {}) {
    this.persistence = persistence;
    this.backupManager = backupManager;
    this.logger = logger;
    this.validate = typeof validate === "function" ? validate : null;

    this.events = new EventEmitter();
    this.restoreHistory = [];
    this.maxHistory = 100;
    this.restoring = false;
    this.disposed = false;
    this.lastResult = null;
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

  validateArchive(archive) {
    if (!isObject(archive)) {
      return { valid: false, reason: "Archive must be an object." };
    }

    if (archive.version !== SUPPORTED_VERSION) {
      return {
        valid: false,
        reason: `Unsupported archive version: ${String(archive.version)}.`,
      };
    }

    if (!Array.isArray(archive.entries)) {
      return {
        valid: false,
        reason: "Archive must contain an entries array.",
      };
    }

    for (const entry of archive.entries) {
      if (!isObject(entry) || typeof entry.id !== "string" || !entry.id) {
        return {
          valid: false,
          reason: "Archive contains an entry with an invalid id.",
        };
      }
    }

    if (this.validate) {
      const customResult = this.validate(clone(archive));

      if (customResult === false) {
        return {
          valid: false,
          reason: "Custom archive validation failed.",
        };
      }

      if (isObject(customResult) && customResult.valid === false) {
        return {
          valid: false,
          reason: String(customResult.reason ?? "Custom validation failed."),
        };
      }
    }

    return { valid: true, reason: null };
  }

  async restoreArchive(archive, { createSafetyBackup = true } = {}) {
    this.assertActive();

    if (this.restoring) {
      throw new Error("A scheduler restore operation is already running.");
    }

    if (
      !this.persistence ||
      typeof this.persistence.importData !== "function"
    ) {
      throw new Error("A compatible persistence instance is required.");
    }

    const validation = this.validateArchive(archive);

    if (!validation.valid) {
      this.emit("restore-rejected", {
        reason: validation.reason,
      });

      throw new Error(validation.reason);
    }

    this.restoring = true;
    const startedAt = Date.now();

    this.emit("restore-started", {
      entryCount: archive.entries.length,
    });

    let safetyBackup = null;

    try {
      if (
        createSafetyBackup &&
        this.backupManager &&
        typeof this.backupManager.create === "function"
      ) {
        safetyBackup = this.backupManager.create({
          label: "Automatic pre-restore backup",
          metadata: {
            reason: "scheduler-restore",
            createdAt: Date.now(),
          },
        });
      }

      const previousData =
        typeof this.persistence.exportData === "function"
          ? clone(this.persistence.exportData())
          : null;

      try {
        const restoredCount = this.persistence.importData(
          clone(archive),
          { replace: true },
        );

        const result = {
          success: true,
          restoredCount,
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          safetyBackupId: safetyBackup?.id ?? null,
        };

        this.recordResult(result);
        this.emit("restore-completed", result);

        return result;
      } catch (error) {
        if (previousData) {
          try {
            this.persistence.importData(previousData, { replace: true });
          } catch (rollbackError) {
            this.logger?.error?.(
              "[SchedulerRestore] Rollback failed.",
              rollbackError,
            );
          }
        }

        throw error;
      }
    } catch (error) {
      const result = {
        success: false,
        error: error?.message ?? String(error),
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        safetyBackupId: safetyBackup?.id ?? null,
      };

      this.recordResult(result);

      this.logger?.error?.(
        "[SchedulerRestore] Restore failed.",
        error,
      );

      this.emit("restore-failed", result);

      throw error;
    } finally {
      this.restoring = false;
    }
  }

  async restoreBackup(backupId, options = {}) {
    this.assertActive();

    if (
      !this.backupManager ||
      typeof this.backupManager.get !== "function"
    ) {
      throw new Error("A compatible backup manager is required.");
    }

    const backup = this.backupManager.get(backupId);

    if (!backup) {
      throw new Error(`Backup not found: ${String(backupId)}`);
    }

    return this.restoreArchive(backup.data, options);
  }

  recordResult(result) {
    this.lastResult = clone(result);
    this.restoreHistory.unshift(clone(result));

    if (this.restoreHistory.length > this.maxHistory) {
      this.restoreHistory.length = this.maxHistory;
    }
  }

  getHistory({ limit = 20 } = {}) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    return this.restoreHistory
      .slice(0, count)
      .map((item) => clone(item));
  }

  getStatus() {
    return {
      restoring: this.restoring,
      historyCount: this.restoreHistory.length,
      lastResult: this.lastResult ? clone(this.lastResult) : null,
      disposed: this.disposed,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.removeAllListeners?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestore;