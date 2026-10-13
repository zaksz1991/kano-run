import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  staleAfterMs: 120_000,
  maxHistory: 100,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealth {
  constructor({
    monitor = null,
    restore = null,
    history = null,
    options = {},
  } = {}) {
    this.monitor = monitor;
    this.restore = restore;
    this.history = history;
    this.options = { ...DEFAULTS, ...options };
    this.events = new EventEmitter();
    this.samples = [];
    this.lastCheckAt = null;
    this.disposed = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  check() {
    if (this.disposed) {
      throw new Error("Restore health checker has been disposed.");
    }

    const checkedAt = Date.now();
    const issues = [];
    const monitorSnapshot = this.safeSnapshot();

    if (!this.monitor) {
      issues.push({
        code: "MONITOR_UNAVAILABLE",
        message: "Restore monitor is not configured.",
      });
    } else if (!monitorSnapshot) {
      issues.push({
        code: "MONITOR_SNAPSHOT_UNAVAILABLE",
        message: "Restore monitor did not provide a valid snapshot.",
      });
    } else {
      const timestamp = Number(
        monitorSnapshot.checkedAt ??
        monitorSnapshot.updatedAt ??
        monitorSnapshot.timestamp
      );

      if (Number.isFinite(timestamp) && timestamp > 0) {
        if (checkedAt - timestamp > this.options.staleAfterMs) {
          issues.push({
            code: "MONITOR_STALE",
            message: "Restore monitor data is stale.",
          });
        }
      }

      const status = String(
        monitorSnapshot.status ??
        monitorSnapshot.health ??
        ""
      ).toLowerCase();

      if (["unhealthy", "critical", "failed", "error"].includes(status)) {
        issues.push({
          code: "MONITOR_UNHEALTHY",
          message: `Restore monitor reports ${status}.`,
        });
      }
    }

    if (!this.restore) {
      issues.push({
        code: "RESTORE_SERVICE_UNAVAILABLE",
        message: "Restore service is not configured.",
      });
    }

    if (this.history && typeof this.history.getSnapshot === "function") {
      try {
        const snapshot = this.history.getSnapshot();

        if (snapshot && snapshot.error) {
          issues.push({
            code: "RESTORE_HISTORY_ERROR",
            message: "Restore history reports an error.",
          });
        }
      } catch (error) {
        issues.push({
          code: "RESTORE_HISTORY_READ_FAILED",
          message: error instanceof Error
            ? error.message
            : String(error),
        });
      }
    }

    const status = issues.length === 0
      ? "healthy"
      : issues.some((issue) =>
          issue.code === "RESTORE_SERVICE_UNAVAILABLE" ||
          issue.code === "MONITOR_UNHEALTHY"
        )
        ? "unhealthy"
        : "degraded";

    const result = {
      status,
      healthy: status === "healthy",
      checkedAt: new Date(checkedAt).toISOString(),
      issueCount: issues.length,
      issues,
      monitorAvailable: Boolean(this.monitor),
      restoreAvailable: Boolean(this.restore),
    };

    this.lastCheckAt = checkedAt;
    this.samples.push(result);

    if (this.samples.length > this.options.maxHistory) {
      this.samples.splice(
        0,
        this.samples.length - this.options.maxHistory
      );
    }

    this.events.emit("health:checked", result);

    if (!result.healthy) {
      this.events.emit("health:issue", result);
    }

    return result;
  }

  safeSnapshot() {
    if (!this.monitor) return null;

    try {
      if (typeof this.monitor.getSnapshot === "function") {
        return this.monitor.getSnapshot();
      }

      if (typeof this.monitor.getHealth === "function") {
        return this.monitor.getHealth();
      }

      return null;
    } catch {
      return null;
    }
  }

  getStatus() {
    return this.samples.length
      ? this.samples[this.samples.length - 1]
      : null;
  }

  getHistory(limit = 20) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    return this.samples.slice(-count).map((sample) => ({
      ...sample,
      issues: sample.issues.map((issue) => ({ ...issue })),
    }));
  }

  getSummary() {
    const total = this.samples.length;
    const healthy = this.samples.filter(
      (sample) => sample.status === "healthy"
    ).length;
    const degraded = this.samples.filter(
      (sample) => sample.status === "degraded"
    ).length;
    const unhealthy = this.samples.filter(
      (sample) => sample.status === "unhealthy"
    ).length;

    return {
      totalChecks: total,
      healthy,
      degraded,
      unhealthy,
      healthRate: total ? healthy / total : null,
      lastCheckAt: this.lastCheckAt
        ? new Date(this.lastCheckAt).toISOString()
        : null,
      currentStatus: this.getStatus()?.status ?? "unknown",
    };
  }

  reset() {
    this.samples = [];
    this.lastCheckAt = null;
    this.events.emit("health:reset", { timestamp: Date.now() });
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.emit("health:disposed", {
      timestamp: Date.now(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealth;