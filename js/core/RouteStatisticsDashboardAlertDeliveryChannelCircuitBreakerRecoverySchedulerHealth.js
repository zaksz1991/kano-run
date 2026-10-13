import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  staleAfterMs: 120000,
  failureWarningThreshold: 3,
  failureCriticalThreshold: 10,
  pendingRetryWarningThreshold: 5,
  historyLimit: 200,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerHealth {
  constructor({
    registry,
    monitor = null,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!registry) {
      throw new TypeError("A recovery scheduler registry is required.");
    }

    this.registry = registry;
    this.monitor = monitor;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.disposed = false;
    this.lastReport = null;
    this.history = [];
  }

  async check() {
    this.assertActive();

    const checkedAt = this.clock();
    const entries = this.registry.getStatuses();
    const schedulerReports = entries.map((entry) =>
      this.evaluateScheduler(entry, checkedAt),
    );

    const counts = {
      total: schedulerReports.length,
      running: 0,
      stopped: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      stalled: 0,
      pendingRetries: 0,
      failures: 0,
    };

    const issues = [];

    for (const report of schedulerReports) {
      if (report.running) counts.running += 1;
      else counts.stopped += 1;

      if (report.status === "healthy") counts.healthy += 1;
      if (report.status === "degraded") counts.degraded += 1;
      if (report.status === "unhealthy") counts.unhealthy += 1;
      if (report.stalled) counts.stalled += 1;

      counts.pendingRetries += report.pendingRetries;
      counts.failures += report.failureCount;

      for (const issue of report.issues) {
        issues.push({
          schedulerId: report.id,
          ...issue,
        });
      }
    }

    const overallStatus = this.determineOverallStatus(counts);

    const report = {
      checkedAt,
      status: overallStatus,
      healthy: overallStatus === "healthy",
      counts,
      issues,
      schedulers: schedulerReports,
      monitor: this.getMonitorSummary(),
    };

    this.lastReport = report;
    this.addHistory(report);

    this.emit("checked", report);

    return report;
  }

  evaluateScheduler(entry, checkedAt) {
    const id = String(entry.id);
    const status = entry.status ?? {};
    const issues = [];

    const running = status.running === true;
    const disposed = status.disposed === true;
    const runCount = this.toNonNegativeNumber(status.runCount);
    const failureCount = this.toNonNegativeNumber(status.failureCount);
    const pendingRetries = Array.isArray(status.pendingRetries)
      ? status.pendingRetries.length
      : 0;

    const lastRunAt = this.normalizeTimestamp(status.lastRunAt);
    const nextRunAt = this.normalizeTimestamp(status.nextRunAt);
    const lastResult = status.lastResult ?? null;

    const stale =
      running &&
      lastRunAt !== null &&
      checkedAt - lastRunAt > this.config.staleAfterMs &&
      nextRunAt !== null &&
      nextRunAt < checkedAt;

    if (disposed) {
      issues.push({
        code: "SCHEDULER_DISPOSED",
        severity: "critical",
        message: "Scheduler has been disposed but remains registered.",
      });
    }

    if (!running && !disposed) {
      issues.push({
        code: "SCHEDULER_STOPPED",
        severity: "info",
        message: "Scheduler is not running.",
      });
    }

    if (stale) {
      issues.push({
        code: "SCHEDULER_STALE",
        severity: "critical",
        message: "Scheduler appears stalled.",
        lastRunAt,
        nextRunAt,
      });
    }

    if (failureCount >= this.config.failureCriticalThreshold) {
      issues.push({
        code: "FAILURE_THRESHOLD_CRITICAL",
        severity: "critical",
        message: "Scheduler failure count has reached the critical threshold.",
        failureCount,
        threshold: this.config.failureCriticalThreshold,
      });
    } else if (failureCount >= this.config.failureWarningThreshold) {
      issues.push({
        code: "FAILURE_THRESHOLD_WARNING",
        severity: "warning",
        message: "Scheduler has accumulated repeated failures.",
        failureCount,
        threshold: this.config.failureWarningThreshold,
      });
    }

    if (pendingRetries >= this.config.pendingRetryWarningThreshold) {
      issues.push({
        code: "PENDING_RETRIES_HIGH",
        severity: "warning",
        message: "Scheduler has many pending recovery retries.",
        pendingRetries,
        threshold: this.config.pendingRetryWarningThreshold,
      });
    }

    if (lastResult?.error) {
      issues.push({
        code: "LAST_RUN_ERROR",
        severity: "warning",
        message: "The last recovery cycle reported an error.",
        error: lastResult.error,
      });
    }

    const statusName = this.determineSchedulerStatus({
      running,
      disposed,
      stale,
      failureCount,
      pendingRetries,
      issues,
    });

    return {
      id,
      status: statusName,
      running,
      disposed,
      stale,
      runCount,
      failureCount,
      pendingRetries,
      lastRunAt,
      nextRunAt,
      lastResult,
      issues,
    };
  }

  determineSchedulerStatus({
    running,
    disposed,
    stale,
    failureCount,
    pendingRetries,
    issues,
  }) {
    if (disposed || stale) {
      return "unhealthy";
    }

    if (!running) {
      return "degraded";
    }

    if (
      failureCount >= this.config.failureCriticalThreshold ||
      issues.some((issue) => issue.severity === "critical")
    ) {
      return "unhealthy";
    }

    if (
      failureCount >= this.config.failureWarningThreshold ||
      pendingRetries >= this.config.pendingRetryWarningThreshold ||
      issues.some((issue) => issue.severity === "warning")
    ) {
      return "degraded";
    }

    return "healthy";
  }

  determineOverallStatus(counts) {
    if (counts.unhealthy > 0 || counts.stalled > 0) {
      return "unhealthy";
    }

    if (counts.degraded > 0 || counts.stopped > 0) {
      return "degraded";
    }

    return "healthy";
  }

  getMonitorSummary() {
    if (!this.monitor) {
      return null;
    }

    try {
      const snapshot = this.monitor.getSnapshot?.();

      return snapshot
        ? {
            running: snapshot.running === true,
            checkCount: snapshot.checkCount ?? 0,
            lastCheckAt: snapshot.lastCheckAt ?? null,
            alertCount: Array.isArray(snapshot.alerts)
              ? snapshot.alerts.length
              : 0,
          }
        : null;
    } catch (error) {
      this.log("warn", "Unable to read monitor summary.", {
        error: this.serializeError(error),
      });

      return {
        available: false,
        error: this.serializeError(error),
      };
    }
  }

  getLastReport() {
    return this.lastReport;
  }

  getHistory({ limit = 50 } = {}) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) {
      return [];
    }

    return this.history.slice(-count);
  }

  getHealth() {
    if (!this.lastReport) {
      return {
        status: "unknown",
        healthy: false,
        checkedAt: null,
        reason: "Health check has not run.",
      };
    }

    return {
      status: this.lastReport.status,
      healthy: this.lastReport.healthy,
      checkedAt: this.lastReport.checkedAt,
      counts: { ...this.lastReport.counts },
      issueCount: this.lastReport.issues.length,
    };
  }

  addHistory(report) {
    this.history.push({
      checkedAt: report.checkedAt,
      status: report.status,
      counts: { ...report.counts },
      issueCount: report.issues.length,
    });

    const overflow = this.history.length - this.config.historyLimit;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }
  }

  normalizeTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  toNonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, number)
      : 0;
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        "route-statistics:alert-delivery:circuit-recovery-scheduler-health:" + event,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit health event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Logging failures must not interrupt health checks.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerHealth has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.history.length = 0;
    this.lastReport = null;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerHealth;