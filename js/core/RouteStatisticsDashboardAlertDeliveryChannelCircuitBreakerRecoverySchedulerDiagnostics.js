import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  slowCheckMs: 1000,
  staleAfterMs: 120000,
  maxFailureCount: 10,
  maxHistory: 200,
  includeSchedulerDetails: true,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerDiagnostics {
  constructor({
    registry,
    monitor = null,
    health = null,
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
    this.health = health;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.disposed = false;
    this.lastReport = null;
    this.history = [];
    this.runningChecks = new Set();
  }

  async run({ includeDetails = this.config.includeSchedulerDetails } = {}) {
    this.assertActive();

    const startedAt = this.clock();
    const diagnosticId = `scheduler-diagnostics-${startedAt}`;

    if (this.runningChecks.has(diagnosticId)) {
      return {
        diagnosticId,
        status: "skipped",
        reason: "Diagnostic run already exists for this timestamp.",
      };
    }

    this.runningChecks.add(diagnosticId);

    const report = {
      diagnosticId,
      startedAt,
      finishedAt: null,
      durationMs: 0,
      status: "healthy",
      checks: [],
      issues: [],
      schedulerCount: 0,
      summary: null,
      schedulerDetails: [],
    };

    try {
      await this.checkRegistry(report);

      if (includeDetails) {
        await this.checkSchedulers(report);
      }

      await this.checkMonitor(report);
      await this.checkHealth(report);

      report.finishedAt = this.clock();
      report.durationMs = Math.max(0, report.finishedAt - startedAt);
      report.status = this.calculateStatus(report.issues);
      report.summary = this.buildSummary(report);

      this.lastReport = report;
      this.addHistory(report);

      this.emit("completed", report);

      return report;
    } catch (error) {
      report.finishedAt = this.clock();
      report.durationMs = Math.max(0, report.finishedAt - startedAt);
      report.status = "unhealthy";

      report.issues.push({
        code: "DIAGNOSTIC_RUN_FAILED",
        severity: "critical",
        message: "The diagnostic run failed.",
        error: this.serializeError(error),
      });

      report.summary = this.buildSummary(report);
      this.lastReport = report;
      this.addHistory(report);

      this.log("error", "Recovery scheduler diagnostics failed.", {
        diagnosticId,
        error: this.serializeError(error),
      });

      this.emit("failed", report);

      return report;
    } finally {
      this.runningChecks.delete(diagnosticId);
    }
  }

  async checkRegistry(report) {
    const check = {
      name: "registry",
      status: "healthy",
      startedAt: this.clock(),
      details: null,
      issues: [],
    };

    try {
      const statuses = this.registry.getStatuses();

      if (!Array.isArray(statuses)) {
        throw new TypeError("Registry getStatuses() must return an array.");
      }

      report.schedulerCount = statuses.length;

      check.details = {
        schedulerCount: statuses.length,
        summary: this.registry.getSummary?.() ?? null,
      };

      if (statuses.length === 0) {
        check.status = "warning";
        check.issues.push({
          code: "NO_SCHEDULERS_REGISTERED",
          severity: "warning",
          message: "No recovery schedulers are registered.",
        });
      }
    } catch (error) {
      check.status = "unhealthy";
      check.issues.push({
        code: "REGISTRY_CHECK_FAILED",
        severity: "critical",
        message: "Unable to inspect the scheduler registry.",
        error: this.serializeError(error),
      });
    }

    check.finishedAt = this.clock();
    this.addCheck(report, check);
  }

  async checkSchedulers(report) {
    let statuses;

    try {
      statuses = this.registry.getStatuses();
    } catch (error) {
      report.issues.push({
        code: "SCHEDULER_DETAILS_UNAVAILABLE",
        severity: "critical",
        message: "Scheduler details could not be retrieved.",
        error: this.serializeError(error),
      });
      return;
    }

    for (const entry of statuses) {
      const status = entry.status ?? {};
      const scheduler = {
        id: String(entry.id),
        running: status.running === true,
        disposed: status.disposed === true,
        runCount: this.toNumber(status.runCount),
        failureCount: this.toNumber(status.failureCount),
        lastRunAt: status.lastRunAt ?? null,
        nextRunAt: status.nextRunAt ?? null,
        pendingRetries: Array.isArray(status.pendingRetries)
          ? status.pendingRetries.length
          : 0,
      };

      const issues = [];

      if (scheduler.disposed) {
        issues.push({
          code: "REGISTERED_SCHEDULER_DISPOSED",
          severity: "critical",
          message: "A disposed scheduler remains registered.",
        });
      }

      if (scheduler.failureCount >= this.config.maxFailureCount) {
        issues.push({
          code: "SCHEDULER_FAILURE_LIMIT",
          severity: "critical",
          message: "Scheduler failures exceed the configured limit.",
          failureCount: scheduler.failureCount,
        });
      }

      const lastRun = this.toTimestamp(scheduler.lastRunAt);
      const nextRun = this.toTimestamp(scheduler.nextRunAt);
      const now = this.clock();

      if (
        scheduler.running &&
        lastRun !== null &&
        now - lastRun > this.config.staleAfterMs &&
        nextRun !== null &&
        nextRun < now
      ) {
        issues.push({
          code: "SCHEDULER_STALE",
          severity: "critical",
          message: "Scheduler appears to be stalled.",
          lastRunAt: scheduler.lastRunAt,
          nextRunAt: scheduler.nextRunAt,
        });
      }

      scheduler.status = this.calculateStatus(issues);
      scheduler.issues = issues;

      report.schedulerDetails.push(scheduler);

      for (const issue of issues) {
        report.issues.push({
          schedulerId: scheduler.id,
          ...issue,
        });
      }
    }
  }

  async checkMonitor(report) {
    const check = {
      name: "monitor",
      status: "healthy",
      startedAt: this.clock(),
      details: null,
      issues: [],
    };

    if (!this.monitor) {
      check.status = "warning";
      check.issues.push({
        code: "MONITOR_NOT_CONFIGURED",
        severity: "warning",
        message: "No scheduler monitor was supplied.",
      });
    } else {
      try {
        const snapshot = this.monitor.getSnapshot?.();

        if (!snapshot) {
          check.status = "warning";
          check.issues.push({
            code: "MONITOR_NO_SNAPSHOT",
            severity: "warning",
            message: "The scheduler monitor has no snapshot.",
          });
        } else {
          check.details = {
            running: snapshot.running === true,
            checkCount: snapshot.checkCount ?? 0,
            lastCheckAt: snapshot.lastCheckAt ?? null,
            alertCount: Array.isArray(snapshot.alerts)
              ? snapshot.alerts.length
              : 0,
          };

          if (snapshot.disposed === true) {
            check.status = "unhealthy";
            check.issues.push({
              code: "MONITOR_DISPOSED",
              severity: "critical",
              message: "The scheduler monitor has been disposed.",
            });
          }
        }
      } catch (error) {
        check.status = "unhealthy";
        check.issues.push({
          code: "MONITOR_CHECK_FAILED",
          severity: "critical",
          message: "The scheduler monitor check failed.",
          error: this.serializeError(error),
        });
      }
    }

    check.finishedAt = this.clock();
    this.addCheck(report, check);
  }

  async checkHealth(report) {
    const check = {
      name: "health",
      status: "healthy",
      startedAt: this.clock(),
      details: null,
      issues: [],
    };

    if (!this.health) {
      check.status = "warning";
      check.issues.push({
        code: "HEALTH_COMPONENT_NOT_CONFIGURED",
        severity: "warning",
        message: "No scheduler health component was supplied.",
      });
    } else {
      try {
        const healthReport = await this.health.check();

        check.details = {
          status: healthReport?.status ?? "unknown",
          healthy: healthReport?.healthy === true,
          issueCount: Array.isArray(healthReport?.issues)
            ? healthReport.issues.length
            : 0,
        };

        if (healthReport?.status === "unhealthy") {
          check.status = "unhealthy";
          check.issues.push({
            code: "HEALTH_CHECK_UNHEALTHY",
            severity: "critical",
            message: "The scheduler health component reports unhealthy status.",
          });
        } else if (
          healthReport?.status === "degraded" ||
          healthReport?.status === "unknown"
        ) {
          check.status = "warning";
          check.issues.push({
            code: "HEALTH_CHECK_DEGRADED",
            severity: "warning",
            message: "The scheduler health component reports degraded or unknown status.",
          });
        }
      } catch (error) {
        check.status = "unhealthy";
        check.issues.push({
          code: "HEALTH_CHECK_FAILED",
          severity: "critical",
          message: "The scheduler health check failed.",
          error: this.serializeError(error),
        });
      }
    }

    check.finishedAt = this.clock();
    this.addCheck(report, check);
  }

  addCheck(report, check) {
    check.durationMs = Math.max(
      0,
      (check.finishedAt ?? this.clock()) - check.startedAt,
    );

    report.checks.push(check);

    for (const issue of check.issues) {
      report.issues.push({
        check: check.name,
        ...issue,
      });
    }
  }

  calculateStatus(issues = []) {
    if (issues.some((issue) => issue.severity === "critical")) {
      return "unhealthy";
    }

    if (issues.some((issue) => issue.severity === "warning")) {
      return "degraded";
    }

    return "healthy";
  }

  buildSummary(report) {
    return {
      status: report.status,
      checks: report.checks.length,
      passedChecks: report.checks.filter(
        (check) => check.status === "healthy",
      ).length,
      warningChecks: report.checks.filter(
        (check) => check.status === "warning",
      ).length,
      failedChecks: report.checks.filter(
        (check) => check.status === "unhealthy",
      ).length,
      totalIssues: report.issues.length,
      criticalIssues: report.issues.filter(
        (issue) => issue.severity === "critical",
      ).length,
      warningIssues: report.issues.filter(
        (issue) => issue.severity === "warning",
      ).length,
      schedulerCount: report.schedulerCount,
      durationMs: report.durationMs,
    };
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

  addHistory(report) {
    this.history.push({
      diagnosticId: report.diagnosticId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      durationMs: report.durationMs,
      status: report.status,
      summary: report.summary,
    });

    const overflow = this.history.length - this.config.maxHistory;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }
  }

  toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  toTimestamp(value) {
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

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-diagnostics:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit diagnostics event.", {
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
      // Diagnostic logging must not interrupt checks.
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
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerDiagnostics has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.runningChecks.clear();
    this.history.length = 0;
    this.lastReport = null;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerDiagnostics;