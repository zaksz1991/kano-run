import RecoveryHealthDashboardStorage from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardStorage.js";

const DEFAULTS = {
  autoSave: true,
  debounceMs: 500,
  checkpointIntervalMs: 30000,
  maxCheckpoints: 100,
};

export class RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardPersistence {
  constructor(storage = null, dashboard = null, options = {}) {
    this.storage = storage || new RecoveryHealthDashboardStorage();
    this.dashboard = dashboard;
    this.options = { ...DEFAULTS, ...options };

    this.listeners = new Set();
    this.unsubscribeDashboard = null;
    this.unsubscribeStorage = null;
    this.saveTimer = null;
    this.checkpointTimer = null;
    this.disposed = false;
    this.saving = false;

    this.stats = {
      saveAttempts: 0,
      successfulSaves: 0,
      failedSaves: 0,
      checkpoints: 0,
      restoredSnapshots: 0,
    };

    this.unsubscribeStorage = this.storage.subscribe((event) => {
      this.emit("persistence:storage_event", event);
    });

    if (
      this.dashboard &&
      typeof this.dashboard.subscribe === "function"
    ) {
      this.unsubscribeDashboard = this.dashboard.subscribe((event) => {
        this.handleDashboardEvent(event);
      });
    }
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Persistence listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  handleDashboardEvent(event) {
    if (this.disposed || !this.options.autoSave) {
      return;
    }

    if (
      event.type === "dashboard:updated" ||
      event.type === "dashboard:status_changed" ||
      event.type === "dashboard:alert"
    ) {
      this.scheduleSave(event.detail);
    }
  }

  scheduleSave(snapshot = null) {
    this.assertActive();

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;

      try {
        this.persistSnapshot(snapshot);
      } catch (error) {
        this.emit("persistence:error", {
          operation: "scheduled_save",
          message: this.formatError(error),
        });
      }
    }, Math.max(0, this.options.debounceMs));
  }

  persistSnapshot(snapshot = null) {
    this.assertActive();

    let data = snapshot;

    if (!data && this.dashboard) {
      if (typeof this.dashboard.getDashboard === "function") {
        data = this.dashboard.getDashboard();
      } else if (typeof this.dashboard.getState === "function") {
        data = this.dashboard.getState();
      }
    }

    if (!data || typeof data !== "object") {
      return false;
    }

    this.storage.appendSnapshot(data);

    return this.save();
  }

  save() {
    this.assertActive();

    if (this.saving) {
      return false;
    }

    this.saving = true;
    this.stats.saveAttempts += 1;

    try {
      const success = this.storage.save();

      if (success) {
        this.stats.successfulSaves += 1;

        this.emit("persistence:saved", {
          timestamp: Date.now(),
          snapshotCount: this.storage.getSnapshots().length,
        });
      } else {
        this.stats.failedSaves += 1;

        this.emit("persistence:save_failed", {
          timestamp: Date.now(),
        });
      }

      return success;
    } catch (error) {
      this.stats.failedSaves += 1;

      this.emit("persistence:error", {
        operation: "save",
        message: this.formatError(error),
      });

      return false;
    } finally {
      this.saving = false;
    }
  }

  restore() {
    this.assertActive();

    const state = this.storage.load();
    const latest = this.storage.getLatestSnapshot();

    this.stats.restoredSnapshots = state.snapshots.length;

    const result = {
      restored: Boolean(latest),
      snapshot: latest,
      snapshotCount: state.snapshots.length,
      metadata: state.metadata,
    };

    this.emit("persistence:restored", result);

    return structuredClone(result);
  }

  startCheckpoints() {
    this.assertActive();

    if (this.checkpointTimer) {
      return false;
    }

    this.checkpointTimer = setInterval(() => {
      try {
        this.createCheckpoint();
      } catch (error) {
        this.emit("persistence:error", {
          operation: "checkpoint",
          message: this.formatError(error),
        });
      }
    }, Math.max(1000, this.options.checkpointIntervalMs));

    this.emit("persistence:checkpoints_started", {
      intervalMs: this.options.checkpointIntervalMs,
    });

    return true;
  }

  createCheckpoint() {
    this.assertActive();

    const snapshot = this.dashboard
      ? typeof this.dashboard.getDashboard === "function"
        ? this.dashboard.getDashboard()
        : typeof this.dashboard.getState === "function"
          ? this.dashboard.getState()
          : null
      : null;

    if (!snapshot) {
      return null;
    }

    const checkpoints =
      this.storage.getMetadata("checkpoints") || [];

    const checkpoint = {
      id: `checkpoint-${Date.now()}`,
      createdAt: Date.now(),
      snapshot,
    };

    checkpoints.push(checkpoint);

    const retained = checkpoints.slice(
      -Math.max(1, this.options.maxCheckpoints)
    );

    this.storage.setMetadata("checkpoints", retained);

    this.stats.checkpoints += 1;

    this.emit("persistence:checkpoint_created", {
      id: checkpoint.id,
      createdAt: checkpoint.createdAt,
    });

    return structuredClone(checkpoint);
  }

  getCheckpoints() {
    this.assertActive();

    return this.storage.getMetadata("checkpoints") || [];
  }

  restoreCheckpoint(id) {
    this.assertActive();

    const checkpoint = this.getCheckpoints().find(
      (item) => item.id === String(id)
    );

    if (!checkpoint) {
      return null;
    }

    this.emit("persistence:checkpoint_restored", {
      id: checkpoint.id,
      createdAt: checkpoint.createdAt,
      snapshot: checkpoint.snapshot,
    });

    return structuredClone(checkpoint.snapshot);
  }

  getStats() {
    return {
      ...this.stats,
      snapshotCount: this.storage.getSnapshots().length,
      checkpointCount: this.getCheckpoints().length,
      saving: this.saving,
      disposed: this.disposed,
    };
  }

  emit(type, detail = {}) {
    const event = {
      type,
      detail,
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryDashboardPersistence]", error);
      }
    }
  }

  formatError(error) {
    return error instanceof Error
      ? error.message
      : String(error ?? "Unknown persistence error.");
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "Recovery dashboard persistence has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    if (typeof this.unsubscribeDashboard === "function") {
      this.unsubscribeDashboard();
      this.unsubscribeDashboard = null;
    }

    if (typeof this.unsubscribeStorage === "function") {
      this.unsubscribeStorage();
      this.unsubscribeStorage = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardPersistence;