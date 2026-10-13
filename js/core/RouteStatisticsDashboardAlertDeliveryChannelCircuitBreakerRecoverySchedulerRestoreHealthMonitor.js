import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  intervalMs: 30_000,
  maxSamples: 200,
  unhealthyThreshold: 3,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthMonitor {
  constructor({
    health = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.health = health;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.samples = [];
    this.timer = null;
    this.running = false;
    this.disposed = false;
    this.consecutiveUnhealthy = 0;
    this.lastStatus = "unknown";
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  start({ immediate = true } = {}) {
    if (this.disposed) {
      throw new Error("Restore health monitor has been disposed.");
    }

    if (this.running) return false;

    this.running = true;
    this.events.emit("monitor:started", {
      timestamp: this.clock(),
    });

    if (immediate) this.poll();

    this.timer = setInterval(() => {
      this.poll();
    }, Math.max(1000, this.options.intervalMs));

    return true;
  }

  poll() {
    if (this.disposed || !this.running) return null;

    let result;

    try {
      if (!this.health || typeof this.health.check !== "function") {
        throw new Error("Restore health checker is unavailable.");
      }

      result = this.health.check();
    } catch (error) {
      result = {
        status: "unhealthy",
        healthy: false,
        issues: [{
          code: "HEALTH_CHECK_FAILED",
          message: error instanceof Error
            ? error.message
            : String(error),
        }],
      };
    }

    const sample = {
      timestamp: this.clock(),
      status: result.status ?? (result.healthy ? "healthy" : "unhealthy"),
      healthy: Boolean(result.healthy),
      issueCount: Number(result.issueCount ?? result.issues?.length ?? 0),
      issues: Array.isArray(result.issues)
        ? result.issues.map((issue) => ({ ...issue }))
        : [],
    };

    this.samples.push(sample);

    if (this.samples.length > this.options.maxSamples) {
      this.samples.splice(
        0,
        this.samples.length - this.options.maxSamples
      );
    }

    if (sample.status === "unhealthy") {
      this.consecutiveUnhealthy += 1;
    } else {
      this.consecutiveUnhealthy = 0;
    }

    if (sample.status !== this.lastStatus) {
      this.events.emit("monitor:status-changed", {
        previous: this.lastStatus,
        current: sample.status,
        sample,
      });

      this.lastStatus = sample.status;
    }

    this.events.emit("monitor:sample", sample);

    if (
      this.consecutiveUnhealthy >=
      this.options.unhealthyThreshold
    ) {
      this.events.emit("monitor:threshold-exceeded", {
        consecutiveUnhealthy: this.consecutiveUnhealthy,
        threshold: this.options.unhealthyThreshold,
        sample,
      });
    }

    return sample;
  }

  stop() {
    if (!this.running) return false;

    this.running = false;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.events.emit("monitor:stopped", {
      timestamp: this.clock(),
    });

    return true;
  }

  getSnapshot() {
    const latest = this.samples[this.samples.length - 1] ?? null;

    return {
      running: this.running,
      status: latest?.status ?? "unknown",
      healthy: latest?.healthy ?? null,
      consecutiveUnhealthy: this.consecutiveUnhealthy,
      sampleCount: this.samples.length,
      lastSampleAt: latest
        ? new Date(latest.timestamp).toISOString()
        : null,
      latest,
    };
  }

  getHistory(limit = 50) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    return this.samples.slice(-count).map((sample) => ({
      ...sample,
      issues: sample.issues.map((issue) => ({ ...issue })),
    }));
  }

  reset() {
    this.samples = [];
    this.consecutiveUnhealthy = 0;
    this.lastStatus = "unknown";

    this.events.emit("monitor:reset", {
      timestamp: this.clock(),
    });
  }

  dispose() {
    if (this.disposed) return;

    this.stop();
    this.disposed = true;

    this.events.emit("monitor:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthMonitor;