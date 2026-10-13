import RecoveryHealthDashboard from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboard.js";

const DEFAULTS = {
  historyLimit: 1000,
  windowMs: 15 * 60 * 1000,
};

export class RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardMetrics {
  constructor(dashboard = null, options = {}) {
    this.dashboard = dashboard || new RecoveryHealthDashboard();
    this.options = { ...DEFAULTS, ...options };

    this.samples = [];
    this.listeners = new Set();
    this.unsubscribeDashboard = null;
    this.disposed = false;

    this.unsubscribeDashboard = this.dashboard.subscribe((event) => {
      this.handleDashboardEvent(event);
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Metrics listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handleDashboardEvent(event) {
    if (this.disposed) return;

    if (event.type === "dashboard:updated") {
      this.capture(event.detail);
    }
  }

  capture(snapshot = null) {
    if (this.disposed) return null;

    const data = snapshot || this.dashboard.getDashboard();
    const metrics = data.metrics || {};

    const sample = {
      timestamp: Date.now(),
      status: data.status || "unknown",
      healthy: data.healthy ?? null,
      consecutiveFailures: Number(data.consecutiveFailures || 0),
      totalJobs: Number(metrics.totalJobs || 0),
      pendingJobs: Number(metrics.pendingJobs || 0),
      runningJobs: Number(metrics.runningJobs || 0),
      recoveredJobs: Number(metrics.recoveredJobs || 0),
      failedJobs: Number(metrics.failedJobs || 0),
      attempted: Number(metrics.attempted || 0),
      failureRate: Number(metrics.failureRate || 0),
      issueCount: Array.isArray(data.issues) ? data.issues.length : 0,
    };

    this.samples.push(sample);
    this.trimHistory();

    this.emit("metrics:captured", structuredClone(sample));

    return structuredClone(sample);
  }

  trimHistory() {
    const limit = Math.max(1, Number(this.options.historyLimit));

    if (this.samples.length > limit) {
      this.samples.splice(0, this.samples.length - limit);
    }
  }

  getLatest() {
    const sample = this.samples[this.samples.length - 1];
    return sample ? structuredClone(sample) : null;
  }

  getHistory(options = {}) {
    let samples = this.samples;

    if (options.since != null) {
      const since = Number(options.since);
      samples = samples.filter((sample) => sample.timestamp >= since);
    }

    if (options.status) {
      samples = samples.filter(
        (sample) => sample.status === options.status
      );
    }

    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.historyLimit)
    );

    return samples
      .slice(-limit)
      .map((sample) => structuredClone(sample));
  }

  getSummary(options = {}) {
    const windowMs = Math.max(
      1000,
      Number(options.windowMs ?? this.options.windowMs)
    );

    const cutoff = Date.now() - windowMs;
    const samples = this.samples.filter(
      (sample) => sample.timestamp >= cutoff
    );

    if (samples.length === 0) {
      return {
        generatedAt: Date.now(),
        windowMs,
        sampleCount: 0,
        status: "unknown",
        availabilityRate: null,
        averageFailureRate: null,
        maximumPendingJobs: 0,
        maximumRunningJobs: 0,
        totalIssues: 0,
      };
    }

    const healthySamples = samples.filter(
      (sample) => sample.healthy === true
    ).length;

    const failureRates = samples.map((sample) => sample.failureRate);

    return {
      generatedAt: Date.now(),
      windowMs,
      sampleCount: samples.length,
      status: samples[samples.length - 1].status,
      availabilityRate: healthySamples / samples.length,
      averageFailureRate:
        failureRates.reduce((sum, value) => sum + value, 0) /
        failureRates.length,
      maximumPendingJobs: Math.max(
        ...samples.map((sample) => sample.pendingJobs)
      ),
      maximumRunningJobs: Math.max(
        ...samples.map((sample) => sample.runningJobs)
      ),
      totalIssues: samples.reduce(
        (sum, sample) => sum + sample.issueCount,
        0
      ),
    };
  }

  getTrends(options = {}) {
    const samples = this.getHistory(options);

    if (samples.length < 2) {
      return {
        sampleCount: samples.length,
        trends: {},
      };
    }

    const first = samples[0];
    const last = samples[samples.length - 1];

    const fields = [
      "totalJobs",
      "pendingJobs",
      "runningJobs",
      "recoveredJobs",
      "failedJobs",
      "attempted",
      "failureRate",
      "issueCount",
    ];

    const trends = {};

    for (const field of fields) {
      trends[field] = {
        start: first[field],
        end: last[field],
        change: last[field] - first[field],
      };
    }

    return {
      sampleCount: samples.length,
      from: first.timestamp,
      to: last.timestamp,
      trends,
    };
  }

  reset() {
    const removed = this.samples.length;
    this.samples = [];

    this.emit("metrics:reset", { removed });

    return removed;
  }

  exportData() {
    return {
      exportedAt: Date.now(),
      count: this.samples.length,
      samples: this.getHistory(),
      summary: this.getSummary(),
      trends: this.getTrends(),
    };
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
        console.error("[RecoveryHealthDashboardMetrics]", error);
      }
    }
  }

  dispose() {
    if (this.disposed) return;

    if (typeof this.unsubscribeDashboard === "function") {
      this.unsubscribeDashboard();
      this.unsubscribeDashboard = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardMetrics;