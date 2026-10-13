import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator.js";

const DEFAULT_MONITOR_INTERVAL_MS = 15_000;
const DEFAULT_HISTORY_LIMIT = 200;

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor {
  constructor(options = {}) {
    this.orchestrator =
      options.orchestrator ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator(options);

    this.intervalMs = Math.max(
      1_000,
      Number(options.intervalMs) || DEFAULT_MONITOR_INTERVAL_MS
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
    this.lastSnapshot = null;
    this.lastCheckAt = null;
    this.consecutiveUnhealthyChecks = 0;
    this.checkInProgress = false;
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
    if (this.checkInProgress) {
      return {
        skipped: true,
        reason: "check_in_progress",
      };
    }

    this.checkInProgress = true;
    this.lastCheckAt = this.clock();

    try {
      const snapshot = this.orchestrator.getStatus();
      const healthy =
        !snapshot.destroyed &&
        Number(snapshot.activeCount) <= Number(snapshot.concurrency) &&
        Number(snapshot.queuedCount) >= 0;

      if (healthy) {
        this.consecutiveUnhealthyChecks = 0;
      } else {
        this.consecutiveUnhealthyChecks += 1;
      }

      this.lastSnapshot = {
        ...snapshot,
        healthy,
        checkedAt: this.lastCheckAt,
      };

      this.record("health_check_completed", this.lastSnapshot);

      return this.lastSnapshot;
    } catch (error) {
      this.consecutiveUnhealthyChecks += 1;

      const result = {
        healthy: false,
        checkedAt: this.lastCheckAt,
        error: this.serializeError(error),
        consecutiveUnhealthyChecks: this.consecutiveUnhealthyChecks,
      };

      this.lastSnapshot = result;
      this.record("health_check_failed", result);

      return result;
    } finally {
      this.checkInProgress = false;
    }
  }

  async processQueue() {
    this.record("queue_processing_requested", {});

    try {
      const result = await this.orchestrator.process();

      this.record("queue_processing_completed", {
        status: result,
      });

      return result;
    } catch (error) {
      const details = this.serializeError(error);
      this.record("queue_processing_failed", { error: details });

      return {
        success: false,
        error: details,
      };
    }
  }

  getStatus() {
    return {
      started: this.started,
      checkInProgress: this.checkInProgress,
      intervalMs: this.intervalMs,
      lastCheckAt: this.lastCheckAt,
      consecutiveUnhealthyChecks: this.consecutiveUnhealthyChecks,
      orchestrator: this.orchestrator.getStatus(),
      lastSnapshot: this.lastSnapshot,
      historyCount: this.history.length,
    };
  }

  getHistory(limit = this.historyLimit) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit)
    );

    return this.history.slice(-safeLimit).map((entry) => ({ ...entry }));
  }

  record(type, details = {}) {
    const event = {
      type,
      timestamp: this.clock(),
      details: this.sanitize(details),
    };

    this.history.push(event);

    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    try {
      this.onEvent(event);
    } catch {
      // Monitoring callbacks must not interrupt queue processing.
    }

    return event;
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

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  destroy() {
    this.stop();
    this.history = [];
    this.lastSnapshot = null;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor;
