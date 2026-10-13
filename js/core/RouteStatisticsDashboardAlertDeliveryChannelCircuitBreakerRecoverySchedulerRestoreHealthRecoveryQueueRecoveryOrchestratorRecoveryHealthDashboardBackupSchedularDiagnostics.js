import RecoveryHealthDashboardBackupScheduler from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupScheduler.js";
import RecoveryHealthDashboardBackupSchedulerMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerMonitor.js";

const DEFAULT_OPTIONS = {
  historyLimit: 200,
  slowRunThresholdMs: 10_000,
  staleRunThresholdMs: 15 * 60 * 1000,
};

export class RecoveryHealthDashboardBackupSchedulerDiagnostics {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.scheduler =
      options.scheduler ||
      new RecoveryHealthDashboardBackupScheduler({
        ...options.schedulerOptions,
        enabled: false,
      });

    this.monitor =
      options.monitor ||
      new RecoveryHealthDashboardBackupSchedulerMonitor({
        ...options.monitorOptions,
        scheduler: this.scheduler,
      });

    this.history = [];
    this.listeners = new Set();
    this.disposed = false;

    this.unsubscribeMonitor =
      typeof this.monitor.subscribe === "function"
        ? this.monitor.subscribe((event) =>
            this._handleMonitorEvent(event)
          )
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Diagnostics listener must be a function.");
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
        // Diagnostic subscribers cannot interrupt monitoring.
      }
    }
  }

  _record(type, detail = {}) {
    const entry = {
      id: `diagnostic-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    this.history.push(entry);

    const limit = Math.max(
      1,
      Number(this.options.historyLimit) || 200
    );

    if (this.history.length > limit) {
      this.history.splice(0, this.history.length - limit);
    }

    this._emit("diagnostic-recorded", { entry });

    return entry;
  }

  _handleMonitorEvent(event) {
    if (!event || typeof event !== "object") return;

    if (event.event === "sample-recorded") {
      const sample = event.sample;

      if (!sample) return;

      this._record("monitor-sample", {
        sampleId: sample.id,
        sampleType: sample.type,
        sampleTimestamp: sample.timestamp,
      });

      return;
    }

    if (event.event === "alert") {
      this._record("monitor-alert", {
        alert: event.alert || null,
      });

      this._emit("alert-detected", {
        alert: event.alert || null,
      });

      return;
    }

    this._record("monitor-event", {
      sourceEvent: event.event || "unknown",
    });
  }

  diagnose() {
    const now = Date.now();

    const schedulerStatus =
      typeof this.scheduler.getStatus === "function"
        ? this.scheduler.getStatus()
        : null;

    const monitorStatus =
      typeof this.monitor.getStatus === "function"
        ? this.monitor.getStatus()
        : null;

    const issues = [];
    const checks = [];

    const addCheck = (name, passed, message, severity = "info") => {
      checks.push({ name, passed, message, severity });

      if (!passed) {
        issues.push({ name, message, severity });
      }
    };

    addCheck(
      "scheduler-available",
      Boolean(schedulerStatus),
      schedulerStatus
        ? "Scheduler status is available."
        : "Scheduler status could not be retrieved.",
      "error"
    );

    if (schedulerStatus) {
      addCheck(
        "scheduler-not-disposed",
        !schedulerStatus.disposed,
        schedulerStatus.disposed
          ? "Scheduler has been disposed."
          : "Scheduler is active.",
        "error"
      );

      addCheck(
        "no-backup-run-in-progress",
        !schedulerStatus.running,
        schedulerStatus.running
          ? "A backup operation is currently running."
          : "No backup operation is currently running.",
        "info"
      );

      const lastRunAt = schedulerStatus.lastRunAt
        ? Date.parse(schedulerStatus.lastRunAt)
        : null;

      const hasRecentRun =
        lastRunAt !== null &&
        Number.isFinite(lastRunAt) &&
        now - lastRunAt <= this.options.staleRunThresholdMs;

      if (schedulerStatus.lastRunAt) {
        addCheck(
          "last-run-not-stale",
          hasRecentRun,
          hasRecentRun
            ? "The last scheduler run is recent."
            : "The last scheduler run is older than the configured threshold.",
          hasRecentRun ? "info" : "warning"
        );
      }

      const lastResult = schedulerStatus.lastResult;

      if (lastResult) {
        addCheck(
          "last-run-successful",
          lastResult.success === true,
          lastResult.success
            ? "The last backup run succeeded."
            : "The last backup run failed.",
          lastResult.success ? "info" : "warning"
        );
      }
    }

    if (monitorStatus) {
      addCheck(
        "no-consecutive-failures",
        monitorStatus.consecutiveFailures === 0,
        monitorStatus.consecutiveFailures === 0
          ? "No consecutive backup failures are recorded."
          : `${monitorStatus.consecutiveFailures} consecutive backup failures are recorded.`,
        monitorStatus.consecutiveFailures > 0
          ? "warning"
          : "info"
      );
    }

    const report = {
      generatedAt: new Date().toISOString(),
      healthy: issues.every(
        (issue) => issue.severity === "info"
      ),
      checks,
      issues,
      scheduler: schedulerStatus,
      monitor: monitorStatus,
    };

    this._record("diagnostic-report", {
      healthy: report.healthy,
      checkCount: checks.length,
      issueCount: issues.length,
    });

    this._emit("diagnostic-completed", { report });

    return report;
  }

  getHistory(options = {}) {
    let entries = [...this.history];

    if (options.type) {
      entries = entries.filter(
        (entry) => entry.type === options.type
      );
    }

    if (options.since) {
      const since = Date.parse(options.since);

      if (Number.isFinite(since)) {
        entries = entries.filter(
          (entry) => Date.parse(entry.timestamp) >= since
        );
      }
    }

    const limit = Math.max(
      1,
      Number(options.limit) || entries.length || 1
    );

    return entries.slice(-limit);
  }

  clearHistory() {
    const count = this.history.length;
    this.history = [];

    this._emit("diagnostic-history-cleared", { count });

    return count;
  }

  getSummary() {
    const report = this.diagnose();

    return {
      generatedAt: report.generatedAt,
      healthy: report.healthy,
      checksPassed: report.checks.filter(
        (check) => check.passed
      ).length,
      checksFailed: report.checks.filter(
        (check) => !check.passed
      ).length,
      issues: report.issues,
      historyCount: this.history.length,
    };
  }

  dispose() {
    if (this.disposed) return;

    if (typeof this.unsubscribeMonitor === "function") {
      this.unsubscribeMonitor();
      this.unsubscribeMonitor = null;
    }

    if (this.options.disposeMonitor !== false) {
      if (typeof this.monitor.dispose === "function") {
        this.monitor.dispose();
      }
    } else if (this.options.stopMonitorOnDispose) {
      this.monitor.stop?.();
    }

    if (this.options.disposeScheduler === true) {
      this.scheduler.dispose?.();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerDiagnostics;