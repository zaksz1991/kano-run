import RecoveryHealthDashboardPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardPersistence.js";

const DEFAULT_OPTIONS = {
  namespace: "kano-run-recovery-health-dashboard",
  maxBackups: 10,
  autoBackup: true,
  intervalMs: 60_000,
  retainDays: 7,
};

export class RecoveryHealthDashboardBackup {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.persistence =
      options.persistence ||
      new RecoveryHealthDashboardPersistence(options);

    this.backups = [];
    this.listeners = new Set();
    this.timer = null;
    this.running = false;
    this.disposed = false;
    this.lastBackupAt = null;
    this.lastError = null;

    this._loadExistingBackups();

    if (this.options.autoBackup) {
      this.start();
    }
  }

  _storageKey() {
    return `${this.options.namespace}:backups`;
  }

  _loadExistingBackups() {
    try {
      if (typeof localStorage === "undefined") return;

      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        this.backups = parsed
          .filter((item) => item && item.id && item.createdAt)
          .slice(0, this.options.maxBackups);
      }
    } catch (error) {
      this.lastError = this._serializeError(error);
    }
  }

  _persistIndex() {
    try {
      if (typeof localStorage === "undefined") return;

      localStorage.setItem(
        this._storageKey(),
        JSON.stringify(this.backups)
      );
    } catch (error) {
      this.lastError = this._serializeError(error);
      this._emit("storage-error", {
        error: this.lastError,
      });
    }
  }

  _serializeError(error) {
    return {
      name: error?.name || "Error",
      message: error?.message || String(error),
      timestamp: new Date().toISOString(),
    };
  }

  _createId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `backup-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
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
        // A listener must not interrupt backup operations.
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Backup listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  async _captureSnapshot() {
    if (typeof this.options.getSnapshot === "function") {
      return await this.options.getSnapshot();
    }

    if (
      this.persistence &&
      typeof this.persistence.exportSnapshot === "function"
    ) {
      return await this.persistence.exportSnapshot();
    }

    if (
      this.persistence &&
      typeof this.persistence.getSnapshot === "function"
    ) {
      return await this.persistence.getSnapshot();
    }

    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      backupsMetadata: {
        namespace: this.options.namespace,
      },
    };
  }

  async createBackup(metadata = {}) {
    if (this.disposed) {
      throw new Error("Backup service has been disposed.");
    }

    if (this.running) {
      return {
        skipped: true,
        reason: "backup-already-running",
      };
    }

    this.running = true;

    try {
      const snapshot = await this._captureSnapshot();
      const createdAt = new Date().toISOString();

      const backup = {
        id: this._createId(),
        namespace: this.options.namespace,
        createdAt,
        version: 1,
        metadata: {
          ...metadata,
        },
        snapshot,
      };

      this.backups.unshift(backup);
      this._pruneBackups();
      this._persistIndex();

      this.lastBackupAt = createdAt;
      this.lastError = null;

      this._emit("backup-created", {
        backup: this._publicBackup(backup),
      });

      return this._publicBackup(backup);
    } catch (error) {
      this.lastError = this._serializeError(error);

      this._emit("backup-failed", {
        error: this.lastError,
      });

      throw error;
    } finally {
      this.running = false;
    }
  }

  _publicBackup(backup) {
    return {
      id: backup.id,
      namespace: backup.namespace,
      createdAt: backup.createdAt,
      version: backup.version,
      metadata: { ...backup.metadata },
      sizeBytes: this._estimateSize(backup.snapshot),
    };
  }

  _estimateSize(value) {
    try {
      return new TextEncoder().encode(
        JSON.stringify(value)
      ).length;
    } catch {
      return 0;
    }
  }

  _pruneBackups() {
    const cutoff =
      Date.now() -
      Math.max(1, this.options.retainDays) *
        24 *
        60 *
        60 *
        1000;

    this.backups = this.backups.filter((backup) => {
      const timestamp = Date.parse(backup.createdAt);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });

    this.backups = this.backups.slice(
      0,
      Math.max(1, this.options.maxBackups)
    );
  }

  listBackups() {
    return this.backups.map((backup) =>
      this._publicBackup(backup)
    );
  }

  getBackup(id) {
    const backup = this.backups.find(
      (item) => item.id === id
    );

    if (!backup) return null;

    return {
      ...this._publicBackup(backup),
      snapshot: backup.snapshot,
    };
  }

  async restoreBackup(id, options = {}) {
    if (this.disposed) {
      throw new Error("Backup service has been disposed.");
    }

    const backup = this.backups.find(
      (item) => item.id === id
    );

    if (!backup) {
      throw new Error(`Backup not found: ${id}`);
    }

    if (typeof options.restore !== "function") {
      throw new Error(
        "A restore callback is required to restore a backup."
      );
    }

    const result = await options.restore(
      backup.snapshot,
      {
        backupId: backup.id,
        createdAt: backup.createdAt,
        metadata: { ...backup.metadata },
      }
    );

    this._emit("backup-restored", {
      backup: this._publicBackup(backup),
    });

    return {
      success: true,
      backup: this._publicBackup(backup),
      result,
    };
  }

  deleteBackup(id) {
    const index = this.backups.findIndex(
      (backup) => backup.id === id
    );

    if (index === -1) return false;

    const [removed] = this.backups.splice(index, 1);

    this._persistIndex();

    this._emit("backup-deleted", {
      backupId: removed.id,
    });

    return true;
  }

  clearBackups() {
    const count = this.backups.length;

    this.backups = [];
    this._persistIndex();

    this._emit("backups-cleared", { count });

    return count;
  }

  start() {
    if (this.disposed || this.timer) return false;

    const interval = Math.max(
      5_000,
      Number(this.options.intervalMs) || 60_000
    );

    this.timer = setInterval(() => {
      this.createBackup({ source: "scheduled" }).catch(
        () => {
          // Failure is recorded and emitted by createBackup.
        }
      );
    }, interval);

    return true;
  }

  stop() {
    if (!this.timer) return false;

    clearInterval(this.timer);
    this.timer = null;

    return true;
  }

  getStatus() {
    return {
      running: this.running,
      scheduled: Boolean(this.timer),
      disposed: this.disposed,
      backupCount: this.backups.length,
      lastBackupAt: this.lastBackupAt,
      lastError: this.lastError,
      namespace: this.options.namespace,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.stop();
    this._persistIndex();
    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackup;