const DEFAULT_OPTIONS = {
  storageKey: "kano-run-recovery-backups",
  maxBackups: 20,
  autoBackup: true,
  backupIntervalMs: 60000,
};

export class RecoveryQueueRecoveryOrchestratorBackup {
  constructor(storage, options = {}) {
    if (!storage) {
      throw new TypeError("A recovery storage instance is required.");
    }

    this.storage = storage;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.backups = [];
    this.listeners = new Set();
    this.timer = null;
    this.disposed = false;
    this.sequence = 0;

    this.loadBackups();

    if (this.options.autoBackup) {
      this.startAutoBackup();
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      details,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryBackup] Listener error:", error);
      }
    }
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  loadBackups() {
    try {
      const existing = this.storage.getMetadata(
        this.options.storageKey,
        []
      );

      this.backups = Array.isArray(existing)
        ? existing.slice(-this.options.maxBackups)
        : [];
    } catch (error) {
      this.backups = [];

      this.emit("backup_load_failed", {
        message: error?.message || String(error),
      });
    }
  }

  persistBackups() {
    this.storage.setMetadata(
      this.options.storageKey,
      this.backups
    );
  }

  createBackup(metadata = {}) {
    this.assertAvailable();

    const state = this.storage.getState();
    const now = Date.now();

    const backup = {
      id: `backup-${now}-${++this.sequence}`,
      version: 1,
      createdAt: now,
      label:
        typeof metadata.label === "string"
          ? metadata.label.slice(0, 120)
          : "Recovery backup",
      reason:
        typeof metadata.reason === "string"
          ? metadata.reason.slice(0, 120)
          : "manual",
      checksum: this.checksum(state),
      state: this.clone(state),
      metadata: this.clone(metadata),
    };

    this.backups.push(backup);

    if (this.backups.length > this.options.maxBackups) {
      this.backups.splice(
        0,
        this.backups.length - this.options.maxBackups
      );
    }

    this.persistBackups();

    this.emit("backup_created", {
      id: backup.id,
      reason: backup.reason,
      createdAt: backup.createdAt,
    });

    return this.sanitizeBackup(backup);
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

  verifyBackup(backup) {
    if (
      !backup ||
      backup.version !== 1 ||
      !backup.state ||
      typeof backup.state !== "object"
    ) {
      return {
        valid: false,
        reason: "invalid_backup_structure",
      };
    }

    const actualChecksum = this.checksum(backup.state);

    if (actualChecksum !== backup.checksum) {
      return {
        valid: false,
        reason: "checksum_mismatch",
      };
    }

    return {
      valid: true,
      reason: null,
    };
  }

  restoreBackup(backupId, options = {}) {
    this.assertAvailable();

    const backup = this.backups.find(
      (item) => item.id === backupId
    );

    if (!backup) {
      throw new Error(`Backup "${backupId}" was not found.`);
    }

    const verification = this.verifyBackup(backup);

    if (!verification.valid) {
      this.emit("backup_verification_failed", {
        backupId,
        reason: verification.reason,
      });

      throw new Error(
        `Backup verification failed: ${verification.reason}`
      );
    }

    const previousState = this.storage.getState();

    if (options.createSafetyBackup !== false) {
      this.createBackup({
        label: "Before restore",
        reason: "pre_restore_safety",
        sourceBackupId: backupId,
      });
    }

    try {
      const restored = this.storage.save(
        this.clone(backup.state)
      );

      this.emit("backup_restored", {
        backupId,
        revision: restored.revision,
      });

      return {
        success: true,
        backupId,
        restoredAt: Date.now(),
        revision: restored.revision,
      };
    } catch (error) {
      try {
        this.storage.save(previousState);
      } catch (rollbackError) {
        this.emit("rollback_failed", {
          message:
            rollbackError?.message || String(rollbackError),
        });
      }

      this.emit("backup_restore_failed", {
        backupId,
        message: error?.message || String(error),
      });

      throw error;
    }
  }

  deleteBackup(backupId) {
    this.assertAvailable();

    const index = this.backups.findIndex(
      (backup) => backup.id === backupId
    );

    if (index === -1) return false;

    this.backups.splice(index, 1);
    this.persistBackups();

    this.emit("backup_deleted", { backupId });

    return true;
  }

  clearBackups() {
    this.assertAvailable();

    const removed = this.backups.length;
    this.backups = [];
    this.persistBackups();

    this.emit("backups_cleared", { removed });

    return removed;
  }

  getBackups() {
    return this.backups
      .map((backup) => this.sanitizeBackup(backup))
      .reverse();
  }

  getBackup(backupId) {
    const backup = this.backups.find(
      (item) => item.id === backupId
    );

    return backup ? this.sanitizeBackup(backup) : null;
  }

  sanitizeBackup(backup) {
    return {
      id: backup.id,
      version: backup.version,
      createdAt: backup.createdAt,
      label: backup.label,
      reason: backup.reason,
      checksum: backup.checksum,
      metadata: this.clone(backup.metadata || {}),
      taskCounts: {
        queued: backup.state?.tasks?.length || 0,
        completed: backup.state?.completed?.length || 0,
        failed: backup.state?.failed?.length || 0,
      },
    };
  }

  exportBackup(backupId) {
    const backup = this.backups.find(
      (item) => item.id === backupId
    );

    if (!backup) {
      throw new Error(`Backup "${backupId}" was not found.`);
    }

    const verification = this.verifyBackup(backup);

    if (!verification.valid) {
      throw new Error(
        `Cannot export invalid backup: ${verification.reason}`
      );
    }

    return JSON.stringify(
      {
        format: "kano-run-recovery-backup",
        version: 1,
        exportedAt: Date.now(),
        backup: this.clone(backup),
      },
      null,
      2
    );
  }

  importBackup(input) {
    this.assertAvailable();

    let parsed = input;

    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input);
      } catch {
        throw new Error("Imported backup is not valid JSON.");
      }
    }

    const backup = parsed?.backup;

    if (
      parsed?.format !== "kano-run-recovery-backup" ||
      !backup
    ) {
      throw new Error("Unsupported recovery backup format.");
    }

    const verification = this.verifyBackup(backup);

    if (!verification.valid) {
      throw new Error(
        `Imported backup is invalid: ${verification.reason}`
      );
    }

    const imported = {
      ...this.clone(backup),
      id: `backup-${Date.now()}-${++this.sequence}`,
      createdAt: Date.now(),
      reason: "imported",
    };

    this.backups.push(imported);

    if (this.backups.length > this.options.maxBackups) {
      this.backups.splice(
        0,
        this.backups.length - this.options.maxBackups
      );
    }

    this.persistBackups();

    this.emit("backup_imported", {
      backupId: imported.id,
    });

    return this.sanitizeBackup(imported);
  }

  startAutoBackup() {
    this.assertAvailable();

    if (this.timer) return;

    this.timer = setInterval(() => {
      try {
        this.createBackup({
          label: "Automatic backup",
          reason: "scheduled",
        });
      } catch (error) {
        this.emit("automatic_backup_failed", {
          message: error?.message || String(error),
        });
      }
    }, Math.max(10000, this.options.backupIntervalMs));
  }

  stopAutoBackup() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }

  assertAvailable() {
    if (this.disposed) {
      throw new Error("Recovery backup manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.stopAutoBackup();
    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorBackup;