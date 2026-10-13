const DEFAULT_OPTIONS = {
  storageKey: "kano-run-recovery-orchestrator",
  version: 1,
  maxRecords: 1000,
  maxRetries: 3,
};

export class RecoveryQueueRecoveryOrchestratorStorage {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.memory = null;
    this.listeners = new Set();
    this.revision = 0;
    this.disposed = false;

    this.storage = this.resolveStorage();
    this.memory = this.createEmptyState();
    this.load();
  }

  resolveStorage() {
    try {
      if (typeof globalThis === "undefined") return null;

      const candidate = globalThis.localStorage;
      if (!candidate) return null;

      const testKey = `${this.options.storageKey}:test`;
      candidate.setItem(testKey, "1");
      candidate.removeItem(testKey);

      return candidate;
    } catch {
      return null;
    }
  }

  createEmptyState() {
    return {
      version: this.options.version,
      revision: 0,
      updatedAt: Date.now(),
      tasks: [],
      completed: [],
      failed: [],
      metadata: {},
    };
  }

  notify(type, details = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      revision: this.revision,
      details,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryStorage] Listener error:", error);
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  normalizeState(state) {
    if (!state || typeof state !== "object") {
      return this.createEmptyState();
    }

    const normalized = {
      ...this.createEmptyState(),
      ...state,
    };

    for (const key of ["tasks", "completed", "failed"]) {
      if (!Array.isArray(normalized[key])) {
        normalized[key] = [];
      }

      normalized[key] = normalized[key].slice(
        -this.options.maxRecords
      );
    }

    if (
      !normalized.metadata ||
      typeof normalized.metadata !== "object" ||
      Array.isArray(normalized.metadata)
    ) {
      normalized.metadata = {};
    }

    normalized.version = this.options.version;
    normalized.revision = Number(normalized.revision) || 0;
    normalized.updatedAt = Number(normalized.updatedAt) || Date.now();

    return normalized;
  }

  load() {
    if (this.disposed) return this.clone(this.memory);

    if (!this.storage) {
      return this.clone(this.memory);
    }

    try {
      const raw = this.storage.getItem(this.options.storageKey);

      if (!raw) {
        this.memory = this.createEmptyState();
        return this.clone(this.memory);
      }

      const parsed = JSON.parse(raw);
      this.memory = this.normalizeState(parsed);
      this.revision = this.memory.revision;

      this.notify("storage_loaded", {
        taskCount: this.memory.tasks.length,
      });

      return this.clone(this.memory);
    } catch (error) {
      this.notify("storage_load_error", {
        message: error?.message || String(error),
      });

      return this.clone(this.memory);
    }
  }

  save(state) {
    if (this.disposed) {
      throw new Error("Recovery storage has been disposed.");
    }

    const normalized = this.normalizeState(state);

    normalized.revision = Math.max(
      this.revision,
      normalized.revision
    ) + 1;

    normalized.updatedAt = Date.now();

    if (this.storage) {
      try {
        this.storage.setItem(
          this.options.storageKey,
          JSON.stringify(normalized)
        );
      } catch (error) {
        this.notify("storage_save_error", {
          message: error?.message || String(error),
        });

        throw new Error("Unable to persist recovery state.", {
          cause: error,
        });
      }
    }

    this.memory = normalized;
    this.revision = normalized.revision;

    this.notify("storage_saved", {
      taskCount: normalized.tasks.length,
    });

    return this.clone(normalized);
  }

  getState() {
    return this.clone(this.memory);
  }

  getRevision() {
    return this.revision;
  }

  getTask(taskId) {
    const collections = [
      this.memory.tasks,
      this.memory.completed,
      this.memory.failed,
    ];

    for (const collection of collections) {
      const task = collection.find((item) => item.id === taskId);

      if (task) return this.clone(task);
    }

    return null;
  }

  upsertTask(task) {
    if (!task || typeof task.id !== "string" || !task.id) {
      throw new TypeError("A task with a valid ID is required.");
    }

    const state = this.getState();

    state.tasks = state.tasks.filter(
      (item) => item.id !== task.id
    );

    state.completed = state.completed.filter(
      (item) => item.id !== task.id
    );

    state.failed = state.failed.filter(
      (item) => item.id !== task.id
    );

    const copy = this.clone(task);

    switch (copy.status) {
      case "recovered":
        state.completed.push(copy);
        break;

      case "failed":
        state.failed.push(copy);
        break;

      case "cancelled":
        break;

      default:
        state.tasks.push(copy);
        break;
    }

    return this.save(state);
  }

  removeTask(taskId) {
    const state = this.getState();
    const before =
      state.tasks.length +
      state.completed.length +
      state.failed.length;

    state.tasks = state.tasks.filter(
      (task) => task.id !== taskId
    );

    state.completed = state.completed.filter(
      (task) => task.id !== taskId
    );

    state.failed = state.failed.filter(
      (task) => task.id !== taskId
    );

    const after =
      state.tasks.length +
      state.completed.length +
      state.failed.length;

    if (before === after) return false;

    this.save(state);
    return true;
  }

  setMetadata(key, value) {
    if (typeof key !== "string" || !key.trim()) {
      throw new TypeError("Metadata key must be a non-empty string.");
    }

    const state = this.getState();
    state.metadata[key] = this.clone(value);

    this.save(state);
    return true;
  }

  getMetadata(key, fallback = null) {
    if (!Object.hasOwn(this.memory.metadata, key)) {
      return fallback;
    }

    return this.clone(this.memory.metadata[key]);
  }

  clearCompleted() {
    const state = this.getState();
    const removed = state.completed.length;

    state.completed = [];

    if (removed > 0) {
      this.save(state);
    }

    return removed;
  }

  clearFailed() {
    const state = this.getState();
    const removed = state.failed.length;

    state.failed = [];

    if (removed > 0) {
      this.save(state);
    }

    return removed;
  }

  clearAll() {
    this.save(this.createEmptyState());
    this.notify("storage_cleared");
  }

  exportData() {
    return {
      format: "kano-run-recovery-state",
      version: this.options.version,
      exportedAt: Date.now(),
      data: this.getState(),
    };
  }

  importData(input, options = {}) {
    let parsed = input;

    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input);
      } catch {
        throw new Error("Imported recovery data is not valid JSON.");
      }
    }

    const imported = parsed?.data ?? parsed;

    if (!imported || typeof imported !== "object") {
      throw new TypeError("Invalid recovery state.");
    }

    if (options.replace === false) {
      const current = this.getState();

      for (const key of ["tasks", "completed", "failed"]) {
        const merged = new Map(
          current[key].map((task) => [task.id, task])
        );

        for (const task of imported[key] || []) {
          if (task?.id) merged.set(task.id, task);
        }

        current[key] = [...merged.values()].slice(
          -this.options.maxRecords
        );
      }

      current.metadata = {
        ...current.metadata,
        ...(imported.metadata || {}),
      };

      return this.save(current);
    }

    return this.save(imported);
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.listeners.clear();
    this.storage = null;
  }
}

export default RecoveryQueueRecoveryOrchestratorStorage;