const DEFAULT_OPTIONS = {
  namespace: "kano-run-backup-scheduler",
  version: 1,
  maxEntries: 100,
};

export class RecoveryHealthDashboardBackupSchedulerStorage {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.listeners = new Set();
    this.disposed = false;
    this.memory = new Map();
    this.storage = this._resolveStorage();

    this._loadFromStorage();
  }

  _resolveStorage() {
    try {
      if (typeof localStorage !== "undefined") {
        const testKey = `${this.options.namespace}:test`;
        localStorage.setItem(testKey, "1");
        localStorage.removeItem(testKey);
        return localStorage;
      }
    } catch {
      // Use in-memory storage when browser storage is unavailable.
    }

    return null;
  }

  _key(name) {
    return `${this.options.namespace}:${name}`;
  }

  _emit(event, detail = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // Storage subscribers cannot interrupt storage operations.
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Storage listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _loadFromStorage() {
    if (!this.storage) return;

    try {
      const prefix = `${this.options.namespace}:`;

      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);

        if (!key || !key.startsWith(prefix)) continue;

        const name = key.slice(prefix.length);
        const raw = this.storage.getItem(key);

        if (raw === null) continue;

        try {
          this.memory.set(name, JSON.parse(raw));
        } catch {
          this._emit("corrupt-entry", { key });
        }
      }
    } catch (error) {
      this._emit("storage-error", {
        operation: "load",
        message: error?.message || String(error),
      });
    }
  }

  _assertActive() {
    if (this.disposed) {
      throw new Error("Backup scheduler storage has been disposed.");
    }
  }

  get(name, fallback = null) {
    this._assertActive();

    const value = this.memory.get(name);

    if (value === undefined) return fallback;

    return this._clone(value);
  }

  set(name, value) {
    this._assertActive();

    if (!name || typeof name !== "string") {
      throw new TypeError("Storage key must be a non-empty string.");
    }

    const cloned = this._clone(value);

    this.memory.set(name, cloned);

    try {
      this.storage?.setItem(
        this._key(name),
        JSON.stringify(cloned)
      );
    } catch (error) {
      this._emit("storage-error", {
        operation: "set",
        key: name,
        message: error?.message || String(error),
      });
    }

    this._emit("entry-saved", { key: name });

    return this._clone(cloned);
  }

  remove(name) {
    this._assertActive();

    const existed = this.memory.delete(name);

    try {
      this.storage?.removeItem(this._key(name));
    } catch (error) {
      this._emit("storage-error", {
        operation: "remove",
        key: name,
        message: error?.message || String(error),
      });
    }

    if (existed) {
      this._emit("entry-removed", { key: name });
    }

    return existed;
  }

  has(name) {
    this._assertActive();
    return this.memory.has(name);
  }

  keys() {
    this._assertActive();
    return [...this.memory.keys()];
  }

  entries() {
    this._assertActive();

    return [...this.memory.entries()].map(([key, value]) => [
      key,
      this._clone(value),
    ]);
  }

  append(name, value, limit = this.options.maxEntries) {
    const current = this.get(name, []);

    if (!Array.isArray(current)) {
      throw new TypeError(`Stored value "${name}" is not an array.`);
    }

    current.push(this._clone(value));

    const safeLimit = Math.max(1, Number(limit) || 100);

    if (current.length > safeLimit) {
      current.splice(0, current.length - safeLimit);
    }

    this.set(name, current);

    return current;
  }

  update(name, updater, fallback = null) {
    this._assertActive();

    if (typeof updater !== "function") {
      throw new TypeError("Updater must be a function.");
    }

    const current = this.get(name, fallback);
    const next = updater(current);

    this.set(name, next);

    return this._clone(next);
  }

  clear(options = {}) {
    this._assertActive();

    const preserve = new Set(options.preserve || []);
    let removed = 0;

    for (const name of [...this.memory.keys()]) {
      if (preserve.has(name)) continue;

      this.memory.delete(name);
      removed += 1;

      try {
        this.storage?.removeItem(this._key(name));
      } catch {
        // Continue clearing remaining entries.
      }
    }

    this._emit("storage-cleared", { removed });

    return removed;
  }

  getMetadata() {
    return {
      namespace: this.options.namespace,
      version: this.options.version,
      entryCount: this.memory.size,
      persistent: Boolean(this.storage),
      disposed: this.disposed,
    };
  }

  export() {
    this._assertActive();

    return {
      version: this.options.version,
      namespace: this.options.namespace,
      exportedAt: new Date().toISOString(),
      entries: this.entries(),
    };
  }

  import(data, options = {}) {
    this._assertActive();

    if (!data || !Array.isArray(data.entries)) {
      throw new TypeError("Invalid storage export format.");
    }

    if (
      data.version !== undefined &&
      data.version > this.options.version
    ) {
      throw new Error(
        "The imported data uses a newer storage version."
      );
    }

    if (!options.merge) {
      this.clear();
    }

    let imported = 0;

    for (const entry of data.entries) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string"
      ) {
        continue;
      }

      this.set(entry[0], entry[1]);
      imported += 1;
    }

    this._emit("storage-imported", { imported });

    return { imported };
  }

  _clone(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall back to JSON cloning for serializable values.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  dispose() {
    if (this.disposed) return;

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerStorage;