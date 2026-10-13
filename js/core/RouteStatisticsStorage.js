import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  storageKey: "kanoRunRouteStatistics",
  version: 1,
  maxRecords: 5000,
  maxBytes: 5 * 1024 * 1024,
};

export class RouteStatisticsStorage {
  constructor({
    storage = null,
    logger = Logger,
    options = {},
  } = {}) {
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.storage = storage ?? this.getDefaultStorage();
    this.memory = new Map();
    this.disposed = false;
  }

  getDefaultStorage() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsStorage: localStorage is unavailable.",
        error,
      );
    }

    return null;
  }

  save(records, metadata = {}) {
    this.assertActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Statistics records must be an array.");
    }

    const normalized = records
      .filter((record) => record && typeof record === "object")
      .slice(-Math.max(1, this.options.maxRecords))
      .map((record) => this.clone(record));

    const payload = {
      version: this.options.version,
      savedAt: new Date().toISOString(),
      metadata: this.clone(metadata),
      records: normalized,
    };

    let serialized;

    try {
      serialized = JSON.stringify(payload);
    } catch (error) {
      this.logger?.error?.(
        "RouteStatisticsStorage: unable to serialize statistics.",
        error,
      );
      throw error;
    }

    if (this.getByteLength(serialized) > this.options.maxBytes) {
      throw new Error("Route statistics exceed the configured storage limit.");
    }

    if (this.storage) {
      try {
        this.storage.setItem(this.options.storageKey, serialized);
        this.memory.set(this.options.storageKey, serialized);

        return {
          saved: true,
          persistent: true,
          recordCount: normalized.length,
          savedAt: payload.savedAt,
        };
      } catch (error) {
        this.logger?.warn?.(
          "RouteStatisticsStorage: persistent save failed; using memory storage.",
          error,
        );
      }
    }

    this.memory.set(this.options.storageKey, serialized);

    return {
      saved: true,
      persistent: false,
      recordCount: normalized.length,
      savedAt: payload.savedAt,
    };
  }

  load() {
    this.assertActive();

    let serialized = null;

    if (this.storage) {
      try {
        serialized = this.storage.getItem(this.options.storageKey);
      } catch (error) {
        this.logger?.warn?.(
          "RouteStatisticsStorage: persistent load failed.",
          error,
        );
      }
    }

    if (!serialized) {
      serialized = this.memory.get(this.options.storageKey) ?? null;
    }

    if (!serialized) {
      return this.createEmptyResult();
    }

    let payload;

    try {
      payload = JSON.parse(serialized);
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsStorage: stored statistics are invalid JSON.",
        error,
      );

      return this.createEmptyResult();
    }

    if (!payload || typeof payload !== "object" || !Array.isArray(payload.records)) {
      this.logger?.warn?.(
        "RouteStatisticsStorage: stored statistics have an invalid structure.",
      );

      return this.createEmptyResult();
    }

    if (
      Number(payload.version) !== Number(this.options.version)
    ) {
      this.logger?.warn?.(
        `RouteStatisticsStorage: unsupported data version ${payload.version}.`,
      );

      return {
        ...this.createEmptyResult(),
        unsupportedVersion: payload.version,
      };
    }

    return {
      version: payload.version,
      savedAt: payload.savedAt ?? null,
      metadata: this.clone(payload.metadata ?? {}),
      records: payload.records
        .filter((record) => record && typeof record === "object")
        .slice(-Math.max(1, this.options.maxRecords))
        .map((record) => this.clone(record)),
    };
  }

  append(record) {
    this.assertActive();

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("A valid statistics record is required.");
    }

    const current = this.load();
    const records = [...current.records, this.clone(record)];

    return this.save(records, current.metadata);
  }

  update(recordId, updates, idField = "id") {
    this.assertActive();

    if (recordId === undefined || recordId === null) {
      throw new TypeError("A record ID is required.");
    }

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new TypeError("Updates must be an object.");
    }

    const current = this.load();
    let updated = false;

    const records = current.records.map((record) => {
      if (record[idField] !== recordId) {
        return record;
      }

      updated = true;

      return {
        ...record,
        ...this.clone(updates),
        [idField]: recordId,
      };
    });

    if (!updated) {
      return {
        updated: false,
        recordCount: records.length,
      };
    }

    const result = this.save(records, current.metadata);

    return {
      updated: true,
      ...result,
    };
  }

  remove(recordId, idField = "id") {
    this.assertActive();

    const current = this.load();
    const records = current.records.filter(
      (record) => record[idField] !== recordId,
    );

    const removedCount = current.records.length - records.length;

    if (removedCount === 0) {
      return {
        removed: false,
        removedCount: 0,
      };
    }

    const result = this.save(records, current.metadata);

    return {
      removed: true,
      removedCount,
      ...result,
    };
  }

  clear() {
    this.assertActive();

    let persistent = false;

    if (this.storage) {
      try {
        this.storage.removeItem(this.options.storageKey);
        persistent = true;
      } catch (error) {
        this.logger?.warn?.(
          "RouteStatisticsStorage: unable to clear persistent statistics.",
          error,
        );
      }
    }

    this.memory.delete(this.options.storageKey);

    return {
      cleared: true,
      persistent,
    };
  }

  exportJSON({ pretty = true } = {}) {
    this.assertActive();

    const payload = this.load();

    return JSON.stringify(
      {
        application: "Kano Run",
        exportType: "route-statistics",
        exportedAt: new Date().toISOString(),
        ...payload,
      },
      null,
      pretty ? 2 : 0,
    );
  }

  importJSON(input, { merge = false } = {}) {
    this.assertActive();

    let payload;

    try {
      payload = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      throw new Error(`Invalid statistics JSON: ${error.message}`);
    }

    if (!payload || typeof payload !== "object" || !Array.isArray(payload.records)) {
      throw new TypeError("Import data must contain a records array.");
    }

    const incoming = payload.records.filter(
      (record) => record && typeof record === "object" && !Array.isArray(record),
    );

    const existing = merge ? this.load().records : [];
    const combined = merge
      ? this.mergeRecords(existing, incoming)
      : incoming;

    const result = this.save(
      combined,
      {
        importedAt: new Date().toISOString(),
        sourceVersion: payload.version ?? null,
        merged: merge,
      },
    );

    return {
      imported: true,
      importedCount: incoming.length,
      totalRecords: result.recordCount,
      persistent: result.persistent,
    };
  }

  mergeRecords(existing, incoming, idField = "id") {
    const merged = new Map();
    let generatedKey = 0;

    for (const record of existing) {
      const id = record[idField];

      const key =
        id === undefined || id === null
          ? `existing:${generatedKey++}`
          : `id:${String(id)}`;

      merged.set(key, this.clone(record));
    }

    for (const record of incoming) {
      const id = record[idField];

      const key =
        id === undefined || id === null
          ? `incoming:${generatedKey++}`
          : `id:${String(id)}`;

      if (merged.has(key)) {
        merged.set(key, {
          ...merged.get(key),
          ...this.clone(record),
        });
      } else {
        merged.set(key, this.clone(record));
      }
    }

    return [...merged.values()];
  }

  getMetadata() {
    const payload = this.load();

    return {
      version: payload.version,
      savedAt: payload.savedAt,
      recordCount: payload.records.length,
      metadata: payload.metadata,
    };
  }

  getByteLength(value) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value).length;
    }

    return value.length * 2;
  }

  clone(value) {
    if (value === undefined) {
      return undefined;
    }

    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  createEmptyResult() {
    return {
      version: this.options.version,
      savedAt: null,
      metadata: {},
      records: [],
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsStorage has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.memory.clear();
    this.storage = null;
    this.logger = null;
    this.disposed = true;
  }
}

export default RouteStatisticsStorage;