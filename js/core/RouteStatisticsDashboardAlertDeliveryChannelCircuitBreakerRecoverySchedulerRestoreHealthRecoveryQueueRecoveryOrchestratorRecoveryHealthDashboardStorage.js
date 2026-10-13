const DEFAULT_KEY =
  "kano-run:recovery-health-dashboard:v1";

const DEFAULT_OPTIONS = {
  storage: null,
  key: DEFAULT_KEY,
  maxEntries: 1000,
  version: 1,
};

export class RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardStorage {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.storage = this.resolveStorage(this.options.storage);
    this.disposed = false;
    this.listeners = new Set();

    this.state = {
      version: this.options.version,
      updatedAt: Date.now(),
      snapshots: [],
      metadata: {},
    };
  }

  resolveStorage(storage) {
    if (storage) return storage;

    try {
      if (typeof globalThis.localStorage !== "undefined") {
        return globalThis.localStorage;
      }
    } catch {
      // Storage may be disabled by browser privacy settings.
    }

    return null;
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Storage listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  load() {
    this.assertActive();

    if (!this.storage) {
      return this.getState();
    }

    try {
      const raw = this.storage.getItem(this.options.key);

      if (!raw) {
        return this.getState();
      }

      const parsed = JSON.parse(raw);

      if (!this.isValidState(parsed)) {
        this.emit("storage:invalid_data", {
          key: this.options.key,
        });

        return this.getState();
      }

      this.state = {
        version: this.options.version,
        updatedAt: Number(parsed.updatedAt) || Date.now(),
        snapshots: parsed.snapshots.slice(
          -Math.max(1, this.options.maxEntries)
        ),
        metadata:
          parsed.metadata && typeof parsed.metadata === "object"
            ? parsed.metadata
            : {},
      };

      this.emit("storage:loaded", {
        snapshotCount: this.state.snapshots.length,
      });
    } catch (error) {
      this.emit("storage:error", {
        operation: "load",
        message: this.formatError(error),
      });
    }

    return this.getState();
  }

  save() {
    this.assertActive();

    this.state.updatedAt = Date.now();

    this.state.snapshots = this.state.snapshots.slice(
      -Math.max(1, this.options.maxEntries)
    );

    if (!this.storage) {
      this.emit("storage:unavailable", {
        operation: "save",
      });

      return false;
    }

    try {
      this.storage.setItem(
        this.options.key,
        JSON.stringify(this.state)
      );

      this.emit("storage:saved", {
        snapshotCount: this.state.snapshots.length,
        updatedAt: this.state.updatedAt,
      });

      return true;
    } catch (error) {
      this.emit("storage:error", {
        operation: "save",
        message: this.formatError(error),
      });

      return false;
    }
  }

  appendSnapshot(snapshot) {
    this.assertActive();

    if (!snapshot || typeof snapshot !== "object") {
      throw new TypeError("A dashboard snapshot object is required.");
    }

    const entry = {
      id: `health-snapshot-${Date.now()}-${this.state.snapshots.length + 1}`,
      timestamp: Date.now(),
      ...snapshot,
    };

    this.state.snapshots.push(entry);

    this.state.snapshots = this.state.snapshots.slice(
      -Math.max(1, this.options.maxEntries)
    );

    this.state.updatedAt = Date.now();

    this.emit("storage:snapshot_added", {
      id: entry.id,
      timestamp: entry.timestamp,
    });

    return structuredClone(entry);
  }

  getSnapshots(options = {}) {
    this.assertActive();

    let snapshots = this.state.snapshots;

    if (options.since != null) {
      const since = Number(options.since);

      snapshots = snapshots.filter(
        (snapshot) => snapshot.timestamp >= since
      );
    }

    if (options.status) {
      snapshots = snapshots.filter(
        (snapshot) => snapshot.status === options.status
      );
    }

    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.maxEntries)
    );

    return snapshots
      .slice(-limit)
      .map((snapshot) => structuredClone(snapshot));
  }

  getLatestSnapshot() {
    const snapshots = this.state.snapshots;

    if (snapshots.length === 0) {
      return null;
    }

    return structuredClone(snapshots[snapshots.length - 1]);
  }

  setMetadata(key, value) {
    this.assertActive();

    if (!key || typeof key !== "string") {
      throw new TypeError("Metadata key must be a non-empty string.");
    }

    this.state.metadata[key] = value;
    this.state.updatedAt = Date.now();

    this.emit("storage:metadata_updated", {
      key,
      updatedAt: this.state.updatedAt,
    });

    return this.save();
  }

  getMetadata(key = null) {
    this.assertActive();

    if (key === null) {
      return structuredClone(this.state.metadata);
    }

    return Object.hasOwn(this.state.metadata, key)
      ? structuredClone(this.state.metadata[key])
      : null;
  }

  getState() {
    this.assertActive();
    return structuredClone(this.state);
  }

  isValidState(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        Number.isInteger(value.version) &&
        Array.isArray(value.snapshots)
    );
  }

  clear() {
    this.assertActive();

    const previousCount = this.state.snapshots.length;

    this.state.snapshots = [];
    this.state.updatedAt = Date.now();

    const persisted = this.save();

    this.emit("storage:cleared", {
      removedSnapshots: previousCount,
      persisted,
    });

    return previousCount;
  }

  clearAll() {
    this.assertActive();

    this.state = {
      version: this.options.version,
      updatedAt: Date.now(),
      snapshots: [],
      metadata: {},
    };

    if (this.storage) {
      try {
        this.storage.removeItem(this.options.key);
      } catch (error) {
        this.emit("storage:error", {
          operation: "clearAll",
          message: this.formatError(error),
        });

        return false;
      }
    }

    this.emit("storage:cleared_all", {
      timestamp: this.state.updatedAt,
    });

    return true;
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
        console.error("[RecoveryHealthDashboardStorage]", error);
      }
    }
  }

  formatError(error) {
    return error instanceof Error
      ? error.message
      : String(error ?? "Unknown storage error.");
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "Recovery health dashboard storage has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.listeners.clear();
    this.disposed = true;
    this.storage = null;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardStorage;