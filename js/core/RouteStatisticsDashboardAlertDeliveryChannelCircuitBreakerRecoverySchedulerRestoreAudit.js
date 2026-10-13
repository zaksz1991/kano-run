import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const DEFAULT_MAX_RECORDS = 1000;
const AUDIT_VERSION = 1;

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON cloning.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreAudit {
  constructor({
    storage = null,
    storageKey = "kano-run-scheduler-restore-audit",
    maxRecords = DEFAULT_MAX_RECORDS,
    logger = Logger,
  } = {}) {
    this.storage =
      storage ??
      (typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage
        : null);

    this.storageKey = String(storageKey);
    this.maxRecords = Math.max(
      1,
      Math.floor(Number(maxRecords) || DEFAULT_MAX_RECORDS),
    );

    this.logger = logger;
    this.events = new EventEmitter();
    this.records = [];
    this.sequence = 0;
    this.disposed = false;
    this.lastError = null;

    this.load();
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  emit(type, payload = {}) {
    this.events.emit("change", {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  record(action, details = {}) {
    this.assertActive();

    if (!isObject(details)) {
      throw new TypeError("Audit details must be an object.");
    }

    const record = {
      id: `restore-audit-${Date.now()}-${++this.sequence}`,
      sequence: this.sequence,
      timestamp: Date.now(),
      action: String(action || "unknown").slice(0, 120),
      actor: String(details.actor ?? "system").slice(0, 120),
      status: String(details.status ?? "info").slice(0, 40),
      backupId: details.backupId ? String(details.backupId) : null,
      restoreId: details.restoreId ? String(details.restoreId) : null,
      message: String(details.message ?? "").slice(0, 1000),
      metadata: isObject(details.metadata) ? clone(details.metadata) : {},
    };

    this.records.unshift(record);

    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    this.emit("change", {
      action: "recorded",
      record: clone(record),
    });

    return clone(record);
  }

  recordRestoreStarted(details = {}) {
    return this.record("restore_started", {
      ...details,
      status: "started",
    });
  }

  recordRestoreSucceeded(details = {}) {
    return this.record("restore_succeeded", {
      ...details,
      status: "success",
    });
  }

  recordRestoreFailed(details = {}) {
    return this.record("restore_failed", {
      ...details,
      status: "failed",
    });
  }

  recordBackupCreated(details = {}) {
    return this.record("backup_created", {
      ...details,
      status: "success",
    });
  }

  recordValidationFailed(details = {}) {
    return this.record("validation_failed", {
      ...details,
      status: "rejected",
    });
  }

  get(id) {
    const record = this.records.find((item) => item.id === String(id));
    return record ? clone(record) : null;
  }

  getHistory({
    limit = 100,
    action = null,
    status = null,
    since = null,
    until = null,
  } = {}) {
    this.assertActive();

    const count = Math.max(0, Math.floor(Number(limit) || 0));
    const lowerBound = since === null ? null : Number(since);
    const upperBound = until === null ? null : Number(until);

    return this.records
      .filter((record) => {
        if (action !== null && record.action !== String(action)) {
          return false;
        }

        if (status !== null && record.status !== String(status)) {
          return false;
        }

        if (
          lowerBound !== null &&
          Number.isFinite(lowerBound) &&
          record.timestamp < lowerBound
        ) {
          return false;
        }

        if (
          upperBound !== null &&
          Number.isFinite(upperBound) &&
          record.timestamp > upperBound
        ) {
          return false;
        }

        return true;
      })
      .slice(0, count)
      .map((record) => clone(record));
  }

  getSummary() {
    const actions = {};
    const statuses = {};

    for (const record of this.records) {
      actions[record.action] = (actions[record.action] ?? 0) + 1;
      statuses[record.status] = (statuses[record.status] ?? 0) + 1;
    }

    return {
      totalRecords: this.records.length,
      actions,
      statuses,
      latestRecord: this.records[0] ? clone(this.records[0]) : null,
      lastError: this.lastError,
    };
  }

  exportData() {
    return {
      version: AUDIT_VERSION,
      exportedAt: Date.now(),
      sequence: this.sequence,
      records: this.records.map((record) => clone(record)),
    };
  }

  importData(data, { replace = true } = {}) {
    this.assertActive();

    if (
      !isObject(data) ||
      data.version !== AUDIT_VERSION ||
      !Array.isArray(data.records)
    ) {
      throw new TypeError("Invalid restore audit archive.");
    }

    const imported = data.records.filter(
      (record) =>
        isObject(record) &&
        typeof record.id === "string" &&
        typeof record.action === "string" &&
        Number.isFinite(record.timestamp),
    ).map((record) => clone(record));

    if (replace) {
      this.records = imported;
    } else {
      const knownIds = new Set(this.records.map((record) => record.id));

      for (const record of imported) {
        if (!knownIds.has(record.id)) {
          this.records.push(record);
          knownIds.add(record.id);
        }
      }
    }

    this.records.sort((a, b) => b.timestamp - a.timestamp);

    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    this.sequence = Math.max(
      this.sequence,
      Number(data.sequence) || 0,
      ...this.records.map((record) => Number(record.sequence) || 0),
    );

    this.emit("change", {
      action: "imported",
      count: imported.length,
    });

    return imported.length;
  }

  save() {
    if (!this.storage) {
      this.lastError = "Audit storage is unavailable.";
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(this.exportData()),
      );

      this.lastError = null;

      this.emit("saved", {
        count: this.records.length,
        savedAt: Date.now(),
      });

      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[SchedulerRestoreAudit] Save failed.",
        error,
      );

      this.emit("error", {
        operation: "save",
        message: this.lastError,
      });

      return false;
    }
  }

  load() {
    if (!this.storage) return false;

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) return false;

      const data = JSON.parse(raw);
      this.importData(data, { replace: true });
      this.lastError = null;

      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[SchedulerRestoreAudit] Load failed.",
        error,
      );

      this.emit("error", {
        operation: "load",
        message: this.lastError,
      });

      return false;
    }
  }

  clear() {
    this.assertActive();

    const removed = this.records.length;
    this.records = [];
    this.sequence = 0;

    this.save();

    this.emit("change", {
      action: "cleared",
      removed,
    });

    return removed;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore audit has been disposed.");
    }
  }

  getStatus() {
    return {
      recordCount: this.records.length,
      maxRecords: this.maxRecords,
      storageAvailable: Boolean(this.storage),
      sequence: this.sequence,
      lastError: this.lastError,
      disposed: this.disposed,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.save();
    this.disposed = true;
    this.events.removeAllListeners?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreAudit;