import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const DEFAULT_MAX_SAMPLES = 1000;

function percentile(values, fraction) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return sorted[index];
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreMetrics {
  constructor({
    maxSamples = DEFAULT_MAX_SAMPLES,
    logger = Logger,
  } = {}) {
    this.maxSamples = Math.max(
      1,
      Math.floor(Number(maxSamples) || DEFAULT_MAX_SAMPLES),
    );

    this.logger = logger;
    this.events = new EventEmitter();
    this.samples = [];
    this.disposed = false;

    this.counters = {
      attempts: 0,
      successes: 0,
      failures: 0,
      validationFailures: 0,
      rollbacks: 0,
      restoredEntries: 0,
    };

    this.startedAt = Date.now();
    this.lastRestoreAt = null;
    this.lastError = null;
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  emit(type, payload = {}) {
    this.events.emit("change", {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  recordAttempt({
    success,
    durationMs = null,
    restoredCount = 0,
    validationFailed = false,
    rolledBack = false,
    error = null,
    restoreId = null,
  } = {}) {
    this.assertActive();

    this.counters.attempts += 1;

    const succeeded = success === true;
    const failed = success === false;
    const duration = Number(durationMs);
    const restored = Math.max(0, Number(restoredCount) || 0);

    if (succeeded) {
      this.counters.successes += 1;
      this.counters.restoredEntries += restored;
      this.lastError = null;
    }

    if (failed) {
      this.counters.failures += 1;
      this.lastError = error ? String(error) : "Restore failed.";
    }

    if (validationFailed) {
      this.counters.validationFailures += 1;
    }

    if (rolledBack) {
      this.counters.rollbacks += 1;
    }

    const sample = {
      id: `restore-metric-${Date.now()}-${this.counters.attempts}`,
      timestamp: Date.now(),
      restoreId: restoreId === null ? null : String(restoreId),
      success: succeeded,
      failed,
      durationMs:
        Number.isFinite(duration) && duration >= 0 ? duration : null,
      restoredCount: restored,
      validationFailed: Boolean(validationFailed),
      rolledBack: Boolean(rolledBack),
      error: error ? String(error).slice(0, 1000) : null,
    };

    this.samples.unshift(sample);

    if (this.samples.length > this.maxSamples) {
      this.samples.length = this.maxSamples;
    }

    this.lastRestoreAt = sample.timestamp;

    this.emit("change", {
      action: "attempt-recorded",
      sample: { ...sample },
      counters: { ...this.counters },
    });

    return { ...sample };
  }

  recordSuccess(details = {}) {
    return this.recordAttempt({
      ...details,
      success: true,
    });
  }

  recordFailure(details = {}) {
    return this.recordAttempt({
      ...details,
      success: false,
    });
  }

  recordValidationFailure(details = {}) {
    return this.recordAttempt({
      ...details,
      success: false,
      validationFailed: true,
    });
  }

  recordRollback(details = {}) {
    return this.recordAttempt({
      ...details,
      success: false,
      rolledBack: true,
    });
  }

  getSamples({ limit = 100, since = null } = {}) {
    this.assertActive();

    const count = Math.max(0, Math.floor(Number(limit) || 0));
    const cutoff = since === null ? null : Number(since);

    return this.samples
      .filter(
        (sample) =>
          cutoff === null ||
          !Number.isFinite(cutoff) ||
          sample.timestamp >= cutoff,
      )
      .slice(0, count)
      .map((sample) => ({ ...sample }));
  }

  getSummary({ since = null } = {}) {
    this.assertActive();

    const cutoff = since === null ? null : Number(since);

    const samples = this.samples.filter(
      (sample) =>
        cutoff === null ||
        !Number.isFinite(cutoff) ||
        sample.timestamp >= cutoff,
    );

    const durations = samples
      .map((sample) => sample.durationMs)
      .filter((value) => Number.isFinite(value));

    const successes = samples.filter((sample) => sample.success).length;
    const failures = samples.filter((sample) => sample.failed).length;
    const validationFailures = samples.filter(
      (sample) => sample.validationFailed,
    ).length;
    const rollbacks = samples.filter((sample) => sample.rolledBack).length;

    const total = samples.length;
    const durationTotal = durations.reduce((sum, value) => sum + value, 0);

    return {
      generatedAt: Date.now(),
      periodStartedAt:
        cutoff !== null && Number.isFinite(cutoff)
          ? cutoff
          : this.startedAt,
      sampleCount: total,
      successes,
      failures,
      successRate: total > 0 ? successes / total : null,
      failureRate: total > 0 ? failures / total : null,
      validationFailures,
      rollbacks,
      restoredEntries: samples.reduce(
        (sum, sample) =>
          sum + (sample.success ? sample.restoredCount : 0),
        0,
      ),
      duration: {
        sampleCount: durations.length,
        averageMs:
          durations.length > 0 ? durationTotal / durations.length : null,
        minMs: durations.length > 0 ? Math.min(...durations) : null,
        maxMs: durations.length > 0 ? Math.max(...durations) : null,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        p99Ms: percentile(durations, 0.99),
      },
      counters: { ...this.counters },
      lastRestoreAt: this.lastRestoreAt,
      lastError: this.lastError,
    };
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      exportedAt: Date.now(),
      startedAt: this.startedAt,
      lastRestoreAt: this.lastRestoreAt,
      counters: { ...this.counters },
      samples: this.samples.map((sample) => ({ ...sample })),
      lastError: this.lastError,
    };
  }

  importData(data, { replace = true } = {}) {
    this.assertActive();

    if (
      !data ||
      typeof data !== "object" ||
      data.version !== 1 ||
      !Array.isArray(data.samples)
    ) {
      throw new TypeError("Invalid restore metrics archive.");
    }

    const validSamples = data.samples.filter(
      (sample) =>
        sample &&
        typeof sample === "object" &&
        typeof sample.id === "string" &&
        Number.isFinite(sample.timestamp),
    );

    if (replace) {
      this.samples = validSamples.map((sample) => ({ ...sample }));
    } else {
      const ids = new Set(this.samples.map((sample) => sample.id));

      for (const sample of validSamples) {
        if (!ids.has(sample.id)) {
          this.samples.push({ ...sample });
          ids.add(sample.id);
        }
      }
    }

    this.samples.sort((a, b) => b.timestamp - a.timestamp);

    if (this.samples.length > this.maxSamples) {
      this.samples.length = this.maxSamples;
    }

    if (data.counters && typeof data.counters === "object") {
      for (const key of Object.keys(this.counters)) {
        const value = Number(data.counters[key]);

        if (replace && Number.isFinite(value) && value >= 0) {
          this.counters[key] = value;
        }
      }
    }

    if (replace) {
      this.startedAt = Number(data.startedAt) || Date.now();
      this.lastRestoreAt = Number(data.lastRestoreAt) || null;
      this.lastError = data.lastError ? String(data.lastError) : null;
    }

    this.emit("change", {
      action: "imported",
      sampleCount: validSamples.length,
    });

    return validSamples.length;
  }

  reset() {
    this.assertActive();

    this.samples = [];

    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }

    this.startedAt = Date.now();
    this.lastRestoreAt = null;
    this.lastError = null;

    this.emit("change", {
      action: "reset",
    });
  }

  getStatus() {
    return {
      ...this.getSummary(),
      maxSamples: this.maxSamples,
      disposed: this.disposed,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore metrics have been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.removeAllListeners?.();

    this.logger?.info?.(
      "[SchedulerRestoreMetrics] Disposed.",
    );
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreMetrics;