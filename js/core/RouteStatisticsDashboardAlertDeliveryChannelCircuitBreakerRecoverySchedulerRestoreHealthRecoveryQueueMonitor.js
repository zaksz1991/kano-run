const DEFAULT_CONFIG = Object.freeze({
  sampleIntervalMs: 5_000,
  historyLimit: 240,
  warningQueueDepth: 100,
  criticalQueueDepth: 300,
  warningFailureRate: 0.1,
  criticalFailureRate: 0.3,
  staleJobThresholdMs: 60_000,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueMonitor {
  constructor(queue, options = {}) {
    if (!queue) {
      throw new TypeError("A recovery queue instance is required.");
    }

    this.queue = queue;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    this.history = [];
    this.listeners = new Set();
    this.timer = null;
    this.started = false;
    this.destroyed = false;
    this.lastSnapshot = null;

    this.stats = {
      samples: 0,
      warnings: 0,
      criticalAlerts: 0,
      staleJobs: 0,
      lastSampleAt: null,
    };

    this.onAlert =
      typeof options.onAlert === "function"
        ? options.onAlert
        : () => {};
  }

  start() {
    this.#assertActive();

    if (this.started) {
      return this.getSnapshot();
    }

    this.started = true;
    this.sample();

    this.timer = setInterval(() => {
      this.sample();
    }, this.config.sampleIntervalMs);

    return this.getSnapshot();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;

    return this.getSnapshot();
  }

  sample() {
    this.#assertActive();

    const queueStats = this.queue.getStats();
    const jobs = this.queue.getJobs();
    const now = Date.now();

    const totalFinished =
      queueStats.completed + queueStats.failed;

    const failureRate =
      totalFinished > 0
        ? queueStats.failed / totalFinished
        : 0;

    const staleJobs = jobs.filter((job) => {
      if (job.status !== "running" || !job.startedAt) {
        return false;
      }

      return (
        now - job.startedAt >
        this.config.staleJobThresholdMs
      );
    });

    const snapshot = {
      timestamp: now,
      queue: queueStats,
      failureRate,
      staleJobCount: staleJobs.length,
      staleJobIds: staleJobs.map((job) => job.id),
      health: this.#calculateHealth(
        queueStats,
        failureRate,
        staleJobs.length
      ),
    };

    this.history.push(snapshot);

    if (this.history.length > this.config.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.config.historyLimit
      );
    }

    this.stats.samples += 1;
    this.stats.lastSampleAt = now;
    this.stats.staleJobs = staleJobs.length;

    this.#checkAlerts(snapshot);

    this.lastSnapshot = snapshot;
    this.#notify(snapshot);

    return snapshot;
  }

  #calculateHealth(queueStats, failureRate, staleJobCount) {
    if (
      queueStats.queued >= this.config.criticalQueueDepth ||
      failureRate >= this.config.criticalFailureRate ||
      staleJobCount > 0
    ) {
      return "critical";
    }

    if (
      queueStats.queued >= this.config.warningQueueDepth ||
      failureRate >= this.config.warningFailureRate
    ) {
      return "warning";
    }

    return "healthy";
  }

  #checkAlerts(snapshot) {
    const alerts = [];

    if (
      snapshot.queue.queued >=
      this.config.criticalQueueDepth
    ) {
      alerts.push({
        level: "critical",
        code: "QUEUE_DEPTH_CRITICAL",
        message: "Recovery queue depth has reached the critical threshold.",
        value: snapshot.queue.queued,
      });
    } else if (
      snapshot.queue.queued >=
      this.config.warningQueueDepth
    ) {
      alerts.push({
        level: "warning",
        code: "QUEUE_DEPTH_HIGH",
        message: "Recovery queue depth is elevated.",
        value: snapshot.queue.queued,
      });
    }

    if (
      snapshot.failureRate >=
      this.config.criticalFailureRate
    ) {
      alerts.push({
        level: "critical",
        code: "FAILURE_RATE_CRITICAL",
        message: "Recovery job failure rate is critical.",
        value: snapshot.failureRate,
      });
    } else if (
      snapshot.failureRate >=
      this.config.warningFailureRate
    ) {
      alerts.push({
        level: "warning",
        code: "FAILURE_RATE_HIGH",
        message: "Recovery job failure rate is elevated.",
        value: snapshot.failureRate,
      });
    }

    if (snapshot.staleJobCount > 0) {
      alerts.push({
        level: "critical",
        code: "STALE_RECOVERY_JOBS",
        message: "One or more recovery jobs may be stalled.",
        value: snapshot.staleJobCount,
        jobIds: snapshot.staleJobIds,
      });
    }

    for (const alert of alerts) {
      if (alert.level === "critical") {
        this.stats.criticalAlerts += 1;
      } else {
        this.stats.warnings += 1;
      }

      try {
        this.onAlert({
          ...alert,
          timestamp: snapshot.timestamp,
        });
      } catch {
        // Alert handlers must not interrupt monitoring.
      }
    }
  }

  subscribe(listener) {
    this.#assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    if (this.lastSnapshot) {
      listener(this.lastSnapshot);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  #notify(snapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // One listener must not block other listeners.
      }
    }
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  getHistory(options = {}) {
    const limit = Number.isInteger(options.limit)
      ? Math.max(0, options.limit)
      : this.history.length;

    return this.history.slice(-limit);
  }

  getSummary() {
    const current = this.lastSnapshot;

    return {
      started: this.started,
      health: current?.health ?? "unknown",
      currentQueueDepth: current?.queue.queued ?? 0,
      activeJobs: current?.queue.active ?? 0,
      failureRate: current?.failureRate ?? 0,
      staleJobCount: current?.staleJobCount ?? 0,
      samples: this.stats.samples,
      warnings: this.stats.warnings,
      criticalAlerts: this.stats.criticalAlerts,
      lastSampleAt: this.stats.lastSampleAt,
    };
  }

  resetHistory() {
    this.history = [];

    this.stats.samples = 0;
    this.stats.warnings = 0;
    this.stats.criticalAlerts = 0;
    this.stats.staleJobs = 0;
    this.stats.lastSampleAt = null;

    this.lastSnapshot = null;

    return true;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.stop();
    this.listeners.clear();
    this.history = [];
    this.lastSnapshot = null;
    this.destroyed = true;
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery queue monitor has been destroyed.");
    }
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueMonitor;