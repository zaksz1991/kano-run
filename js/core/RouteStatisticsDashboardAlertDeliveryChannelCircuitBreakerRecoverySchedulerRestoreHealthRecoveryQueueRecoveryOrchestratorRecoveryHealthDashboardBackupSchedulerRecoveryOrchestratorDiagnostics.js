import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorDiagnostics {
  constructor({
    orchestrator = null,
    monitor = null,
    metrics = null,
    persistence = null,
    clock = () => Date.now(),
    historyLimit = 200,
  } = {}) {
    this.orchestrator =
      orchestrator ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator();

    this.monitor =
      monitor ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor({
        orchestrator: this.orchestrator,
      });

    this.metrics =
      metrics ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics({
        orchestrator: this.orchestrator,
        monitor: this.monitor,
      });

    this.persistence =
      persistence ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence({
        orchestrator: this.orchestrator,
      });

    this.clock = clock;
    this.historyLimit = Math.max(10, Number(historyLimit) || 200);
    this.history = [];
    this.sequence = 0;
    this.startedAt = this.clock();
    this.lastReport = null;
  }

  record(event, details = {}) {
    const entry = {
      id: ++this.sequence,
      timestamp: this.clock(),
      event: String(event || "diagnostic_event"),
      details: this.#sanitize(details),
    };

    this.history.push(entry);

    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    return { ...entry };
  }

  capture({ label = "manual", includeHistory = true } = {}) {
    const timestamp = this.clock();

    const report = {
      label,
      timestamp,
      uptimeMs: Math.max(0, timestamp - this.startedAt),
      status: this.#safeCall(() => this.orchestrator.getStatus()),
      monitor: this.#safeCall(() => this.monitor.getStatus()),
      metrics: this.#safeCall(() => this.metrics.getMetrics()),
      persistence: this.#safeCall(() => this.persistence.getStatus()),
      historyCount: this.history.length,
    };

    if (includeHistory) {
      report.history = this.getHistory();
    }

    this.lastReport = report;
    this.record("diagnostic_capture", {
      label,
      historyCount: this.history.length,
    });

    return structuredClone(report);
  }

  getHistory({ limit = this.historyLimit, event = null } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit),
    );

    let entries = this.history;

    if (event) {
      entries = entries.filter((entry) => entry.event === event);
    }

    return entries.slice(-safeLimit).map((entry) => ({
      ...entry,
      details: { ...entry.details },
    }));
  }

  getLastReport() {
    return this.lastReport
      ? structuredClone(this.lastReport)
      : null;
  }

  async runHealthCheck() {
    const startedAt = this.clock();
    const checks = [];

    checks.push(
      this.#check("orchestrator", () =>
        this.orchestrator.getStatus(),
      ),
    );

    checks.push(
      this.#check("monitor", () =>
        this.monitor.getStatus(),
      ),
    );

    checks.push(
      this.#check("metrics", () =>
        this.metrics.getMetrics(),
      ),
    );

    checks.push(
      this.#check("persistence", () =>
        this.persistence.getStatus(),
      ),
    );

    const failed = checks.filter(
      (check) => check.status === "failed",
    );

    const result = {
      status: failed.length === 0 ? "healthy" : "degraded",
      checkedAt: this.clock(),
      durationMs: Math.max(0, this.clock() - startedAt),
      totalChecks: checks.length,
      passedChecks: checks.length - failed.length,
      failedChecks: failed.length,
      checks,
    };

    this.record("health_check", {
      status: result.status,
      totalChecks: result.totalChecks,
      failedChecks: result.failedChecks,
    });

    return result;
  }

  clearHistory() {
    const clearedCount = this.history.length;

    this.history = [];

    this.record("history_cleared", {
      clearedCount,
    });

    return {
      clearedCount,
      timestamp: this.clock(),
    };
  }

  exportDiagnostics() {
    return {
      schemaVersion: 1,
      exportedAt: this.clock(),
      uptimeMs: Math.max(0, this.clock() - this.startedAt),
      report: this.getLastReport(),
      history: this.getHistory(),
    };
  }

  #check(name, operation) {
    const startedAt = this.clock();

    try {
      const value = operation();

      return {
        name,
        status: "passed",
        durationMs: Math.max(0, this.clock() - startedAt),
        value: this.#sanitize(value),
      };
    } catch (error) {
      return {
        name,
        status: "failed",
        durationMs: Math.max(0, this.clock() - startedAt),
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  #safeCall(operation) {
    try {
      return this.#sanitize(operation());
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  #sanitize(value, depth = 0) {
    if (depth > 6) {
      return "[MaxDepth]";
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value === "undefined") {
      return null;
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.#sanitize(item, depth + 1),
      );
    }

    if (typeof value === "object") {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        if (
          /password|secret|token|authorization|credential/i.test(key)
        ) {
          output[key] = "[REDACTED]";
          continue;
        }

        output[key] = this.#sanitize(item, depth + 1);
      }

      return output;
    }

    return String(value);
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorDiagnostics;