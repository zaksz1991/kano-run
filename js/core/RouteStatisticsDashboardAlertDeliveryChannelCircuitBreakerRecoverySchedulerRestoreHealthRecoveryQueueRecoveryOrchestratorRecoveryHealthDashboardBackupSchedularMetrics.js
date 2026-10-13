import RecoveryHealthDashboardBackupScheduler from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupScheduler.js";
import RecoveryHealthDashboardBackupSchedulerMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerMonitor.js";

const DEFAULT_OPTIONS = {
  historyLimit: 500,
  windowMs: 24 * 60 * 60 * 1000,
};

export class RecoveryHealthDashboardBackupSchedulerMetrics {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.scheduler =
      options.scheduler ||
      new RecoveryHealthDashboardBackupScheduler({
        ...options.schedulerOptions,
        enabled: false,
      });

    this.monitor =
      options.monitor ||
      new RecoveryHealthDashboardBackupSchedulerMonitor({
        ...options.monitorOptions,
        scheduler: this.scheduler,
      });

    this.history = [];
    this.listeners = new Set();
    this.disposed = false;

    this.unsubscribeMonitor =
      typeof this.monitor.subscribe === "function"
        ? this.monitor.subscribe((event) =>
            this._handleEvent(event)
          )
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Metrics listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event, detail = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors must not affect metrics collection.
      }
    }
  }

  _handleEvent(event) {
    if (!event || typeof event !== "object") return;

    if (event.event !== "sample-recorded" || !event.sample) {
      return;
    }

    const sample = event.sample;

    this.history.push({
      type: sample.type,
      timestamp: sample.timestamp || event.timestamp,
      source: sample.source || null,
      error: sample.error || null,
    });

    const limit = Math.max(
      1,
      Number(this.options.historyLimit) || 500
    );

    if (this.history.length > limit) {
      this.history.splice(
        0,
        this.history.length - limit
      );
    }

    this._emit("metric-recorded", {
      type: sample.type,
      timestamp: sample.timestamp || event.timestamp,
    });
  }

  _eventsInWindow(windowMs = this.options.windowMs) {
    const cutoff = Date.now() - Math.max(1, windowMs);

    return this.history.filter((entry) => {
      const timestamp = Date.parse(entry.timestamp);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
  }

  getMetrics(options = {}) {
    const events = this._eventsInWindow(
      Number(options.windowMs) || this.options.windowMs
    );

    const count = (type) =>
      events.filter((entry) => entry.type === type).length;

    const started = count("run-started");
    const completed = count("run-completed");
    const failed = count("run-failed");

    const totalFinished = completed + failed;
    const successRate =
      totalFinished > 0
        ? Number(((completed / totalFinished) * 100).toFixed(2))
        : null;

    const schedulerStatus =
      typeof this.scheduler.getStatus === "function"
        ? this.scheduler.getStatus()
        : null;

    const monitorStatus =
      typeof this.monitor.getStatus === "function"
        ? this.monitor.getStatus()
        : null;

    const backupStatus =
      schedulerStatus?.backupStatus || null;

    return {
      generatedAt: new Date().toISOString(),
      windowMs:
        Number(options.windowMs) || this.options.windowMs,
      runs: {
        started,
        completed,
        failed,
        totalFinished,
        successRatePercent: successRate,
      },
      alerts: {
        total: monitorStatus?.totalAlerts ?? 0,
        consecutiveFailures:
          monitorStatus?.consecutiveFailures ?? 0,
      },
      backups: {
        total: backupStatus?.backupCount ?? 0,
        lastBackupAt: backupStatus?.lastBackupAt ?? null,
      },
      scheduler: {
        running: schedulerStatus?.running ?? false,
        scheduled: schedulerStatus?.scheduled ?? false,
        lastRunAt: schedulerStatus?.lastRunAt ?? null,
        nextRunAt: schedulerStatus?.nextRunAt ?? null,
      },
      collection: {
        retainedEvents: this.history.length,
        eventsInWindow: events.length,
      },
    };
  }

  getTimeSeries(options = {}) {
    const bucketMs = Math.max(
      1_000,
      Number(options.bucketMs) || 60_000
    );

    const windowMs = Math.max(
      bucketMs,
      Number(options.windowMs) || this.options.windowMs
    );

    const start = Date.now() - windowMs;
    const buckets = new Map();

    for (const event of this._eventsInWindow(windowMs)) {
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp)) continue;

      const bucketStart =
        start +
        Math.floor((timestamp - start) / bucketMs) * bucketMs;

      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, {
          timestamp: new Date(bucketStart).toISOString(),
          started: 0,
          completed: 0,
          failed: 0,
        });
      }

      const bucket = buckets.get(bucketStart);

      if (event.type === "run-started") bucket.started += 1;
      if (event.type === "run-completed") bucket.completed += 1;
      if (event.type === "run-failed") bucket.failed += 1;
    }

    return [...buckets.values()].sort(
      (a, b) =>
        Date.parse(a.timestamp) - Date.parse(b.timestamp)
    );
  }

  reset() {
    const removed = this.history.length;
    this.history = [];

    this._emit("metrics-reset", { removed });

    return removed;
  }

  getStatus() {
    return {
      disposed: this.disposed,
      retainedEvents: this.history.length,
      historyLimit: this.options.historyLimit,
      windowMs: this.options.windowMs,
    };
  }

  dispose() {
    if (this.disposed) return;

    if (typeof this.unsubscribeMonitor === "function") {
      this.unsubscribeMonitor();
      this.unsubscribeMonitor = null;
    }

    if (this.options.disposeMonitor === true) {
      this.monitor.dispose?.();
    }

    if (this.options.disposeScheduler === true) {
      this.scheduler.dispose?.();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerMetrics;