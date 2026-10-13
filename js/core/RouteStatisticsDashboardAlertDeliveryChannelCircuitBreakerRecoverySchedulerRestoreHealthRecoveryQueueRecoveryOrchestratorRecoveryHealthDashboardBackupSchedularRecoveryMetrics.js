import RecoveryHealthDashboardBackupSchedulerRecoveryMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryMonitor.js";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SAMPLES = 1000;

export class RecoveryHealthDashboardBackupSchedulerRecoveryMetrics {
  constructor(options = {}) {
    this.monitor =
      options.monitor ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryMonitor(options);

    this.windowMs = Math.max(
      60_000,
      Number(options.windowMs) || DEFAULT_WINDOW_MS
    );

    this.maxSamples = Math.max(
      100,
      Number(options.maxSamples) || DEFAULT_MAX_SAMPLES
    );

    this.clock = options.clock ?? (() => Date.now());
    this.samples = [];
    this.counters = {
      checks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      recoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      staleDetections: 0,
    };

    this.lastCheckDurationMs = null;
    this.lastRecoveryDurationMs = null;
    this.lastCheckAt = null;
    this.lastRecoveryAt = null;
  }

  recordCheck(result, durationMs = 0) {
    const timestamp = this.clock();
    const failed = result?.healthy === false || Boolean(result?.error);

    this.counters.checks += 1;

    if (failed) {
      this.counters.failedChecks += 1;
    } else {
      this.counters.successfulChecks += 1;
    }

    if (result?.stale) {
      this.counters.staleDetections += 1;
    }

    this.lastCheckAt = timestamp;
    this.lastCheckDurationMs = this.normalizeDuration(durationMs);

    this.addSample({
      type: "check",
      timestamp,
      success: !failed,
      durationMs: this.lastCheckDurationMs,
      stale: Boolean(result?.stale),
    });

    return this.snapshot();
  }

  recordRecovery(result, durationMs = 0) {
    const timestamp = this.clock();
    const success = result?.success === true;

    this.counters.recoveries += 1;

    if (success) {
      this.counters.successfulRecoveries += 1;
    } else {
      this.counters.failedRecoveries += 1;
    }

    this.lastRecoveryAt = timestamp;
    this.lastRecoveryDurationMs = this.normalizeDuration(durationMs);

    this.addSample({
      type: "recovery",
      timestamp,
      success,
      durationMs: this.lastRecoveryDurationMs,
    });

    return this.snapshot();
  }

  addSample(sample) {
    this.samples.push(sample);

    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }

    this.pruneSamples();
  }

  pruneSamples() {
    const cutoff = this.clock() - this.windowMs;

    this.samples = this.samples.filter(
      (sample) => sample.timestamp >= cutoff
    );
  }

  getWindowMetrics() {
    this.pruneSamples();

    const checks = this.samples.filter(
      (sample) => sample.type === "check"
    );

    const recoveries = this.samples.filter(
      (sample) => sample.type === "recovery"
    );

    return {
      windowMs: this.windowMs,
      sampleCount: this.samples.length,
      checks: this.summarizeSamples(checks),
      recoveries: this.summarizeSamples(recoveries),
    };
  }

  summarizeSamples(samples) {
    const total = samples.length;
    const successes = samples.filter((sample) => sample.success).length;
    const failures = total - successes;
    const durations = samples
      .map((sample) => sample.durationMs)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    return {
      total,
      successes,
      failures,
      successRate: total ? successes / total : null,
      failureRate: total ? failures / total : null,
      averageDurationMs: durations.length
        ? durations.reduce((sum, value) => sum + value, 0) /
          durations.length
        : null,
      p95DurationMs: this.percentile(durations, 0.95),
      staleDetections: samples.filter((sample) => sample.stale).length,
    };
  }

  percentile(sortedValues, percentile) {
    if (!sortedValues.length) {
      return null;
    }

    const index = Math.min(
      sortedValues.length - 1,
      Math.ceil(percentile * sortedValues.length) - 1
    );

    return sortedValues[index];
  }

  snapshot() {
    return {
      counters: { ...this.counters },
      lastCheckAt: this.lastCheckAt,
      lastCheckDurationMs: this.lastCheckDurationMs,
      lastRecoveryAt: this.lastRecoveryAt,
      lastRecoveryDurationMs: this.lastRecoveryDurationMs,
      window: this.getWindowMetrics(),
      monitor: this.monitor.getStatus(),
    };
  }

  reset() {
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }

    this.samples = [];
    this.lastCheckDurationMs = null;
    this.lastRecoveryDurationMs = null;
    this.lastCheckAt = null;
    this.lastRecoveryAt = null;

    return this.snapshot();
  }

  normalizeDuration(value) {
    const duration = Number(value);

    return Number.isFinite(duration)
      ? Math.max(0, duration)
      : 0;
  }

  destroy() {
    this.samples = [];
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryMetrics;