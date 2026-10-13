import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  maxSamples: 500,
  windowMs: 60 * 60 * 1000,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthMetrics {
  constructor({
    health = null,
    monitor = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.health = health;
    this.monitor = monitor;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.samples = [];
    this.disposed = false;
    this.unsubscribe = [];
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  start() {
    if (this.disposed) {
      throw new Error("Restore health metrics have been disposed.");
    }

    if (this.unsubscribe.length) return false;

    if (this.health?.on) {
      this.unsubscribe.push(
        this.health.on("health:checked", (result) => {
          this.record(result);
        })
      );
    }

    if (this.monitor?.on) {
      this.unsubscribe.push(
        this.monitor.on("monitor:sample", (sample) => {
          this.record(sample);
        })
      );
    }

    return true;
  }

  record(result = {}) {
    if (this.disposed) return null;

    const timestamp = this.clock();
    const status = String(
      result.status ??
      (result.healthy ? "healthy" : "unknown")
    ).toLowerCase();

    const sample = {
      timestamp,
      status,
      healthy: status === "healthy" || result.healthy === true,
      issueCount: Math.max(
        0,
        Number(result.issueCount ?? result.issues?.length ?? 0) || 0
      ),
      source: result.checkedAt ? "health" : "monitor",
    };

    this.samples.push(sample);

    if (this.samples.length > this.options.maxSamples) {
      this.samples.splice(
        0,
        this.samples.length - this.options.maxSamples
      );
    }

    this.events.emit("metrics:recorded", sample);

    return { ...sample };
  }

  getMetrics({ windowMs = this.options.windowMs } = {}) {
    const now = this.clock();
    const duration = Math.max(0, Number(windowMs) || 0);
    const cutoff = now - duration;

    const samples = this.samples.filter(
      (sample) => sample.timestamp >= cutoff && sample.timestamp <= now
    );

    const total = samples.length;
    const healthy = samples.filter(
      (sample) => sample.healthy
    ).length;
    const unhealthy = samples.filter(
      (sample) => sample.status === "unhealthy"
    ).length;
    const degraded = samples.filter(
      (sample) => sample.status === "degraded"
    ).length;
    const issueCount = samples.reduce(
      (sum, sample) => sum + sample.issueCount,
      0
    );

    return {
      generatedAt: new Date(now).toISOString(),
      windowMs: duration,
      totalSamples: total,
      healthySamples: healthy,
      degradedSamples: degraded,
      unhealthySamples: unhealthy,
      healthRate: total ? healthy / total : null,
      averageIssues: total ? issueCount / total : 0,
      latestStatus: samples.at(-1)?.status ?? "unknown",
      lastSampleAt: samples.length
        ? new Date(samples[samples.length - 1].timestamp).toISOString()
        : null,
    };
  }

  getTrend({ windowMs = this.options.windowMs, buckets = 12 } = {}) {
    const now = this.clock();
    const duration = Math.max(1, Number(windowMs) || 1);
    const count = Math.max(1, Math.floor(Number(buckets) || 1));
    const bucketSize = duration / count;
    const cutoff = now - duration;

    const result = Array.from({ length: count }, (_, index) => ({
      index,
      startAt: new Date(cutoff + index * bucketSize).toISOString(),
      endAt: new Date(cutoff + (index + 1) * bucketSize).toISOString(),
      total: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      issues: 0,
    }));

    for (const sample of this.samples) {
      if (sample.timestamp < cutoff || sample.timestamp > now) continue;

      const index = Math.min(
        count - 1,
        Math.floor((sample.timestamp - cutoff) / bucketSize)
      );

      const bucket = result[index];
      bucket.total += 1;
      bucket.issues += sample.issueCount;

      if (sample.status === "healthy") bucket.healthy += 1;
      else if (sample.status === "degraded") bucket.degraded += 1;
      else if (sample.status === "unhealthy") bucket.unhealthy += 1;
    }

    return result;
  }

  getSnapshot() {
    return {
      metrics: this.getMetrics(),
      trend: this.getTrend(),
      retainedSamples: this.samples.length,
      monitoring: this.unsubscribe.length > 0,
    };
  }

  exportData() {
    return {
      version: 1,
      exportedAt: new Date(this.clock()).toISOString(),
      samples: this.samples.map((sample) => ({ ...sample })),
    };
  }

  importData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.samples)) {
      throw new TypeError("Invalid restore health metrics archive.");
    }

    const samples = data.samples
      .filter((sample) =>
        sample &&
        Number.isFinite(sample.timestamp) &&
        typeof sample.status === "string"
      )
      .map((sample) => ({
        timestamp: sample.timestamp,
        status: sample.status,
        healthy: Boolean(sample.healthy),
        issueCount: Math.max(0, Number(sample.issueCount) || 0),
        source: String(sample.source ?? "import"),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-this.options.maxSamples);

    this.samples = samples;

    this.events.emit("metrics:imported", {
      count: samples.length,
      timestamp: this.clock(),
    });

    return samples.length;
  }

  reset() {
    this.samples = [];
    this.events.emit("metrics:reset", {
      timestamp: this.clock(),
    });
  }

  dispose() {
    if (this.disposed) return;

    for (const unsubscribe of this.unsubscribe) {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    }

    this.unsubscribe = [];
    this.disposed = true;

    this.events.emit("metrics:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthMetrics;