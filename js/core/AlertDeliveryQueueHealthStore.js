const DEFAULT_STORAGE_KEY = "kanoRun.alertQueueHealth";
const DEFAULT_MAX_RECORDS = 500;

export class AlertDeliveryQueueHealthStore {
  constructor({
    storage = globalThis.localStorage,
    storageKey = DEFAULT_STORAGE_KEY,
    maxRecords = DEFAULT_MAX_RECORDS,
    clock = () => Date.now(),
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxRecords = Math.max(1, Number(maxRecords) || DEFAULT_MAX_RECORDS);
    this.clock = clock;
    this.records = [];
    this.lastError = null;
    this.loaded = false;
    this.listeners = new Set();
  }

  load() {
    try {
      if (!this.storage) {
        throw new Error("Storage is unavailable.");
      }

      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        this.records = [];
        this.loaded = true;
        this.lastError = null;

        return {
          success: true,
          count: 0,
        };
      }

      const payload = JSON.parse(raw);

      if (
        !payload ||
        payload.version !== 1 ||
        !Array.isArray(payload.records)
      ) {
        throw new Error("Invalid health store data.");
      }

      this.records = payload.records
        .filter((record) => record && typeof record.id === "string")
        .slice(-this.maxRecords);

      this.loaded = true;
      this.lastError = null;

      this.#emit({
        type: "loaded",
        count: this.records.length,
      });

      return {
        success: true,
        count: this.records.length,
      };
    } catch (error) {
      this.lastError = error.message;

      return {
        success: false,
        count: 0,
        error: error.message,
      };
    }
  }

  add(record) {
    if (!record || typeof record !== "object") {
      throw new TypeError("A health record is required.");
    }

    const timestamp = this.clock();

    const entry = {
      ...record,
      id: String(record.id ?? this.#createId()),
      storedAt: new Date(timestamp).toISOString(),
    };

    const existingIndex = this.records.findIndex(
      (item) => item.id === entry.id,
    );

    if (existingIndex >= 0) {
      this.records[existingIndex] = entry;
    } else {
      this.records.push(entry);
    }

    this.#trim();

    const persistence = this.save();

    this.#emit({
      type: "record_added",
      record: entry,
      persisted: persistence.success,
    });

    return {
      record: entry,
      persisted: persistence.success,
      error: persistence.error ?? null,
    };
  }

  addMany(records = []) {
    if (!Array.isArray(records)) {
      throw new TypeError("Records must be an array.");
    }

    const added = [];

    for (const record of records) {
      if (record && typeof record === "object") {
        const timestamp = this.clock();

        added.push({
          ...record,
          id: String(record.id ?? this.#createId()),
          storedAt: new Date(timestamp).toISOString(),
        });
      }
    }

    for (const entry of added) {
      const index = this.records.findIndex(
        (item) => item.id === entry.id,
      );

      if (index >= 0) {
        this.records[index] = entry;
      } else {
        this.records.push(entry);
      }
    }

    this.#trim();

    const persistence = this.save();

    this.#emit({
      type: "records_added",
      count: added.length,
      persisted: persistence.success,
    });

    return {
      success: persistence.success,
      added: added.length,
      error: persistence.error ?? null,
    };
  }

  save() {
    try {
      if (!this.storage) {
        throw new Error("Storage is unavailable.");
      }

      this.#trim();

      const payload = {
        version: 1,
        savedAt: new Date(this.clock()).toISOString(),
        records: this.records,
      };

      this.storage.setItem(
        this.storageKey,
        JSON.stringify(payload),
      );

      this.lastError = null;

      return {
        success: true,
        count: this.records.length,
        savedAt: payload.savedAt,
      };
    } catch (error) {
      this.lastError = error.message;

      return {
        success: false,
        error: error.message,
      };
    }
  }

  get(id) {
    const key = String(id);
    return this.records.find((record) => record.id === key) ?? null;
  }

  query({
    status,
    severity,
    from,
    to,
    limit = 100,
  } = {}) {
    let results = this.records;

    if (status) {
      results = results.filter(
        (record) => record.status === status,
      );
    }

    if (severity) {
      results = results.filter((record) =>
        (record.issues ?? []).some(
          (issue) => issue.severity === severity,
        ),
      );
    }

    if (from !== undefined) {
      const minimum = new Date(from).getTime();

      if (Number.isFinite(minimum)) {
        results = results.filter(
          (record) =>
            new Date(record.checkedAt ?? record.storedAt).getTime() >=
            minimum,
        );
      }
    }

    if (to !== undefined) {
      const maximum = new Date(to).getTime();

      if (Number.isFinite(maximum)) {
        results = results.filter(
          (record) =>
            new Date(record.checkedAt ?? record.storedAt).getTime() <=
            maximum,
        );
      }
    }

    const safeLimit = Math.max(1, Number(limit) || 100);

    return results.slice(-safeLimit);
  }

  getSummary() {
    const counts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    };

    for (const record of this.records) {
      const status = record.status ?? "unknown";

      if (Object.hasOwn(counts, status)) {
        counts[status] += 1;
      } else {
        counts.unknown += 1;
      }
    }

    return {
      total: this.records.length,
      counts,
      loaded: this.loaded,
      lastError: this.lastError,
      storageAvailable: Boolean(this.storage),
    };
  }

  remove(id) {
    const key = String(id);
    const previousLength = this.records.length;

    this.records = this.records.filter(
      (record) => record.id !== key,
    );

    if (this.records.length === previousLength) {
      return {
        success: true,
        removed: false,
      };
    }

    const persistence = this.save();

    this.#emit({
      type: "record_removed",
      id: key,
      persisted: persistence.success,
    });

    return {
      success: persistence.success,
      removed: true,
      error: persistence.error ?? null,
    };
  }

  clear() {
    this.records = [];

    const persistence = this.save();

    this.#emit({
      type: "cleared",
      persisted: persistence.success,
    });

    return persistence;
  }

  exportJSON() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date(this.clock()).toISOString(),
        records: this.records,
      },
      null,
      2,
    );
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.listeners.clear();
  }

  #trim() {
    if (this.records.length > this.maxRecords) {
      this.records.splice(
        0,
        this.records.length - this.maxRecords,
      );
    }
  }

  #createId() {
    return `health-${this.clock()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not interrupt store operations.
      }
    }
  }
}

export default AlertDeliveryQueueHealthStore;