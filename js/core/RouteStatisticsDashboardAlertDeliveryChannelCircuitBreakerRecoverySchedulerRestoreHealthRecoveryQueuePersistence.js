const DEFAULT_CONFIG = Object.freeze({
  storageKey: "kano-run-recovery-queue",
  version: 1,
  maxRecords: 500,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  autoSave: true,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueuePersistence {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    this.storage =
      options.storage ??
      (typeof globalThis !== "undefined" ? globalThis.localStorage : null);

    this.memoryFallback = new Map();
    this.destroyed = false;
    this.lastSavedAt = null;
    this.lastLoadedAt = null;

    this.stats = {
      saves: 0,
      loads: 0,
      errors: 0,
      pruned: 0,
    };
  }

  save(records, options = {}) {
    this.#assertActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Persistence records must be an array.");
    }

    const now = Date.now();
    const normalized = records
      .filter((record) => record && typeof record === "object")
      .map((record) => this.#sanitizeRecord(record, now))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const fresh = normalized.filter(
      (record) => now - record.updatedAt <= this.config.maxAgeMs
    );

    this.stats.pruned += normalized.length - fresh.length;

    const limited = fresh.slice(0, this.config.maxRecords);

    const envelope = {
      version: this.config.version,
      savedAt: now,
      count: limited.length,
      records: limited,
    };

    try {
      const serialized = JSON.stringify(envelope);

      if (this.storage) {
        this.storage.setItem(this.config.storageKey, serialized);
      } else {
        this.memoryFallback.set(this.config.storageKey, serialized);
      }

      this.lastSavedAt = now;
      this.stats.saves += 1;

      return {
        success: true,
        count: limited.length,
        savedAt: now,
        source: this.storage ? "storage" : "memory",
      };
    } catch (error) {
      this.stats.errors += 1;

      if (options.throwOnError) {
        throw error;
      }

      return {
        success: false,
        count: 0,
        error: this.#serializeError(error),
      };
    }
  }

  load(options = {}) {
    this.#assertActive();

    let serialized;

    try {
      serialized = this.storage
        ? this.storage.getItem(this.config.storageKey)
        : this.memoryFallback.get(this.config.storageKey);

      if (!serialized) {
        return {
          success: true,
          records: [],
          count: 0,
          savedAt: null,
        };
      }

      const envelope = JSON.parse(serialized);

      if (!this.#isValidEnvelope(envelope)) {
        throw new Error("Stored recovery queue data is invalid.");
      }

      const now = Date.now();

      const records = envelope.records
        .map((record) => this.#sanitizeRecord(record, now))
        .filter(Boolean)
        .filter(
          (record) => now - record.updatedAt <= this.config.maxAgeMs
        )
        .slice(0, this.config.maxRecords);

      this.lastLoadedAt = now;
      this.stats.loads += 1;

      const result = {
        success: true,
        records,
        count: records.length,
        savedAt: envelope.savedAt,
        version: envelope.version,
      };

      if (options.prune && records.length !== envelope.records.length) {
        this.save(records);
      }

      return result;
    } catch (error) {
      this.stats.errors += 1;

      if (options.throwOnError) {
        throw error;
      }

      return {
        success: false,
        records: [],
        count: 0,
        error: this.#serializeError(error),
      };
    }
  }

  upsert(record) {
    this.#assertActive();

    if (!record || typeof record.id !== "string" || !record.id) {
      throw new TypeError("A record with a non-empty id is required.");
    }

    const loaded = this.load();

    if (!loaded.success) {
      throw new Error("Cannot update recovery queue persistence.");
    }

    const records = loaded.records.filter((item) => item.id !== record.id);

    records.unshift({
      ...record,
      updatedAt: Date.now(),
    });

    return this.save(records);
  }

  remove(id) {
    this.#assertActive();

    if (typeof id !== "string" || !id) {
      return false;
    }

    const loaded = this.load();

    if (!loaded.success) {
      return false;
    }

    const records = loaded.records.filter((record) => record.id !== id);

    if (records.length === loaded.records.length) {
      return false;
    }

    return this.save(records);
  }

  clear() {
    this.#assertActive();

    try {
      if (this.storage) {
        this.storage.removeItem(this.config.storageKey);
      } else {
        this.memoryFallback.delete(this.config.storageKey);
      }

      return true;
    } catch (error) {
      this.stats.errors += 1;
      return false;
    }
  }

  exportData() {
    const result = this.load();

    if (!result.success) {
      throw new Error("Unable to export recovery queue data.");
    }

    return JSON.stringify(
      {
        version: this.config.version,
        exportedAt: Date.now(),
        records: result.records,
      },
      null,
      2
    );
  }

  importData(serialized, options = {}) {
    this.#assertActive();

    let parsed;

    try {
      parsed =
        typeof serialized === "string"
          ? JSON.parse(serialized)
          : serialized;
    } catch {
      throw new Error("Import data is not valid JSON.");
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.records)
    ) {
      throw new Error("Import data has an unsupported format.");
    }

    const imported = parsed.records
      .map((record) => this.#sanitizeRecord(record, Date.now()))
      .filter(Boolean);

    if (options.merge) {
      const current = this.load();

      if (!current.success) {
        throw new Error("Unable to merge with stored records.");
      }

      const merged = new Map(
        current.records.map((record) => [record.id, record])
      );

      for (const record of imported) {
        const existing = merged.get(record.id);

        if (!existing || record.updatedAt > existing.updatedAt) {
          merged.set(record.id, record);
        }
      }

      return this.save(Array.from(merged.values()));
    }

    return this.save(imported);
  }

  getStats() {
    return {
      ...this.stats,
      lastSavedAt: this.lastSavedAt,
      lastLoadedAt: this.lastLoadedAt,
      storageAvailable: Boolean(this.storage),
      storageKey: this.config.storageKey,
    };
  }

  #sanitizeRecord(record, now) {
    if (!record || typeof record !== "object") {
      return null;
    }

    if (typeof record.id !== "string" || !record.id) {
      return null;
    }

    const createdAt = Number.isFinite(record.createdAt)
      ? record.createdAt
      : now;

    const updatedAt = Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt;

    return {
      id: record.id.slice(0, 200),
      status: this.#safeString(record.status, "unknown", 40),
      priority: Number.isFinite(record.priority)
        ? Math.max(0, Math.floor(record.priority))
        : 0,
      attempts: Number.isInteger(record.attempts)
        ? Math.max(0, record.attempts)
        : 0,
      createdAt,
      updatedAt,
      metadata: this.#sanitizeMetadata(record.metadata),
      error: record.error
        ? {
            name: this.#safeString(record.error.name, "Error", 100),
            message: this.#safeString(record.error.message, "", 1000),
            timestamp: Number.isFinite(record.error.timestamp)
              ? record.error.timestamp
              : updatedAt,
          }
        : null,
    };
  }

  #sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return {};
    }

    try {
      const serialized = JSON.stringify(metadata);

      if (!serialized || serialized.length > 10_000) {
        return {};
      }

      return JSON.parse(serialized);
    } catch {
      return {};
    }
  }

  #isValidEnvelope(value) {
    return (
      value &&
      typeof value === "object" &&
      value.version === this.config.version &&
      Array.isArray(value.records)
    );
  }

  #safeString(value, fallback, maxLength) {
    return typeof value === "string"
      ? value.slice(0, maxLength)
      : fallback;
  }

  #serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      timestamp: Date.now(),
    };
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery queue persistence has been destroyed.");
    }
  }

  destroy() {
    this.destroyed = true;
    this.memoryFallback.clear();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueuePersistence;