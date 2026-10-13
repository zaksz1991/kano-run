import RecoveryHealthDashboardBackupSchedulerStorage from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerStorage.js";

const DEFAULT_OPTIONS = {
  namespace: "kano-run-backup-scheduler-persistence",
  autosave: true,
  debounceMs: 500,
  maxSnapshots: 25,
};

export class RecoveryHealthDashboardBackupSchedulerPersistence {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.storage =
      options.storage ||
      new RecoveryHealthDashboardBackupSchedulerStorage({
        namespace: this.options.namespace,
        maxEntries: this.options.maxSnapshots,
      });

    this.listeners = new Set();
    this.pendingTimer = null;
    this.pendingSnapshot = null;
    this.revision = 0;
    this.persistedRevision = 0;
    this.disposed = false;
    this.lastPersistedAt = null;
    this.lastError = null;

    this.storageKey = "scheduler-snapshot";
    this.historyKey = "scheduler-history";
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Persistence listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event, detail = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      revision: this.revision,
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors must not interrupt persistence.
      }
    }
  }

  _assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler persistence has been disposed.");
    }
  }

  _clone(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall through to JSON cloning.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  schedule(snapshot, metadata = {}) {
    this._assertActive();

    this.revision += 1;

    this.pendingSnapshot = {
      revision: this.revision,
      capturedAt: new Date().toISOString(),
      metadata: this._clone(metadata),
      snapshot: this._clone(snapshot),
    };

    this._emit("persistence-scheduled", {
      targetRevision: this.revision,
    });

    if (!this.options.autosave) {
      return this.revision;
    }

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }

    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;

      try {
        this.flush();
      } catch {
        // flush records and emits the persistence failure.
      }
    }, Math.max(0, Number(this.options.debounceMs) || 0));

    return this.revision;
  }

  flush() {
    this._assertActive();

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    if (!this.pendingSnapshot) {
      return {
        saved: false,
        reason: "no-pending-snapshot",
        revision: this.persistedRevision,
      };
    }

    const record = this.pendingSnapshot;

    try {
      this.storage.set(this.storageKey, record);

      const history = this.storage.get(this.historyKey, []);

      history.push({
        revision: record.revision,
        capturedAt: record.capturedAt,
        metadata: record.metadata,
      });

      const maxSnapshots = Math.max(
        1,
        Number(this.options.maxSnapshots) || 25
      );

      if (history.length > maxSnapshots) {
        history.splice(0, history.length - maxSnapshots);
      }

      this.storage.set(this.historyKey, history);

      this.persistedRevision = record.revision;
      this.lastPersistedAt = new Date().toISOString();
      this.lastError = null;

      if (
        this.pendingSnapshot &&
        this.pendingSnapshot.revision === record.revision
      ) {
        this.pendingSnapshot = null;
      }

      this._emit("persistence-saved", {
        savedRevision: record.revision,
        persistedAt: this.lastPersistedAt,
      });

      return {
        saved: true,
        revision: record.revision,
        persistedAt: this.lastPersistedAt,
      };
    } catch (error) {
      this.lastError = {
        message: error?.message || String(error),
        timestamp: new Date().toISOString(),
        revision: record.revision,
      };

      this._emit("persistence-failed", {
        error: this.lastError,
      });

      throw error;
    }
  }

  restore() {
    this._assertActive();

    const record = this.storage.get(this.storageKey, null);

    if (!record || !record.snapshot) {
      return {
        restored: false,
        reason: "snapshot-not-found",
      };
    }

    this._emit("persistence-restored", {
      restoredRevision: record.revision,
      capturedAt: record.capturedAt,
    });

    return {
      restored: true,
      revision: record.revision,
      capturedAt: record.capturedAt,
      metadata: this._clone(record.metadata || {}),
      snapshot: this._clone(record.snapshot),
    };
  }

  getHistory(options = {}) {
    this._assertActive();

    const history = this.storage.get(this.historyKey, []);

    const limit = Math.max(
      1,
      Number(options.limit) || history.length || 1
    );

    return history.slice(-limit).map((entry) => ({
      ...entry,
      metadata: this._clone(entry.metadata || {}),
    }));
  }

  removeSnapshot() {
    this._assertActive();

    const removed = this.storage.remove(this.storageKey);

    this._emit("persistence-snapshot-removed", { removed });

    return removed;
  }

  clearHistory() {
    this._assertActive();

    const removed = this.storage.remove(this.historyKey);

    this._emit("persistence-history-cleared", { removed });

    return removed;
  }

  getStatus() {
    return {
      disposed: this.disposed,
      revision: this.revision,
      persistedRevision: this.persistedRevision,
      pending: Boolean(this.pendingSnapshot),
      autosave: this.options.autosave,
      lastPersistedAt: this.lastPersistedAt,
      lastError: this.lastError,
      storage:
        typeof this.storage.getMetadata === "function"
          ? this.storage.getMetadata()
          : null,
    };
  }

  dispose(options = {}) {
    if (this.disposed) return;

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    if (options.flush && this.pendingSnapshot) {
      try {
        this.flush();
      } catch {
        // Disposal continues even if the final save fails.
      }
    }

    if (this.options.disposeStorage !== false) {
      this.storage.dispose?.();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerPersistence;