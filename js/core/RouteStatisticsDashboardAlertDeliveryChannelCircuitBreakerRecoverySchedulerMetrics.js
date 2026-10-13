import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  historyLimit: 1000,
  latencyBuckets: [50, 100, 250, 500, 1000, 2500, 5000],
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMetrics {
  constructor({
    registry,
    monitor = null,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!registry) {
      throw new TypeError("A recovery scheduler registry is required.");
    }

    this.registry = registry;
    this.monitor = monitor;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.disposed = false;
    this.history = [];
    this.counters = this.createCounters();
    this.schedulerMetrics = new Map();
    this.lastCollectionAt = null;
    this.lastSnapshot = null;
  }

  createCounters() {
    return {
      collections: 0,
      collectionFailures: 0,
      observedRuns: 0,
      observedFailures: 0,
      schedulerRegistrations: 0,
      schedulerRemovals: 0,
      recoveredSchedulers: 0,
      stalledSchedulers: 0,
    };
  }

  collect() {
    this.assertActive();

    const collectedAt = this.clock();
    this.counters.collections += 1;

    let entries;

    try {
      entries = this.registry.getStatuses();
    } catch (error) {
      this.counters.collectionFailures += 1;

      this.emit("collection-failed", {
        at: collectedAt,
        error: this.serializeError(error),
      });

      throw error;
    }

    if (!Array.isArray(entries)) {
      this.counters.collectionFailures += 1;
      throw new TypeError("Registry getStatuses() must return an array.");
    }

    const currentIds = new Set();
    const schedulers = [];

    let running = 0;
    let stopped = 0;
    let disposed = 0;
    let totalRuns = 0;
    let totalFailures = 0;
    let pendingRetries = 0;
    let stalled = 0;

    for (const entry of entries) {
      const id = String(entry.id);
      const status = entry.status ?? {};

      currentIds.add(id);

      const previous = this.schedulerMetrics.get(id);
      const runCount = this.toNumber(status.runCount);
      const failureCount = this.toNumber(status.failureCount);
      const isRunning = status.running === true;
      const isDisposed = status.disposed === true;

      const runDelta = previous
        ? Math.max(0, runCount - previous.runCount)
        : runCount;

      const failureDelta = previous
        ? Math.max(0, failureCount - previous.failureCount)
        : failureCount;

      const lastRunAt = this.toTimestamp(status.lastRunAt);
      const nextRunAt = this.toTimestamp(status.nextRunAt);

      const isStalled =
        isRunning &&
        lastRunAt !== null &&
        collectedAt - lastRunAt >
          (this.config.staleAfterMs ?? 120000) &&
        nextRunAt !== null &&
        nextRunAt < collectedAt;

      const metrics = {
        id,
        running: isRunning,
        disposed: isDisposed,
        runCount,
        failureCount,
        runDelta,
        failureDelta,
        pendingRetries: Array.isArray(status.pendingRetries)
          ? status.pendingRetries.length
          : 0,
        lastRunAt,
        nextRunAt,
        stalled: isStalled,
        lastObservedAt: collectedAt,
      };

      this.schedulerMetrics.set(id, metrics);
      schedulers.push(metrics);

      totalRuns += runCount;
      totalFailures += failureCount;
      pendingRetries += metrics.pendingRetries;

      if (isRunning) running += 1;
      else stopped += 1;

      if (isDisposed) disposed += 1;
      if (isStalled) stalled += 1;

      this.counters.observedRuns += runDelta;
      this.counters.observedFailures += failureDelta;

      if (isStalled && !previous?.stalled) {
        this.counters.stalledSchedulers += 1;

        this.emit("scheduler-stalled", {
          id,
          at: collectedAt,
          lastRunAt,
          nextRunAt,
        });
      }

      if (
        previous &&
        previous.runCount < runCount &&
        status.lastResult &&
        (
          status.lastResult.recovered === true ||
          status.lastResult.status === "recovered"
        )
      ) {
        this.counters.recoveredSchedulers += 1;

        this.emit("scheduler-recovered", {
          id,
          at: collectedAt,
          runCount,
        });
      }
    }

    for (const id of this.schedulerMetrics.keys()) {
      if (!currentIds.has(id)) {
        this.schedulerMetrics.delete(id);
        this.counters.schedulerRemovals += 1;

        this.emit("scheduler-removed", {
          id,
          at: collectedAt,
        });
      }
    }

    const monitorStatus = this.getMonitorMetrics();

    const snapshot = {
      collectedAt,
      schedulerCount: schedulers.length,
      running,
      stopped,
      disposed,
      stalled,
      totalRuns,
      totalFailures,
      pendingRetries,
      failureRate: totalRuns > 0
        ? totalFailures / totalRuns
        : 0,
      monitor: monitorStatus,
      counters: { ...this.counters },
      schedulers,
    };

    this.lastCollectionAt = collectedAt;
    this.lastSnapshot = snapshot;

    this.addHistory({
      collectedAt,
      schedulerCount: snapshot.schedulerCount,
      running,
      stopped,
      stalled,
      totalRuns,
      totalFailures,
      pendingRetries,
      failureRate: snapshot.failureRate,
    });

    this.emit("collected", snapshot);

    return snapshot;
  }

  getMonitorMetrics() {
    if (!this.monitor) {
      return null;
    }

    try {
      const status = this.monitor.getSnapshot?.();

      if (!status) {
        return null;
      }

      return {
        running: status.running === true,
        checkCount: this.toNumber(status.checkCount),
        lastCheckAt: this.toTimestamp(status.lastCheckAt),
        alertCount: Array.isArray(status.alerts)
          ? status.alerts.length
          : 0,
      };
    } catch (error) {
      this.log("warn", "Unable to collect monitor metrics.", {
        error: this.serializeError(error),
      });

      return {
        available: false,
        error: this.serializeError(error),
      };
    }
  }

  getSchedulerMetrics(id) {
    return this.schedulerMetrics.get(String(id)) ?? null;
  }

  getAllSchedulerMetrics() {
    return [...this.schedulerMetrics.values()];
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  getCounters() {
    return { ...this.counters };
  }

  getHistory({ limit = 50 } = {}) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) {
      return [];
    }

    return this.history.slice(-count);
  }

  getSummary() {
    const snapshot = this.lastSnapshot;

    if (!snapshot) {
      return {
        status: "unknown",
        message: "Metrics have not been collected.",
        counters: this.getCounters(),
      };
    }

    return {
      status: snapshot.stalled > 0
        ? "unhealthy"
        : snapshot.stopped > 0 || snapshot.disposed > 0
          ? "degraded"
          : "healthy",
      collectedAt: snapshot.collectedAt,
      schedulerCount: snapshot.schedulerCount,
      running: snapshot.running,
      stopped: snapshot.stopped,
      stalled: snapshot.stalled,
      totalRuns: snapshot.totalRuns,
      totalFailures: snapshot.totalFailures,
      pendingRetries: snapshot.pendingRetries,
      failureRate: snapshot.failureRate,
      counters: this.getCounters(),
    };
  }

  resetCounters() {
    this.assertActive();

    this.counters = this.createCounters();

    this.emit("counters-reset", {
      at: this.clock(),
    });

    return this.getCounters();
  }

  resetHistory() {
    this.assertActive();

    const removed = this.history.length;
    this.history.length = 0;

    this.emit("history-reset", {
      at: this.clock(),
      removed,
    });

    return removed;
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      exportedAt: this.clock(),
      counters: this.getCounters(),
      history: this.getHistory({
        limit: this.config.historyLimit,
      }),
      schedulers: this.getAllSchedulerMetrics(),
      lastCollectionAt: this.lastCollectionAt,
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || typeof data !== "object") {
      throw new TypeError("Metrics import data must be an object.");
    }

    if (data.version !== 1) {
      throw new Error("Unsupported metrics data version.");
    }

    if (!Array.isArray(data.history) || !Array.isArray(data.schedulers)) {
      throw new TypeError("Invalid metrics history or scheduler data.");
    }

    const importedHistory = data.history
      .slice(-this.config.historyLimit)
      .filter((item) => item && typeof item === "object");

    const importedSchedulers = data.schedulers
      .filter((item) => item && item.id != null)
      .map((item) => [String(item.id), { ...item }]);

    if (replace) {
      this.history = importedHistory;
      this.schedulerMetrics = new Map(importedSchedulers);
      this.counters = {
        ...this.createCounters(),
        ...(data.counters ?? {}),
      };
    } else {
      this.history.push(...importedHistory);

      if (this.history.length > this.config.historyLimit) {
        this.history.splice(
          0,
          this.history.length - this.config.historyLimit,
        );
      }

      for (const [id, metrics] of importedSchedulers) {
        this.schedulerMetrics.set(id, metrics);
      }

      for (const [key, value] of Object.entries(data.counters ?? {})) {
        if (key in this.counters && Number.isFinite(Number(value))) {
          this.counters[key] += Number(value);
        }
      }
    }

    this.lastCollectionAt = this.toTimestamp(data.lastCollectionAt);

    this.emit("data-imported", {
      at: this.clock(),
      schedulerCount: importedSchedulers.length,
      historyCount: importedHistory.length,
      replace,
    });

    return this.exportData();
  }

  addHistory(entry) {
    this.history.push(entry);

    const overflow = this.history.length - this.config.historyLimit;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }
  }

  toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  toTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-metrics:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit metrics event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Metrics collection must not fail because logging failed.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMetrics has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.history.length = 0;
    this.schedulerMetrics.clear();
    this.lastSnapshot = null;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMetrics;