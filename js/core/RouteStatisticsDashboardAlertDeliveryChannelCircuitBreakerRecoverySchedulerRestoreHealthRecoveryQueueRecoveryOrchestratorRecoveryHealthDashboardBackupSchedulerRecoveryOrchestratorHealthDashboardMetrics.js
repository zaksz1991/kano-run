import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboard.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardMetrics {
  constructor({
    dashboard = null,
    metrics = null,
    clock = () => Date.now(),
    historyLimit = 120,
  } = {}) {
    this.dashboard =
      dashboard ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard();

    this.metrics =
      metrics ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics();

    this.clock = clock;
    this.historyLimit = Math.max(10, Number(historyLimit) || 120);
    this.samples = [];
    this.startedAt = this.clock();
    this.lastSampleAt = null;
    this.unsubscribe = null;
  }

  start() {
    if (this.unsubscribe) {
      return this.getSummary();
    }

    this.unsubscribe = this.dashboard.subscribe(({ snapshot }) => {
      if (snapshot) {
        this.recordSample(snapshot);
      }
    });

    const initialSnapshot = this.dashboard.getSnapshot();

    if (initialSnapshot) {
      this.recordSample(initialSnapshot);
    }

    return this.getSummary();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    return this.getSummary();
  }

  recordSample(snapshot = null) {
    const timestamp = this.clock();
    const source = snapshot ?? this.dashboard.getSnapshot();

    if (!source) {
      return null;
    }

    const sample = {
      timestamp,
      healthStatus: source.status ?? "unknown",
      failedChecks: Number(source.health?.failedChecks ?? 0),
      totalChecks: Number(source.health?.totalChecks ?? 0),
      metrics: this.#extractMetrics(source.metrics),
    };

    this.samples.push(sample);

    if (this.samples.length > this.historyLimit) {
      this.samples.splice(
        0,
        this.samples.length - this.historyLimit,
      );
    }

    this.lastSampleAt = timestamp;

    return structuredClone(sample);
  }

  getSummary() {
    const total = this.samples.length;
    const healthy = this.samples.filter(
      (sample) => sample.healthStatus === "healthy",
    ).length;

    const degraded = this.samples.filter(
      (sample) => sample.healthStatus !== "healthy",
    ).length;

    const failedChecks = this.samples.reduce(
      (sum, sample) => sum + sample.failedChecks,
      0,
    );

    const totalChecks = this.samples.reduce(
      (sum, sample) => sum + sample.totalChecks,
      0,
    );

    return {
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, this.clock() - this.startedAt),
      sampleCount: total,
      healthySamples: healthy,
      degradedSamples: degraded,
      healthRate: total > 0 ? healthy / total : null,
      failedChecks,
      totalChecks,
      checkSuccessRate:
        totalChecks > 0
          ? (totalChecks - failedChecks) / totalChecks
          : null,
      lastSampleAt: this.lastSampleAt,
      latest: total
        ? structuredClone(this.samples[total - 1])
        : null,
    };
  }

  getSamples({ limit = this.historyLimit } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit),
    );

    return this.samples.slice(-safeLimit).map((sample) => ({
      ...sample,
      metrics: { ...sample.metrics },
    }));
  }

  getTrend() {
    if (this.samples.length < 2) {
      return {
        direction: "insufficient_data",
        healthRateChange: null,
        failedCheckChange: null,
      };
    }

    const midpoint = Math.floor(this.samples.length / 2);
    const earlier = this.samples.slice(0, midpoint);
    const recent = this.samples.slice(midpoint);

    const rate = (items) =>
      items.filter((item) => item.healthStatus === "healthy").length /
      items.length;

    const failureAverage = (items) =>
      items.reduce((sum, item) => sum + item.failedChecks, 0) /
      items.length;

    const healthRateChange = rate(recent) - rate(earlier);
    const failedCheckChange =
      failureAverage(recent) - failureAverage(earlier);

    let direction = "stable";

    if (healthRateChange > 0.05 && failedCheckChange <= 0) {
      direction = "improving";
    } else if (
      healthRateChange < -0.05 ||
      failedCheckChange > 0
    ) {
      direction = "worsening";
    }

    return {
      direction,
      healthRateChange,
      failedCheckChange,
    };
  }

  exportReport() {
    return {
      schemaVersion: 1,
      generatedAt: this.clock(),
      summary: this.getSummary(),
      trend: this.getTrend(),
      samples: this.getSamples(),
    };
  }

  reset() {
    const removedSamples = this.samples.length;

    this.samples = [];
    this.startedAt = this.clock();
    this.lastSampleAt = null;

    return {
      removedSamples,
      resetAt: this.startedAt,
    };
  }

  #extractMetrics(source) {
    if (!source || typeof source !== "object") {
      return {};
    }

    const result = {};

    for (const [key, value] of Object.entries(source)) {
      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        result[key] = value;
      }
    }

    return result;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardMetrics;