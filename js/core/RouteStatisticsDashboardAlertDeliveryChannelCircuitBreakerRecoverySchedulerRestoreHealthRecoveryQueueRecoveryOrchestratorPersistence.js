import RecoveryQueueRecoveryOrchestratorStorage from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorStorage.js";

const DEFAULT_OPTIONS = {
  autosave: true,
  debounceMs: 250,
  persistEvents: false,
  maxPersistedEvents: 500,
};

export class RecoveryQueueRecoveryOrchestratorPersistence {
  constructor(orchestrator, storage = null, options = {}) {
    if (!orchestrator) {
      throw new TypeError("A recovery orchestrator is required.");
    }

    this.orchestrator = orchestrator;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.storage =
      storage ||
      new RecoveryQueueRecoveryOrchestratorStorage();
    this.ownsStorage = !storage;
    this.disposed = false;
    this.saveTimer = null;
    this.pendingEvents = [];
    this.lastSavedRevision = 0;
    this.listeners = new Set();

    this.state = {
      events: [],
      lastPersistedAt: null,
      lastError: null,
      saveCount: 0,
      restoreCount: 0,
    };

    this.unsubscribe =
      typeof orchestrator.subscribe === "function"
        ? orchestrator.subscribe((event) => this.handleEvent(event))
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      details,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryPersistence] Listener error:", error);
      }
    }
  }

  handleEvent(event) {
    if (this.disposed || !event) return;

    if (this.options.persistEvents) {
      this.pendingEvents.push({
        event: event.event || "unknown",
        timestamp: event.timestamp || Date.now(),
        taskId: event.task?.id || null,
        taskType: event.task?.type || null,
        status: event.task?.status || null,
      });

      if (
        this.pendingEvents.length >
        this.options.maxPersistedEvents
      ) {
        this.pendingEvents.splice(
          0,
          this.pendingEvents.length -
            this.options.maxPersistedEvents
        );
      }
    }

    if (this.options.autosave) {
      this.scheduleSave();
    }
  }

  scheduleSave() {
    if (this.disposed) return;

    clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(() => {
      this.save().catch((error) => {
        this.state.lastError = error?.message || String(error);

        this.emit("save_failed", {
          message: this.state.lastError,
        });
      });
    }, Math.max(0, this.options.debounceMs));
  }

  createSnapshot() {
    const stats =
      typeof this.orchestrator.getStats === "function"
        ? this.orchestrator.getStats()
        : {};

    const queued =
      typeof this.orchestrator.getQueue === "function"
        ? this.orchestrator.getQueue()
        : [];

    const active =
      typeof this.orchestrator.getActiveTasks === "function"
        ? this.orchestrator.getActiveTasks()
        : [];

    const completed =
      typeof this.orchestrator.getCompletedTasks === "function"
        ? this.orchestrator.getCompletedTasks()
        : [];

    const failed =
      typeof this.orchestrator.getFailedTasks === "function"
        ? this.orchestrator.getFailedTasks()
        : [];

    return {
      schemaVersion: 1,
      savedAt: Date.now(),
      stats,
      tasks: [
        ...queued,
        ...active,
      ],
      completed,
      failed,
      events: this.options.persistEvents
        ? [...this.pendingEvents]
        : [],
    };
  }

  async save() {
    if (this.disposed) {
      throw new Error("Persistence manager has been disposed.");
    }

    const snapshot = this.createSnapshot();

    try {
      const saved = this.storage.save({
        ...this.storage.getState(),
        tasks: snapshot.tasks,
        completed: snapshot.completed,
        failed: snapshot.failed,
        metadata: {
          ...this.storage.getState().metadata,
          orchestratorSnapshot: snapshot,
        },
      });

      this.lastSavedRevision = saved.revision;
      this.state.lastPersistedAt = Date.now();
      this.state.lastError = null;
      this.state.saveCount += 1;

      this.emit("saved", {
        revision: saved.revision,
        taskCount: snapshot.tasks.length,
      });

      return {
        success: true,
        revision: saved.revision,
        timestamp: this.state.lastPersistedAt,
      };
    } catch (error) {
      this.state.lastError = error?.message || String(error);

      this.emit("save_failed", {
        message: this.state.lastError,
      });

      throw error;
    }
  }

  restoreSnapshot() {
    if (this.disposed) {
      throw new Error("Persistence manager has been disposed.");
    }

    const state = this.storage.getState();
    const snapshot = state.metadata?.orchestratorSnapshot;

    if (!snapshot || snapshot.schemaVersion !== 1) {
      this.emit("restore_skipped", {
        reason: "No compatible snapshot exists.",
      });

      return {
        success: false,
        reason: "snapshot_unavailable",
        restored: 0,
      };
    }

    const registeredTypes =
      this.orchestrator.handlers instanceof Map
        ? this.orchestrator.handlers
        : null;

    const candidates = Array.isArray(snapshot.tasks)
      ? snapshot.tasks
      : [];

    let restored = 0;
    let skipped = 0;

    for (const task of candidates) {
      if (
        !task ||
        typeof task.id !== "string" ||
        typeof task.type !== "string" ||
        task.status === "cancelled"
      ) {
        skipped += 1;
        continue;
      }

      if (
        registeredTypes &&
        !registeredTypes.has(task.type)
      ) {
        skipped += 1;
        continue;
      }

      try {
        this.orchestrator.submit(task.type, task.payload, {
          priority: task.priority,
          maxRetries: task.maxRetries,
        });

        restored += 1;
      } catch {
        skipped += 1;
      }
    }

    this.state.restoreCount += 1;

    this.emit("restored", {
      restored,
      skipped,
    });

    return {
      success: true,
      restored,
      skipped,
      completedHistory: Array.isArray(snapshot.completed)
        ? snapshot.completed.length
        : 0,
      failedHistory: Array.isArray(snapshot.failed)
        ? snapshot.failed.length
        : 0,
    };
  }

  getPersistedState() {
    return this.storage.getState();
  }

  getStatus() {
    return {
      ...this.state,
      pendingEvents: this.pendingEvents.length,
      lastSavedRevision: this.lastSavedRevision,
      autosave: this.options.autosave,
      disposed: this.disposed,
    };
  }

  async flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    return this.save();
  }

  async clearPersistedState() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    this.storage.clearAll();
    this.pendingEvents = [];
    this.lastSavedRevision = 0;

    this.emit("cleared");
  }

  dispose() {
    if (this.disposed) return;

    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }

    if (this.ownsStorage) {
      this.storage.dispose();
    }

    this.disposed = true;
    this.listeners.clear();
  }
}

export default RecoveryQueueRecoveryOrchestratorPersistence;