import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const BACKUP_VERSION = 1;
const DEFAULT_MAX_BACKUPS = 20;

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Use JSON fallback.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createBackupId() {
  return `scheduler-backup-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerBackup {
  constructor({
    persistence = null,
    storage = null,
    storageKey = "kano-run-recovery-scheduler-backups",
    maxBackups = DEFAULT_MAX_BACKUPS,
    logger = Logger,
  } = {}) {
    this.persistence = persistence;
    this.storage =
      storage ??
      (typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage
        : null);

    this.storageKey = String(storageKey);
    this.maxBackups = Math.max(1, Number(maxBackups) || DEFAULT_MAX_BACKUPS);
    this.logger = logger;

    this.events = new EventEmitter();
    this.backups = [];
    this.disposed = false;
    this.lastError = null;

    this.load();
  }

  emit(type, payload = {}) {
    this.events.emit(type, {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  create({ label = "", metadata = {} } = {}) {
    this.assertActive();

    if (!this.persistence || typeof this.persistence.exportData !== "function") {
      throw new Error("A compatible persistence instance is required.");
    }

    const data = this.persistence.exportData();

    const backup = {
      id: createBackupId(),
      version: BACKUP_VERSION,
      label: String(label).slice(0, 160),
      createdAt: Date.now(),
      metadata: isObject(metadata) ? clone(metadata) : {},
      entryCount: Array.isArray(data.entries) ? data.entries.length : 0,
      data: clone(data),
    };

    this.backups.unshift(backup);
    this.trim();
    this.save();

    this.emit("change", {
      action: "created",
      backup: this.summarize(backup),
    });

    return clone(backup);
  }

  restore(id) {
    this.assertActive();

    const backup = this.backups.find((item) => item.id === String(id));

    if (!backup) {
      throw new Error(`Backup not found: ${String(id)}`);
    }

    if (!this.persistence || typeof this.persistence.importData !== "function") {
      throw new Error("A compatible persistence instance is required.");
    }

    const restoredCount = this.persistence.importData(
      clone(backup.data),
      { replace: true },
    );

    this.emit("change", {
      action: "restored",
      backup: this.summarize(backup),
      restoredCount,
    });

    return {
      backupId: backup.id,
      restoredCount,
      restoredAt: Date.now(),
    };
  }

  remove(id) {
    this.assertActive();

    const index = this.backups.findIndex(
      (backup) => backup.id === String(id),
    );

    if (index < 0) return false;

    const [removed] = this.backups.splice(index, 1);

    this.save();

    this.emit("change", {
      action: "removed",
      backup: this.summarize(removed),
    });

    return true;
  }

  clear() {
    this.assertActive();

    const removedCount = this.backups.length;

    this.backups = [];
    this.save();

    this.emit("change", {
      action: "cleared",
      removedCount,
    });

    return removedCount;
  }

  get(id) {
    const backup = this.backups.find((item) => item.id === String(id));
    return backup ? clone(backup) : null;
  }

  getAll() {
    return this.backups.map((backup) => clone(backup));
  }

  getHistory() {
    return this.backups.map((backup) => this.summarize(backup));
  }

  summarize(backup) {
    return {
      id: backup.id,
      version: backup.version,
      label: backup.label,
      createdAt: backup.createdAt,
      entryCount: backup.entryCount,
      metadata: clone(backup.metadata),
    };
  }

  trim() {
    if (this.backups.length > this.maxBackups) {
      this.backups.length = this.maxBackups;
    }
  }

  exportData() {
    return {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      backups: this.getAll(),
    };
  }

  importData(data, { replace = true } = {}) {
    this.assertActive();

    if (!isObject(data) || !Array.isArray(data.backups)) {
      throw new TypeError("Invalid backup archive.");
    }

    if (data.version !== BACKUP_VERSION) {
      throw new Error(
        `Unsupported backup archive version: ${String(data.version)}`,
      );
    }

    const validBackups = data.backups.filter((backup) => {
      return (
        isObject(backup) &&
        typeof backup.id === "string" &&
        backup.version === BACKUP_VERSION &&
        isObject(backup.data) &&
        Array.isArray(backup.data.entries)
      );
    }).map((backup) => clone(backup));

    if (replace) {
      this.backups = validBackups;
    } else {
      const knownIds = new Set(this.backups.map((backup) => backup.id));

      for (const backup of validBackups) {
        if (!knownIds.has(backup.id)) {
          this.backups.push(backup);
          knownIds.add(backup.id);
        }
      }
    }

    this.backups.sort((a, b) => b.createdAt - a.createdAt);
    this.trim();
    this.save();

    this.emit("change", {
      action: "imported",
      count: validBackups.length,
    });

    return validBackups.length;
  }

  save() {
    if (!this.storage) {
      this.lastError = "Persistent backup storage is unavailable.";
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(this.exportData()),
      );

      this.lastError = null;

      this.emit("saved", {
        count: this.backups.length,
        savedAt: Date.now(),
      });

      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[RecoverySchedulerBackup] Save failed.",
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

      if (!isObject(data) || data.version !== BACKUP_VERSION) {
        throw new Error("Invalid or unsupported backup archive.");
      }

      this.importData(data, { replace: true });

      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error?.message ?? String(error);

      this.logger?.warn?.(
        "[RecoverySchedulerBackup] Load failed.",
        error,
      );

      this.emit("error", {
        operation: "load",
        message: this.lastError,
      });

      return false;
    }
  }

  getStatus() {
    return {
      backupCount: this.backups.length,
      maxBackups: this.maxBackups,
      storageAvailable: Boolean(this.storage),
      persistenceAvailable: Boolean(this.persistence),
      lastError: this.lastError,
      disposed: this.disposed,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler backup manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.save();
    this.disposed = true;
    this.events.removeAllListeners?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerBackup;