import RecoveryHealthDashboardBackupSchedulerPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerPersistence.js";

const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  retryDelayMs: 1000,
  exponentialBackoff: true,
  restoreBeforeRecovery: false,
};

export class RecoveryHealthDashboardBackupSchedulerRecovery {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.persistence =
      options.persistence ||
      new RecoveryHealthDashboardBackupSchedulerPersistence(
        options.persistenceOptions || {}
      );

    this.listeners = new Set();
    this.recoveryHistory = [];
    this.running = false;
    this.disposed = false;
    this.lastRecovery = null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Recovery listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
        // Listener failures must not interrupt recovery.
      }
    }
  }

  _record(status, detail = {}) {
    const entry = {
      id: `recovery-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      status,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    this.recoveryHistory.push(entry);

    const limit = Math.max(
      1,
      Number(this.options.historyLimit) || 100
    );

    if (this.recoveryHistory.length > limit) {
      this.recoveryHistory.splice(
        0,
        this.recoveryHistory.length - limit
      );
    }

    this.lastRecovery = entry;
    this._emit("recovery-recorded", { recovery: entry });

    return entry;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async recover(options = {}) {
    if (this.disposed) {
      throw new Error("Recovery service has been disposed.");
    }

    if (this.running) {
      return {
        success: false,
        skipped: true,
        reason: "recovery-already-running",
      };
    }

    if (typeof options.execute !== "function") {
      throw new TypeError(
        "Recovery requires an execute callback."
      );
    }

    this.running = true;

    const startedAt = Date.now();
    const attempts = [];
    const maxAttempts = Math.max(
      1,
      Number(options.maxAttempts ?? this.options.maxAttempts) || 1
    );

    this._emit("recovery-started", {
      maxAttempts,
      reason: options.reason || "unspecified",
    });

    try {
      let snapshot = null;

      if (
        options.restoreSnapshot ??
        this.options.restoreBeforeRecovery
      ) {
        const restored = this.persistence.restore();

        if (restored.restored) {
          snapshot = restored.snapshot;
        }
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const attemptStartedAt = Date.now();

        try {
          const result = await options.execute({
            attempt,
            snapshot,
            reason: options.reason || "unspecified",
          });

          const attemptRecord = {
            attempt,
            success: true,
            durationMs: Date.now() - attemptStartedAt,
          };

          attempts.push(attemptRecord);

          const recovery = this._record("completed", {
            reason: options.reason || "unspecified",
            attempts,
            durationMs: Date.now() - startedAt,
            result,
          });

          this._emit("recovery-completed", {
            recovery,
            result,
          });

          return {
            success: true,
            recovery,
            result,
          };
        } catch (error) {
          attempts.push({
            attempt,
            success: false,
            durationMs: Date.now() - attemptStartedAt,
            error: error?.message || String(error),
          });

          this._emit("recovery-attempt-failed", {
            attempt,
            maxAttempts,
            error: error?.message || String(error),
          });

          if (attempt < maxAttempts) {
            const baseDelay = Math.max(
              0,
              Number(
                options.retryDelayMs ??
                  this.options.retryDelayMs
              ) || 0
            );

            const delay =
              (options.exponentialBackoff ??
              this.options.exponentialBackoff)
                ? baseDelay * 2 ** (attempt - 1)
                : baseDelay;

            if (delay > 0) {
              await this._delay(delay);
            }
          }
        }
      }

      const recovery = this._record("failed", {
        reason: options.reason || "unspecified",
        attempts,
        durationMs: Date.now() - startedAt,
      });

      this._emit("recovery-failed", { recovery });

      return {
        success: false,
        recovery,
        attempts,
      };
    } finally {
      this.running = false;
    }
  }

  getHistory(options = {}) {
    let history = [...this.recoveryHistory];

    if (options.status) {
      history = history.filter(
        (entry) => entry.status === options.status
      );
    }

    const limit = Math.max(
      1,
      Number(options.limit) || history.length || 1
    );

    return history.slice(-limit);
  }

  getStatus() {
    const completed = this.recoveryHistory.filter(
      (entry) => entry.status === "completed"
    ).length;

    const failed = this.recoveryHistory.filter(
      (entry) => entry.status === "failed"
    ).length;

    return {
      running: this.running,
      disposed: this.disposed,
      totalRecoveries: this.recoveryHistory.length,
      completed,
      failed,
      lastRecovery: this.lastRecovery,
    };
  }

  dispose() {
    if (this.disposed) return;

    if (this.options.disposePersistence !== false) {
      this.persistence.dispose?.();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecovery;