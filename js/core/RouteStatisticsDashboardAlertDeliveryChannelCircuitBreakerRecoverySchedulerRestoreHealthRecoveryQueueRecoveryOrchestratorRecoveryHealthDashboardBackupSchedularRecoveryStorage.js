const DEFAULT_STORAGE_KEY = "kanoRun.recovery.scheduler.storage.v1";
const DEFAULT_MAX_RECORDS = 500;

export class RecoveryHealthDashboardBackupSchedulerRecoveryStorage {
  constructor(options = {}) {
    this.storage =
      options.storage ??
      (typeof globalThis !== "undefined" ? globalThis.localStorage : null);

    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxRecords = Math.max(
      10,
      Number(options.maxRecords) || DEFAULT_MAX_RECORDS
    );

    this.clock = options.clock ?? (() => Date.now());
    this.memoryFallback = null;
  }

  read() {
    const raw = this.readRaw();

    if (!raw) {
      return this.createEmptyState();
    }

    try {
      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        return this.createEmptyState();
      }

      return this.normalizeState(parsed);
    } catch {
      return this.createEmptyState();
    }
  }

  write(state = {}) {
    const normalized = this.normalizeState({
      ...state,
      updatedAt: this.clock(),
    });

    const serialized = JSON.stringify(normalized);

    try {
      if (this.storage) {
        this.storage.setItem(this.storageKey, serialized);
      } else {
        this.memoryFallback = serialized;
      }

      return {
        success: true,
        persisted: Boolean(this.storage),
        updatedAt: normalized.updatedAt,
      };
    } catch (error) {
      this.memoryFallback = serialized;

      return {
        success: false,
        persisted: false,
        error: this.serializeError(error),
        updatedAt: normalized.updatedAt,
      };
    }
  }

  append(record) {
    const state = this.read();

    state.records.push({
      id: record?.id ?? this.createId(),
      timestamp: Number(record?.timestamp) || this.clock(),
      type: String(record?.type ?? "event"),
      status: String(record?.status ?? "unknown"),
      details: this.sanitize(record?.details ?? {}),
    });

    if (state.records.length > this.maxRecords) {
      state.records.splice(
        0,
        state.records.length - this.maxRecords
      );
    }

    const result = this.write(state);

    return {
      ...result,
      record: state.records[state.records.length - 1],
    };
  }

  getRecords(options = {}) {
    const state = this.read();
    const limit = Math.max(
      1,
      Math.min(
        this.maxRecords,
        Number(options.limit) || this.maxRecords
      )
    );

    let records = state.records;

    if (options.type) {
      records = records.filter(
        (record) => record.type === String(options.type)
      );
    }

    if (options.status) {
      records = records.filter(
        (record) => record.status === String(options.status)
      );
    }

    if (Number.isFinite(Number(options.since))) {
      const since = Number(options.since);

      records = records.filter(
        (record) => record.timestamp >= since
      );
    }

    return records.slice(-limit).map((record) => ({
      ...record,
      details: this.sanitize(record.details),
    }));
  }

  getLatest(type) {
    const records = this.getRecords({
      limit: this.maxRecords,
      ...(type ? { type } : {}),
    });

    return records.length ? records[records.length - 1] : null;
  }

  clear() {
    try {
      if (this.storage) {
        this.storage.removeItem(this.storageKey);
      }

      this.memoryFallback = null;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.serializeError(error),
      };
    }
  }

  export() {
    return {
      exportedAt: this.clock(),
      storageKey: this.storageKey,
      state: this.read(),
    };
  }

  import(payload, options = {}) {
    if (!payload || typeof payload !== "object") {
      throw new TypeError("Import payload must be an object.");
    }

    const incoming = payload.state ?? payload;

    if (!incoming || typeof incoming !== "object") {
      throw new TypeError("Import payload does not contain valid state.");
    }

    const imported = this.normalizeState(incoming);

    if (options.merge === true) {
      const current = this.read();
      const merged = new Map();

      for (const record of [...current.records, ...imported.records]) {
        merged.set(record.id, record);
      }

      imported.records = [...merged.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-this.maxRecords);
    }

    return this.write(imported);
  }

  normalizeState(state) {
    const records = Array.isArray(state.records)
      ? state.records
          .filter((record) => record && typeof record === "object")
          .map((record) => ({
            id: String(record.id ?? this.createId()),
            timestamp: Number(record.timestamp) || this.clock(),
            type: String(record.type ?? "event"),
            status: String(record.status ?? "unknown"),
            details: this.sanitize(record.details ?? {}),
          }))
          .slice(-this.maxRecords)
      : [];

    return {
      version: 1,
      createdAt: Number(state.createdAt) || this.clock(),
      updatedAt: Number(state.updatedAt) || this.clock(),
      records,
    };
  }

  createEmptyState() {
    return {
      version: 1,
      createdAt: this.clock(),
      updatedAt: this.clock(),
      records: [],
    };
  }

  readRaw() {
    try {
      if (this.storage) {
        return this.storage.getItem(this.storageKey);
      }
    } catch {
      // Continue with the in-memory fallback.
    }

    return this.memoryFallback;
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

  createId() {
    return `recovery-${this.clock()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryStorage;