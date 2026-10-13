import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  maxChecks: 100,
  slowCheckMs: 1000,
  staleAfterMs: 120_000,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthDiagnostics {
  constructor({
    health = null,
    monitor = null,
    restore = null,
    history = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.health = health;
    this.monitor = monitor;
    this.restore = restore;
    this.history = history;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.checks = [];
    this.disposed = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  run() {
    if (this.disposed) {
      throw new Error("Restore health diagnostics have been disposed.");
    }

    const startedAt = this.clock();
    const checks = [
      this.checkDependency("health", this.health, ["check"]),
      this.checkDependency("monitor", this.monitor, ["getSnapshot", "poll"]),
      this.checkDependency("restore", this.restore, [
        "restoreArchive",
        "restore",
      ]),
      this.checkDependency("history", this.history, [
        "getSnapshot",
        "getHistory",
      ], true),
    ];

    const healthResult = this.inspectHealth();
    const monitorResult = this.inspectMonitor();

    checks.push(healthResult, monitorResult);

    const durationMs = Math.max(0, this.clock() - startedAt);
    const failures = checks.filter(
      (check) => check.status === "failed"
    );
    const warnings = checks.filter(
      (check) => check.status === "warning"
    );

    if (durationMs > this.options.slowCheckMs) {
      warnings.push({
        name: "diagnostic_duration",
        status: "warning",
        message: `Diagnostics took ${durationMs} ms.`,
      });
    }

    const report = {
      id: `restore-diagnostics-${startedAt}`,
      timestamp: new Date(startedAt).toISOString(),
      durationMs,
      status: failures.length
        ? "unhealthy"
        : warnings.length
          ? "degraded"
          : "healthy",
      checks,
      failures,
      warnings,
      summary: {
        total: checks.length,
        passed: checks.filter((item) => item.status === "passed").length,
        failed: failures.length,
        warnings: warnings.length,
      },
    };

    this.checks.push(report);

    if (this.checks.length > this.options.maxChecks) {
      this.checks.splice(
        0,
        this.checks.length - this.options.maxChecks
      );
    }

    this.events.emit("diagnostics:completed", report);

    if (report.status !== "healthy") {
      this.events.emit("diagnostics:issue", report);
    }

    return report;
  }

  checkDependency(name, dependency, methods, optional = false) {
    if (!dependency) {
      return {
        name: `${name}_dependency`,
        status: optional ? "passed" : "failed",
        message: optional
          ? `${name} dependency is not configured; check skipped.`
          : `${name} dependency is unavailable.`,
      };
    }

    const availableMethods = methods.filter(
      (method) => typeof dependency[method] === "function"
    );

    if (availableMethods.length === 0) {
      return {
        name: `${name}_interface`,
        status: "failed",
        message: `${name} dependency does not expose an expected method.`,
        expectedMethods: methods,
      };
    }

    return {
      name: `${name}_dependency`,
      status: "passed",
      message: `${name} dependency is available.`,
      methods: availableMethods,
    };
  }

  inspectHealth() {
    if (!this.health || typeof this.health.getStatus !== "function") {
      return {
        name: "health_status",
        status: "warning",
        message: "Health checker does not expose getStatus().",
      };
    }

    try {
      const result = this.health.getStatus();

      if (!result) {
        return {
          name: "health_status",
          status: "warning",
          message: "No health check has been recorded yet.",
        };
      }

      const status = String(result.status ?? "unknown").toLowerCase();

      return {
        name: "health_status",
        status: status === "healthy"
          ? "passed"
          : ["unhealthy", "critical", "failed"].includes(status)
            ? "failed"
            : "warning",
        message: `Latest health status: ${status}.`,
        value: status,
      };
    } catch (error) {
      return {
        name: "health_status",
        status: "failed",
        message: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  inspectMonitor() {
    if (!this.monitor || typeof this.monitor.getSnapshot !== "function") {
      return {
        name: "monitor_snapshot",
        status: "warning",
        message: "Monitor snapshot is unavailable.",
      };
    }

    try {
      const snapshot = this.monitor.getSnapshot();

      if (!snapshot || typeof snapshot !== "object") {
        return {
          name: "monitor_snapshot",
          status: "failed",
          message: "Monitor returned an invalid snapshot.",
        };
      }

      const timestamp = Date.parse(
        snapshot.lastSampleAt ?? snapshot.checkedAt ?? ""
      );

      const stale = Number.isFinite(timestamp) &&
        this.clock() - timestamp > this.options.staleAfterMs;

      return {
        name: "monitor_snapshot",
        status: stale ? "warning" : "passed",
        message: stale
          ? "Monitor snapshot is stale."
          : "Monitor snapshot is available.",
        stale,
        sampleCount: Number(snapshot.sampleCount ?? 0),
      };
    } catch (error) {
      return {
        name: "monitor_snapshot",
        status: "failed",
        message: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  getLatest() {
    return this.checks[this.checks.length - 1] ?? null;
  }

  getHistory(limit = 20) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    return this.checks.slice(-count).map((report) => ({
      ...report,
      checks: report.checks.map((item) => ({ ...item })),
      failures: report.failures.map((item) => ({ ...item })),
      warnings: report.warnings.map((item) => ({ ...item })),
      summary: { ...report.summary },
    }));
  }

  getSummary() {
    const total = this.checks.length;
    const healthy = this.checks.filter(
      (report) => report.status === "healthy"
    ).length;

    return {
      totalRuns: total,
      healthyRuns: healthy,
      degradedRuns: this.checks.filter(
        (report) => report.status === "degraded"
      ).length,
      unhealthyRuns: this.checks.filter(
        (report) => report.status === "unhealthy"
      ).length,
      successRate: total ? healthy / total : null,
      latestStatus: this.getLatest()?.status ?? "unknown",
    };
  }

  clearHistory() {
    this.checks = [];
    this.events.emit("diagnostics:history-cleared", {
      timestamp: this.clock(),
    });
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.emit("diagnostics:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthDiagnostics;