import RecoveryHealthDashboardBackup from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackup.js";

const DEFAULT_OPTIONS = {
  intervalMs: 5 * 60 * 1000,
  initialDelayMs: 10_000,
  retryDelayMs: 30_000,
  maxRetries: 3,
  enabled: true,
};

export class RecoveryHealthDashboardBackupScheduler {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.backupService =
      options.backupService ||
      new RecoveryHealthDashboardBackup({
        ...options.backupOptions,
        autoBackup: false,
      });

    this.timer = null;
    this.initialTimer = null;
    this.running = false;
    this.disposed = false;
    this.retryCount = 0;
    this.lastRunAt = null;
    this.nextRunAt = null;
    this.lastResult = null;
    this.lastError = null;
    this.listeners = new Set();

    this._visibilityHandler = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        this.options.runWhenVisible
      ) {
        this.runNow("visibility-restored").catch(() => {});
      }
    };

    if (this.options.enabled) {
      this.start();
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
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
        // Listener failures must not interrupt scheduling.
      }
    }
  }

  _clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);

    this.timer = null;
    this.initialTimer = null;
    this.nextRunAt = null;
  }

  start() {
    if (this.disposed || this.timer || this.initialTimer) {
      return false;
    }

    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this._visibilityHandler
      );
    }

    const delay = Math.max(
      0,
      Number(this.options.initialDelayMs) || 0
    );

    this.nextRunAt = new Date(Date.now() + delay).toISOString();

    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;

      this.runNow("scheduled-initial").catch(() => {});
    }, delay);

    this._emit("scheduler-started", {
      nextRunAt: this.nextRunAt,
    });

    return true;
  }

  stop() {
    const wasActive = Boolean(
      this.timer || this.initialTimer
    );

    this._clearTimers();

    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this._visibilityHandler
      );
    }

    this._emit("scheduler-stopped");

    return wasActive;
  }

  _scheduleNext(delay = this.options.intervalMs) {
    if (this.disposed || !this.options.enabled) return;

    if (this.timer) clearTimeout(this.timer);

    const safeDelay = Math.max(1_000, Number(delay) || 1_000);

    this.nextRunAt = new Date(
      Date.now() + safeDelay
    ).toISOString();

    this.timer = setTimeout(() => {
      this.timer = null;

      this.runNow("scheduled").catch(() => {});
    }, safeDelay);

    this._emit("next-run-scheduled", {
      nextRunAt: this.nextRunAt,
      delayMs: safeDelay,
    });
  }

  async runNow(source = "manual") {
    if (this.disposed) {
      throw new Error("Backup scheduler has been disposed.");
    }

    if (this.running) {
      return {
        skipped: true,
        reason: "backup-run-in-progress",
      };
    }

    this.running = true;
    this.lastRunAt = new Date().toISOString();

    this._emit("backup-run-started", { source });

    try {
      const result = await this.backupService.createBackup({
        source,
        scheduledAt: this.lastRunAt,
      });

      this.retryCount = 0;
      this.lastError = null;
      this.lastResult = {
        success: true,
        backupId: result.id,
        completedAt: new Date().toISOString(),
      };

      this._emit("backup-run-completed", {
        result: this.lastResult,
      });

      this._scheduleNext(this.options.intervalMs);

      return this.lastResult;
    } catch (error) {
      this.retryCount += 1;

      this.lastError = {
        message: error?.message || String(error),
        timestamp: new Date().toISOString(),
        retryCount: this.retryCount,
      };

      this.lastResult = {
        success: false,
        error: this.lastError,
      };

      this._emit("backup-run-failed", {
        error: this.lastError,
      });

      if (this.retryCount <= this.options.maxRetries) {
        const retryDelay =
          this.options.retryDelayMs *
          Math.pow(2, this.retryCount - 1);

        this._scheduleNext(retryDelay);
      } else {
        this.retryCount = 0;
        this._scheduleNext(this.options.intervalMs);
      }

      throw error;
    } finally {
      this.running = false;
    }
  }

  getStatus() {
    return {
      enabled: this.options.enabled,
      running: this.running,
      scheduled: Boolean(this.timer || this.initialTimer),
      disposed: this.disposed,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      retryCount: this.retryCount,
      lastResult: this.lastResult,
      lastError: this.lastError,
      backupStatus:
        typeof this.backupService.getStatus === "function"
          ? this.backupService.getStatus()
          : null,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.stop();

    if (
      this.options.disposeBackupService !== false &&
      typeof this.backupService.dispose === "function"
    ) {
      this.backupService.dispose();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupScheduler;