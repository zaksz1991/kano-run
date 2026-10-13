const DEFAULT_CONFIG = {
  historyLimit: 1000,
  latencyWindow: 100,
  percentiles: [50, 90, 95, 99],
};

export class RecoveryQueueRecoveryOrchestratorMetrics {
  constructor(orchestrator, options = {}) {
    if (!orchestrator) {
      throw new TypeError("A recovery orchestrator is required.");
    }

    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.events = [];
    this.taskStarts = new Map();
    this.listeners = new Set();
    this.disposed = false;

    this.counters = {
      submitted: 0,
      started: 0,
      recovered: 0,
      failed: 0,
      retried: 0,
      cancelled: 0,
      timedOut: 0,
    };

    this.latencies = [];
    this.typeMetrics = new Map();

    this.unsubscribe =
      typeof orchestrator.subscribe === "function"
        ? orchestrator.subscribe((event) => this.handleEvent(event))
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      details,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryMetrics] Listener error:", error);
      }
    }
  }

  handleEvent(event) {
    if (this.disposed || !event) return;

    const name = event.event || "unknown";
    const task = event.task || null;
    const now = event.timestamp || Date.now();

    this.events.push({
      event: name,
      timestamp: now,
      taskId: task?.id || null,
      taskType: task?.type || null,
    });

    if (this.events.length > this.config.historyLimit) {
      this.events.splice(
        0,
        this.events.length - this.config.historyLimit
      );
    }

    switch (name) {
      case "task:submitted":
        this.counters.submitted += 1;
        break;

      case "task:started":
        this.counters.started += 1;
        if (task?.id) this.taskStarts.set(task.id, now);
        break;

      case "task:recovered":
        this.counters.recovered += 1;
        this.recordLatency(task, now);
        this.updateTypeMetric(task?.type, "recovered");
        break;

      case "task:failed":
        this.counters.failed += 1;
        this.recordLatency(task, now);
        this.updateTypeMetric(task?.type, "failed");
        if (task?.lastError?.name === "TimeoutError") {
          this.counters.timedOut += 1;
        }
        break;

      case "task:retry":
        this.counters.retried += 1;
        this.updateTypeMetric(task?.type, "retried");
        break;

      case "task:cancelled":
        this.counters.cancelled += 1;
        break;

      default:
        break;
    }

    this.emit("metrics_updated", {
      event: name,
      taskId: task?.id || null,
    });
  }

  recordLatency(task, timestamp) {
    if (!task?.id) return;

    const startedAt =
      this.taskStarts.get(task.id) ??
      (Number.isFinite(task.startedAt) ? task.startedAt : null);

    this.taskStarts.delete(task.id);

    if (startedAt === null) return;

    const duration = Math.max(0, timestamp - startedAt);

    this.latencies.push({
      taskId: task.id,
      type: task.type || "unknown",
      duration,
      timestamp,
    });

    if (this.latencies.length > this.config.historyLimit) {
      this.latencies.splice(
        0,
        this.latencies.length - this.config.historyLimit
      );
    }

    this.updateTypeMetric(task.type, "latency", duration);
  }

  updateTypeMetric(type, metric, value = 1) {
    const key = type || "unknown";

    if (!this.typeMetrics.has(key)) {
      this.typeMetrics.set(key, {
        submitted: 0,
        recovered: 0,
        failed: 0,
        retried: 0,
        durations: [],
      });
    }

    const entry = this.typeMetrics.get(key);

    if (metric === "latency") {
      entry.durations.push(value);

      if (entry.durations.length > this.config.latencyWindow) {
        entry.durations.shift();
      }

      return;
    }

    if (Object.hasOwn(entry, metric)) {
      entry[metric] += value;
    }
  }

  percentile(values, percentile) {
    if (!values.length) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  getLatencyStats(values = this.latencies.map((item) => item.duration)) {
    if (!values.length) {
      return {
        count: 0,
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      };
    }

    const total = values.reduce((sum, value) => sum + value, 0);

    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      average: total / values.length,
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }

  getTypeMetrics() {
    const result = {};

    for (const [type, metrics] of this.typeMetrics.entries()) {
      const total = metrics.recovered + metrics.failed;

      result[type] = {
        submitted: metrics.submitted,
        recovered: metrics.recovered,
        failed: metrics.failed,
        retried: metrics.retried,
        successRate:
          total > 0 ? metrics.recovered / total : 1,
        latency: this.getLatencyStats(metrics.durations),
      };
    }

    return result;
  }

  getSummary() {
    const completed = this.counters.recovered + this.counters.failed;
    const orchestratorStats =
      typeof this.orchestrator.getStats === "function"
        ? this.orchestrator.getStats()
        : {};

    return {
      timestamp: Date.now(),
      counters: { ...this.counters },
      successRate:
        completed > 0 ? this.counters.recovered / completed : 1,
      failureRate:
        completed > 0 ? this.counters.failed / completed : 0,
      latency: this.getLatencyStats(),
      byType: this.getTypeMetrics(),
      queue: {
        queued: Number(orchestratorStats.queued) || 0,
        active: Number(orchestratorStats.active) || 0,
        running: Boolean(orchestratorStats.running),
      },
      eventCount: this.events.length,
    };
  }

  getEvents(options = {}) {
    const { event, since, limit = 100 } = options;

    let result = [...this.events];

    if (event) {
      result = result.filter((item) => item.event === event);
    }

    if (Number.isFinite(since)) {
      result = result.filter((item) => item.timestamp >= since);
    }

    return result.slice(-Math.max(0, limit));
  }

  exportSnapshot() {
    return {
      version: 1,
      exportedAt: Date.now(),
      summary: this.getSummary(),
      events: [...this.events],
      latencies: [...this.latencies],
    };
  }

  reset() {
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }

    this.events = [];
    this.latencies = [];
    this.taskStarts.clear();
    this.typeMetrics.clear();

    this.emit("metrics_reset");
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }

    this.listeners.clear();
    this.taskStarts.clear();
  }
}

export default RecoveryQueueRecoveryOrchestratorMetrics;