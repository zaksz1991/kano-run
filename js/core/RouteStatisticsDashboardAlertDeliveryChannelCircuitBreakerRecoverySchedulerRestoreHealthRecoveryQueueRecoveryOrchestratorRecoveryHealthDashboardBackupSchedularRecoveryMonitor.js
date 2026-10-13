import RecoveryHealthDashboardBackupSchedulerRecovery from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecovery.js";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_STALE_AFTER_MS = 120_000;

export class RecoveryHealthDashboardBackupSchedulerRecoveryMonitor {
  constructor(options = {}) {
    this.recovery =
      options.recovery ??
      new RecoveryHealthDashboardBackupSchedulerRecovery(options);

    this.intervalMs = Math.max(
      1_000,
      Number(options.intervalMs) || DEFAULT_INTERVAL_MS
    );

    this.staleAfterMs = Math.max(
      this.intervalMs,
      Number(options.staleAfterMs) || DEFAULT_STALE_AFTER_MS
    );

    this.historyLimit = Math.max(
      10,
      Number(options.historyLimit) || DEFAULT_HISTORY_LIMIT
    );

    this.clock = options.clock ?? (() => Date.now());
    this.onEvent = options.onEvent ?? (() => {});

    this.history = [];
    this.started = false;
    this.timer = null;
    this.lastCheckAt = null;
    this.lastRecoveryAt = null;
    this.lastError = null;
    this.consecutiveFailures = 0;
    this.checking = false;
  }

  start(options = {}) {
    if (this.started) {
      return this.getStatus();
    }

    this.started = true;

    if (options.immediate !== false) {
      void this.check();
    }

    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);

    this.timer.unref?.();

    this.record("monitor_started", {
      intervalMs: this.intervalMs,
      staleAfterMs: this.staleAfterMs,
    });

    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;

    this.record("monitor_stopped", {});

    return this.getStatus();
  }

  async check() {
    if (this.checking) {
      return {
        skipped: true,
        reason: "check_in_progress",
        status: this.getStatus(),
      };
    }

    this.checking = true;
    this.lastCheckAt = this.clock();

    try {
      const recoveryStatus = await this.readRecoveryStatus();
      const stale = this.isStale(recoveryStatus);
      const healthy = !stale && !this.lastError;

      if (stale) {
        this.record("recovery_stale", {
          lastRecoveryAt: this.lastRecoveryAt,
          staleAfterMs: this.staleAfterMs,
        });
      }

      if (healthy) {
        this.consecutiveFailures = 0;
      }

      const result = {
        checkedAt: this.lastCheckAt,
        healthy,
        stale,
        recovery: recoveryStatus,
      };

      this.record("health_check_completed", result);

      return result;
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError = this.serializeError(error);

      const result = {
        checkedAt: this.lastCheckAt,
        healthy: false,
        stale: true,
        error: this.lastError,
        consecutiveFailures: this.consecutiveFailures,
      };

      this.record("health_check_failed", result);

      return result;
    } finally {
      this.checking = false;
    }
  }

  async runRecovery(reason = "manual") {
    const startedAt = this.clock();

    this.record("recovery_started", { reason, startedAt });

    try {
      const result = await this.invokeRecovery(reason);

      this.lastRecoveryAt = this.clock();
      this.lastError = null;
      this.consecutiveFailures = 0;

      this.record("recovery_completed", {
        reason,
        startedAt,
        completedAt: this.lastRecoveryAt,
        result: this.summarize(result),
      });

      return {
        success: true,
        startedAt,
        completedAt: this.lastRecoveryAt,
        result,
      };
    } catch (error) {
      this.lastError = this.serializeError(error);
      this.consecutiveFailures += 1;

      this.record("recovery_failed", {
        reason,
        startedAt,
        failedAt: this.clock(),
        error: this.lastError,
      });

      return {
        success: false,
        startedAt,
        failedAt: this.clock(),
        error: this.lastError,
      };
    }
  }

  async readRecoveryStatus() {
    if (typeof this.recovery.getStatus === "function") {
      return await this.recovery.getStatus();
    }

    if (typeof this.recovery.getHealth === "function") {
      return await this.recovery.getHealth();
    }

    return {
      available: Boolean(this.recovery),
      lastRecoveryAt: this.lastRecoveryAt,
    };
  }

  async invokeRecovery(reason) {
    if (typeof this.recovery.recover === "function") {
      return await this.recovery.recover({ reason });
    }

    if (typeof this.recovery.run === "function") {
      return await this.recovery.run({ reason });
    }

    throw new Error(
      "Recovery module does not expose a recover() or run() method."
    );
  }

  isStale(status) {
    const timestamp =
      this.lastRecoveryAt ??
      status?.lastRecoveryAt ??
      status?.lastSuccessfulRecoveryAt ??
      null;

    if (!timestamp) {
      return true;
    }

    const time =
      typeof timestamp === "number"
        ? timestamp
        : Date.parse(timestamp);

    if (!Number.isFinite(time)) {
      return true;
    }

    return this.clock() - time > this.staleAfterMs;
  }

  getStatus() {
    const now = this.clock();

    return {
      started: this.started,
      checking: this.checking,
      healthy:
        this.started &&
        !this.checking &&
        !this.lastError &&
        !this.isStale({ lastRecoveryAt: this.lastRecoveryAt }),
      intervalMs: this.intervalMs,
      staleAfterMs: this.staleAfterMs,
      lastCheckAt: this.lastCheckAt,
      lastRecoveryAt: this.lastRecoveryAt,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      historyCount: this.history.length,
      ageSinceRecoveryMs: this.lastRecoveryAt
        ? Math.max(0, now - this.lastRecoveryAt)
        : null,
    };
  }

  getHistory(options = {}) {
    const limit = Math.max(
      1,
      Math.min(
        this.historyLimit,
        Number(options.limit) || this.historyLimit
      )
    );

    return this.history.slice(-limit).map((entry) => ({ ...entry }));
  }

  clearHistory() {
    const cleared = this.history.length;
    this.history = [];

    this.record("history_cleared", { cleared });

    return { cleared };
  }

  record(type, details = {}) {
    const event = {
      type,
      timestamp: this.clock(),
      details: this.summarize(details),
    };

    this.history.push(event);

    if (this.history.length > this.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.historyLimit
      );
    }

    try {
      this.onEvent(event);
    } catch {
      // Observer errors must not interrupt recovery monitoring.
    }

    return event;
  }

  summarize(value) {
    try {
      return JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Error) {
            return this.serializeError(item);
          }

          if (typeof item === "bigint") {
            return item.toString();
          }

          return item;
        })
      );
    } catch {
      return {
        summary: String(value),
      };
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  destroy() {
    this.stop();
    this.history = [];
    this.lastError = null;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryMonitor;