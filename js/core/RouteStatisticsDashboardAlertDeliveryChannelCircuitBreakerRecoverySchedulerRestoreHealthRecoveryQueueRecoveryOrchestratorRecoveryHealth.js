import RecoveryMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryMonitor.js";
import RecoveryDiagnostics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryDiagnostics.js";

const DEFAULTS = {
  checkIntervalMs: 5000,
  staleJobThresholdMs: 60000,
  failureRateThreshold: 0.25,
  minimumAttempts: 4,
  historyLimit: 300,
};

export class RecoveryQueueRecoveryOrchestratorRecoveryHealth {
  constructor(monitor = null, diagnostics = null, options = {}) {
    this.monitor = monitor || new RecoveryMonitor();
    this.diagnostics = diagnostics || new RecoveryDiagnostics(this.monitor);
    this.options = { ...DEFAULTS, ...options };

    this.listeners = new Set();
    this.history = [];
    this.interval = null;
    this.unsubscribeMonitor = null;
    this.disposed = false;

    this.state = {
      status: "unknown",
      healthy: null,
      checkedAt: null,
      consecutiveFailures: 0,
      issues: [],
      metrics: {},
    };

    this.unsubscribeMonitor = this.monitor.subscribe((event) => {
      if (event.type === "monitor:updated") {
        this.evaluateSnapshot(event.detail);
      }
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Health listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    this.assertActive();

    if (this.interval) {
      return this.getState();
    }

    this.check();

    this.interval = setInterval(() => {
      this.check();
    }, Math.max(500, this.options.checkIntervalMs));

    this.emit("health:started", {
      intervalMs: this.options.checkIntervalMs,
    });

    return this.getState();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.emit("health:stopped", this.getState());

    return this.getState();
  }

  check() {
    this.assertActive();

    try {
      const snapshot = this.monitor.refresh();
      const report = this.diagnostics.run();

      return this.evaluate(snapshot, report);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.state = {
        ...this.state,
        status: "unhealthy",
        healthy: false,
        checkedAt: Date.now(),
        consecutiveFailures: this.state.consecutiveFailures + 1,
        issues: [
          {
            code: "HEALTH_CHECK_ERROR",
            severity: "error",
            message,
          },
        ],
      };

      this.record();
      this.emit("health:unhealthy", this.getState());

      return this.getState();
    }
  }

  evaluate(snapshot, report) {
    const now = Date.now();
    const issues = [];
    const jobs = snapshot.recentJobs || [];

    for (const job of jobs) {
      if (
        job.status === "running" &&
        now - job.updatedAt > this.options.staleJobThresholdMs
      ) {
        issues.push({
          code: "STALE_RUNNING_JOB",
          severity: "warning",
          jobId: job.id,
          message: `Recovery job "${job.id}" appears stale.`,
        });
      }

      if (job.status === "failed") {
        issues.push({
          code: "FAILED_RECOVERY_JOB",
          severity: "error",
          jobId: job.id,
          message: `Recovery job "${job.id}" failed.`,
        });
      }
    }

    const stats = snapshot.stats || {};
    const attempted = Number(stats.attempted || 0);
    const failed = Number(stats.failed || 0);
    const failureRate = attempted > 0 ? failed / attempted : 0;

    if (
      attempted >= this.options.minimumAttempts &&
      failureRate >= this.options.failureRateThreshold
    ) {
      issues.push({
        code: "HIGH_FAILURE_RATE",
        severity: "warning",
        message: "Recovery failures exceed the configured threshold.",
        failureRate,
      });
    }

    if (report && Array.isArray(report.findings)) {
      for (const finding of report.findings) {
        const duplicate = issues.some(
          (issue) =>
            issue.code === finding.code &&
            issue.jobId === finding.jobId
        );

        if (!duplicate) {
          issues.push(finding);
        }
      }
    }

    const hasErrors = issues.some((issue) => issue.severity === "error");
    const hasWarnings = issues.some(
      (issue) => issue.severity === "warning"
    );

    const healthy = !hasErrors;
    const status = hasErrors
      ? "unhealthy"
      : hasWarnings
        ? "degraded"
        : "healthy";

    this.state = {
      status,
      healthy,
      checkedAt: now,
      consecutiveFailures: healthy
        ? 0
        : this.state.consecutiveFailures + 1,
      issues,
      metrics: {
        totalJobs: snapshot.total,
        pendingJobs: snapshot.pending,
        runningJobs: snapshot.counts?.running || 0,
        recoveredJobs: snapshot.counts?.recovered || 0,
        failedJobs: snapshot.counts?.failed || 0,
        attempted,
        failureRate,
      },
    };

    this.record();

    this.emit(
      status === "unhealthy"
        ? "health:unhealthy"
        : status === "degraded"
          ? "health:degraded"
          : "health:healthy",
      this.getState()
    );

    return this.getState();
  }

  evaluateSnapshot(snapshot) {
    if (this.disposed || !snapshot) {
      return;
    }

    const previousStatus = this.state.status;

    const report = {
      findings: [],
    };

    this.evaluate(snapshot, report);

    if (previousStatus !== this.state.status) {
      this.emit("health:status_changed", {
        previousStatus,
        currentStatus: this.state.status,
        checkedAt: this.state.checkedAt,
      });
    }
  }

  getState() {
    return structuredClone(this.state);
  }

  isHealthy() {
    return this.state.healthy === true;
  }

  getIssues(options = {}) {
    const severity = options.severity;

    const issues = this.state.issues || [];

    return issues
      .filter((issue) => !severity || issue.severity === severity)
      .map((issue) => structuredClone(issue));
  }

  getHistory(options = {}) {
    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.historyLimit)
    );

    return this.history.slice(-limit).map((entry) => structuredClone(entry));
  }

  record() {
    this.history.push({
      timestamp: Date.now(),
      ...this.getState(),
    });

    const limit = Math.max(1, this.options.historyLimit);

    if (this.history.length > limit) {
      this.history.splice(0, this.history.length - limit);
    }
  }

  emit(type, detail) {
    const event = {
      type,
      detail,
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryHealth]", error);
      }
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Recovery health service has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();

    if (typeof this.unsubscribeMonitor === "function") {
      this.unsubscribeMonitor();
      this.unsubscribeMonitor = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryHealth;