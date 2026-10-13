import RecoveryMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryMonitor.js";

export class RecoveryQueueRecoveryOrchestratorRecoveryDiagnostics {
  constructor(monitor = null, options = {}) {
    this.monitor = monitor || new RecoveryMonitor();
    this.options = {
      historyLimit: 500,
      staleJobThresholdMs: 60000,
      failureRateWarning: 0.25,
      ...options,
    };

    this.history = [];
    this.listeners = new Set();
    this.disposed = false;

    this.unsubscribe = this.monitor.subscribe((event) => {
      this.inspectEvent(event);
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Diagnostics listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inspectEvent(event) {
    if (this.disposed) return;

    this.record({
      category: "event",
      type: event.type,
      timestamp: event.timestamp || Date.now(),
      detail: event.detail ?? null,
    });

    if (event.type === "monitor:alert") {
      this.emit("diagnostics:alert", {
        severity: event.detail?.severity || "warning",
        message: event.detail?.message || "Recovery monitor alert.",
        detail: event.detail,
      });
    }
  }

  run() {
    this.assertActive();

    const snapshot = this.monitor.refresh();
    const now = Date.now();
    const findings = [];

    const jobs = [
      ...snapshot.recentJobs,
      ...this.monitor.getPendingJobs(),
    ];

    const uniqueJobs = new Map(jobs.map((job) => [job.id, job]));

    for (const job of uniqueJobs.values()) {
      if (
        job.status === "running" &&
        now - job.updatedAt > this.options.staleJobThresholdMs
      ) {
        findings.push({
          code: "STALE_RUNNING_JOB",
          severity: "warning",
          jobId: job.id,
          message: `Recovery job "${job.id}" has been running longer than expected.`,
          ageMs: now - job.updatedAt,
        });
      }

      if (job.status === "failed") {
        findings.push({
          code: "RECOVERY_JOB_FAILED",
          severity: "error",
          jobId: job.id,
          message: `Recovery job "${job.id}" failed.`,
          error: job.lastError || null,
        });
      }

      if (job.status === "retry_wait" && job.attempts >= job.maxAttempts) {
        findings.push({
          code: "RETRY_LIMIT_REACHED",
          severity: "error",
          jobId: job.id,
          message: `Recovery job "${job.id}" has reached its retry limit.`,
        });
      }
    }

    const stats = snapshot.stats || {};
    const attempted = Number(stats.attempted || 0);
    const failed = Number(stats.failed || 0);
    const failureRate = attempted > 0 ? failed / attempted : 0;

    if (
      attempted >= 4 &&
      failureRate >= this.options.failureRateWarning
    ) {
      findings.push({
        code: "HIGH_RECOVERY_FAILURE_RATE",
        severity: "warning",
        message: "The recovery failure rate exceeds the configured threshold.",
        failureRate,
        attempted,
        failed,
      });
    }

    const report = {
      timestamp: now,
      healthy: !findings.some((item) => item.severity === "error"),
      findings,
      summary: {
        totalJobs: snapshot.total,
        pendingJobs: snapshot.pending,
        failedJobs: snapshot.counts.failed,
        recoveredJobs: snapshot.counts.recovered,
        findingCount: findings.length,
      },
    };

    this.record({
      category: "diagnostic_report",
      ...report,
    });

    this.emit("diagnostics:report", report);

    for (const finding of findings) {
      this.emit("diagnostics:finding", finding);
    }

    return report;
  }

  getReport() {
    return this.run();
  }

  getHistory(options = {}) {
    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.historyLimit)
    );

    const category = options.category;

    let entries = this.history;

    if (category) {
      entries = entries.filter((entry) => entry.category === category);
    }

    return entries.slice(-limit).map((entry) => structuredClone(entry));
  }

  record(entry) {
    this.history.push({
      id: `${Date.now()}-${this.history.length + 1}`,
      ...entry,
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
        console.error("[RecoveryDiagnostics]", error);
      }
    }
  }

  clearHistory() {
    const removed = this.history.length;
    this.history = [];
    return removed;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Recovery diagnostics have been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryDiagnostics;