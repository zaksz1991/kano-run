import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  maxBackups: 20,
  maxSamples: 500,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthBackup {
  constructor({
    metrics = null,
    storage = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.metrics = metrics;
    this.storage = storage;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.backups = [];
    this.disposed = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  create(label = "manual") {
    this.assertActive();

    if (!this.metrics || typeof this.metrics.exportData !== "function") {
      throw new Error("Metrics provider must expose exportData().");
    }

    const source = this.metrics.exportData();

    const samples = Array.isArray(source.samples)
      ? source.samples.slice(-this.options.maxSamples).map((sample) => ({
          ...sample,
        }))
      : [];

    const timestamp = this.clock();

    const backup = {
      id: `restore-health-backup-${timestamp}-${this.backups.length + 1}`,
      version: 1,
      label: String(label).slice(0, 120),
      createdAt: new Date(timestamp).toISOString(),
      sampleCount: samples.length,
      checksum: this.checksum(samples),
      data: {
        version: 1,
        exportedAt: source.exportedAt ?? new Date(timestamp).toISOString(),
        samples,
      },
    };

    this.backups.push(backup);

    if (this.backups.length > this.options.maxBackups) {
      this.backups.splice(
        0,
        this.backups.length - this.options.maxBackups
      );
    }

    this.events.emit("backup:created", this.getMetadata(backup));

    return this.clone(backup);
  }

  createAndSave(label = "manual") {
    const backup = this.create(label);

    if (!this.storage || typeof this.storage.save !== "function") {
      return {
        success: false,
        backup,
        reason: "storage_unavailable",
      };
    }

    try {
      const result = this.storage.save(backup.data);

      const response = {
        success: Boolean(result?.saved),
        backup,
        storageResult: result,
      };

      this.events.emit(
        response.success ? "backup:saved" : "backup:save-failed",
        {
          ...this.getMetadata(backup),
          storageResult: result,
        }
      );

      return response;
    } catch (error) {
      const response = {
        success: false,
        backup,
        reason: "storage_error",
        error: error instanceof Error ? error.message : String(error),
      };

      this.events.emit("backup:save-failed", response);

      return response;
    }
  }

  restore(id) {
    this.assertActive();

    if (!this.metrics || typeof this.metrics.importData !== "function") {
      throw new Error("Metrics provider must expose importData().");
    }

    const backup = this.backups.find((item) => item.id === id);

    if (!backup) {
      return {
        success: false,
        reason: "backup_not_found",
        id,
      };
    }

    if (this.checksum(backup.data.samples) !== backup.checksum) {
      const result = {
        success: false,
        reason: "checksum_mismatch",
        id,
      };

      this.events.emit("backup:restore-failed", result);
      return result;
    }

    try {
      const count = this.metrics.importData(this.clone(backup.data));

      const result = {
        success: true,
        id,
        restoredSamples: count,
        restoredAt: new Date(this.clock()).toISOString(),
      };

      this.events.emit("backup:restored", result);

      return result;
    } catch (error) {
      const result = {
        success: false,
        reason: "restore_failed",
        id,
        error: error instanceof Error ? error.message : String(error),
      };

      this.events.emit("backup:restore-failed", result);

      return result;
    }
  }

  get(id) {
    const backup = this.backups.find((item) => item.id === id);
    return backup ? this.clone(backup) : null;
  }

  list({ limit = 20, label } = {}) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    let items = this.backups;

    if (label !== undefined) {
      items = items.filter((backup) => backup.label === label);
    }

    return items
      .slice(-count)
      .reverse()
      .map((backup) => this.getMetadata(backup));
  }

  delete(id) {
    this.assertActive();

    const index = this.backups.findIndex((item) => item.id === id);

    if (index === -1) return false;

    this.backups.splice(index, 1);

    this.events.emit("backup:deleted", {
      id,
      timestamp: this.clock(),
    });

    return true;
  }

  clear() {
    this.assertActive();

    const count = this.backups.length;
    this.backups = [];

    this.events.emit("backup:cleared", {
      count,
      timestamp: this.clock(),
    });

    return count;
  }

  exportData() {
    return {
      version: 1,
      exportedAt: new Date(this.clock()).toISOString(),
      backups: this.backups.map((backup) => this.clone(backup)),
    };
  }

  importData(data) {
    this.assertActive();

    if (!data || data.version !== 1 || !Array.isArray(data.backups)) {
      throw new TypeError("Invalid restore health backup archive.");
    }

    const imported = [];

    for (const backup of data.backups) {
      if (
        !backup ||
        backup.version !== 1 ||
        typeof backup.id !== "string" ||
        !backup.data ||
        !Array.isArray(backup.data.samples)
      ) {
        continue;
      }

      const samples = backup.data.samples
        .filter((sample) =>
          sample &&
          Number.isFinite(sample.timestamp) &&
          typeof sample.status === "string"
        )
        .slice(-this.options.maxSamples)
        .map((sample) => ({ ...sample }));

      if (this.checksum(samples) !== backup.checksum) continue;

      imported.push({
        ...this.clone(backup),
        sampleCount: samples.length,
        data: {
          version: 1,
          exportedAt: backup.data.exportedAt ?? null,
          samples,
        },
      });
    }

    this.backups = imported.slice(-this.options.maxBackups);

    this.events.emit("backup:imported", {
      count: this.backups.length,
      timestamp: this.clock(),
    });

    return this.backups.length;
  }

  getMetadata(backup) {
    return {
      id: backup.id,
      label: backup.label,
      createdAt: backup.createdAt,
      sampleCount: backup.sampleCount,
      checksum: backup.checksum,
    };
  }

  checksum(value) {
    const input = JSON.stringify(value);
    let hash = 2166136261;

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health backup manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.events.emit("backup:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthBackup;