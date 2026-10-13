const DEFAULT_HISTORY_LIMIT = 200;

export class HealthDashboardAlertDeliveryQueueMonitor {
  constructor({
    queue,
    historyLimit = DEFAULT_HISTORY_LIMIT,
    sampleIntervalMs = 5000,
    clock = () => Date.now(),
  } = {}) {
    if (!queue) {
      throw new Error("An alert delivery queue is required.");
    }

    this.queue = queue;
    this.historyLimit = Math.max(1, Number(historyLimit) || 200);
    this.sampleIntervalMs = Math.max(
      250,
      Number(sampleIntervalMs) || 5000,
    );
    this.clock = clock;

    this.history = [];
    this.startedAt = null;
    this.lastSampleAt = null;
    this.timer = null;
    this.listeners = new Set();
    this.running = false;
    this.lastError = null;
  }

  start({ immediate = true } = {}) {
    if (this.running) {
      return this.getStatus();
    }

    this.running = true;
    this.startedAt = this.clock();
    this.lastError = null;

    if (immediate) {
      this.sample();
    }

    this.timer = setInterval(
      () => this.sample(),
      this.sampleIntervalMs,
    );

    return this.getStatus();
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;

    this.#emit({
      type: "monitor_stopped",
      timestamp: this.clock(),
    });

    return this.getStatus();
  }

  sample() {
    try {
      const jobs = this.queue.getJobs?.() ?? [];
      const queueStatus = this.queue.getStatus?.() ?? {};

      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        unknown: 0,
      };

      for (const job of jobs) {
        const status = String(job.status ?? "unknown");

        if (Object.hasOwn(counts, status)) {
          counts[status] += 1;
        } else {
          counts.unknown += 1;
        }
      }

      const timestamp = this.clock();

      const snapshot = {
        timestamp,
        isoTime: new Date(timestamp).toISOString(),
        totalJobs: jobs.length,
        counts,
        pendingJobs: counts.pending,
        processingJobs: counts.processing,
        completedJobs: counts.completed,
        failedJobs: counts.failed,
        successRate: this.#successRate(counts),
        queueStatus,
      };

      this.history.push(snapshot);

      if (this.history.length > this.historyLimit) {
        this.history.splice(
          0,
          this.history.length - this.historyLimit,
        );
      }

      this.lastSampleAt = timestamp;
      this.lastError = null;

      this.#emit({
        type: "sample",
        snapshot,
      });

      return snapshot;
    } catch (error) {
      this.lastError = error.message;

      this.#emit({
        type: "monitor_error",
        error: error.message,
        timestamp: this.clock(),
      });

      return null;
    }
  }

  getLatest() {
    return this.history.at(-1) ?? null;
  }

  getHistory({ limit = this.historyLimit } = {}) {
    const safeLimit = Math.max(1, Number(limit) || this.historyLimit);
    return this.history.slice(-safeLimit);
  }

  getStatus() {
    return {
      running: this.running,
      startedAt: this.startedAt,
      lastSampleAt: this.lastSampleAt,
      sampleIntervalMs: this.sampleIntervalMs,
      historyCount: this.history.length,
      historyLimit: this.historyLimit,
      lastError: this.lastError,
      latest: this.getLatest(),
    };
  }

  getSummary() {
    const latest = this.getLatest();

    if (!latest) {
      return {
        available: false,
        message: "No monitoring samples collected.",
      };
    }

    const elapsedMs =
      this.history.length > 1
        ? latest.timestamp - this.history[0].timestamp
        : 0;

    return {
      available: true,
      sampleCount: this.history.length,
      elapsedMs,
      latest: {
        totalJobs: latest.totalJobs,
        pending: latest.pendingJobs,
        processing: latest.processingJobs,
        completed: latest.completedJobs,
        failed: latest.failedJobs,
        successRate: latest.successRate,
      },
      running: this.running,
      lastError: this.lastError,
    };
  }

  exportHistory() {
    return {
      version: 1,
      exportedAt: new Date(this.clock()).toISOString(),
      status: this.getStatus(),
      history: this.getHistory(),
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  clearHistory() {
    this.history = [];
    this.lastSampleAt = null;

    this.#emit({
      type: "history_cleared",
      timestamp: this.clock(),
    });
  }

  destroy() {
    this.stop();
    this.listeners.clear();
  }

  #successRate(counts) {
    const finished = counts.completed + counts.failed;

    if (finished === 0) {
      return 100;
    }

    return Number(
      ((counts.completed / finished) * 100).toFixed(2),
    );
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // One listener must not interrupt the remaining listeners.
      }
    }
  }
}

export default HealthDashboardAlertDeliveryQueueMonitor;