import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const DEFAULT_INTERVAL_MS = 5000;

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreMonitor {
  constructor({
    restoreManager = null,
    metrics = null,
    history = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    logger = Logger,
    autoStart = false,
  } = {}) {
    this.restoreManager = restoreManager;
    this.metrics = metrics;
    this.history = history;
    this.intervalMs = Math.max(250, Number(intervalMs) || DEFAULT_INTERVAL_MS);
    this.logger = logger;

    this.events = new EventEmitter();
    this.timer = null;
    this.running = false;
    this.disposed = false;
    this.lastSnapshot = null;
    this.lastCheckAt = null;
    this.checkCount = 0;

    if (autoStart) this.start();
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

  start() {
    this.assertActive();

    if (this.running) return false;

    this.running = true;
    this.timer = setInterval(() => {
      this.check();
    }, this.intervalMs);

    this.timer?.unref?.();

    this.emit("started", {
      intervalMs: this.intervalMs,
    });

    this.check();

    return true;
  }

  stop() {
    if (!this.running) return false;

    this.running = false;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit("stopped");

    return true;
  }

  check() {
    this.assertActive();

    const now = Date.now();
    const restoreStatus = this.readRestoreStatus();
    const metricsStatus = this.readMetricsStatus();
    const historyStatus = this.readHistoryStatus();

    const snapshot = {
      timestamp: now,
      restore: restoreStatus,
      metrics: metricsStatus,
      history: historyStatus,
      health: this.evaluateHealth({
        restoreStatus,
        metricsStatus,
        historyStatus,
      }),
    };

    this.checkCount += 1;
    this.lastCheckAt = now;

    const previousHealth = this.lastSnapshot?.health?.status ?? null;
    this.lastSnapshot = snapshot;

    this.emit("snapshot", {
      snapshot: this.getSnapshot(),
    });

    if (snapshot.health.status !== previousHealth) {
      this.emit("health-changed", {
        previousStatus: previousHealth,
        status: snapshot.health.status,
        health: { ...snapshot.health },
      });
    }

    return this.getSnapshot();
  }

  readRestoreStatus() {
    if (!this.restoreManager) {
      return {
        available: false,
        restoring: false,
        lastResult: null,
      };
    }

    try {
      const status = this.restoreManager.getStatus?.() ?? {};

      return {
        available: true,
        restoring: Boolean(status.restoring),
        lastResult: status.lastResult ?? null,
        disposed: Boolean(status.disposed),
      };
    } catch (error) {
      return {
        available: true,
        error: error?.message ?? String(error),
      };
    }
  }

  readMetricsStatus() {
    if (!this.metrics) {
      return {
        available: false,
      };
    }

    try {
      const summary = this.metrics.getSummary?.() ?? {};

      return {
        available: true,
        sampleCount: Number(summary.sampleCount) || 0,
        successRate: summary.successRate ?? null,
        failureRate: summary.failureRate ?? null,
        lastError: summary.lastError ?? null,
      };
    } catch (error) {
      return {
        available: true,
        error: error?.message ?? String(error),
      };
    }
  }

  readHistoryStatus() {
    if (!this.history) {
      return {
        available: false,
        entryCount: 0,
      };
    }

    try {
      const status = this.history.getStatus?.() ?? {};
      const summary = this.history.getSummary?.() ?? {};

      return {
        available: true,
        entryCount: Number(status.entryCount ?? summary.total) || 0,
        lastError: status.lastError ?? null,
      };
    } catch (error) {
      return {
        available: true,
        error: error?.message ?? String(error),
      };
    }
  }

  evaluateHealth({ restoreStatus, metricsStatus, historyStatus }) {
    const reasons = [];

    if (restoreStatus.error) {
      reasons.push("Unable to read restore manager status.");
    }

    if (metricsStatus.error) {
      reasons.push("Unable to read restore metrics.");
    }

    if (historyStatus.error) {
      reasons.push("Unable to read restore history.");
    }

    if (
      restoreStatus.disposed ||
      metricsStatus.disposed
    ) {
      reasons.push("A monitored component has been disposed.");
    }

    if (restoreStatus.restoring) {
      reasons.push("A restore operation is currently running.");
    }

    if (metricsStatus.failureRate !== null && metricsStatus.failureRate >= 0.5) {
      reasons.push("At least half of the recorded restore attempts failed.");
    }

    if (metricsStatus.lastError) {
      reasons.push("The latest restore operation reported an error.");
    }

    let status = "healthy";

    if (reasons.some((reason) => reason.includes("disposed"))) {
      status = "unavailable";
    } else if (reasons.length > 0) {
      status = "degraded";
    }

    return {
      status,
      healthy: status === "healthy",
      reasons,
      evaluatedAt: Date.now(),
    };
  }

  getSnapshot() {
    if (!this.lastSnapshot) return null;

    return JSON.parse(JSON.stringify(this.lastSnapshot));
  }

  getStatus() {
    return {
      running: this.running,
      disposed: this.disposed,
      intervalMs: this.intervalMs,
      checkCount: this.checkCount,
      lastCheckAt: this.lastCheckAt,
      health: this.lastSnapshot?.health ?? null,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore monitor has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.stop();
    this.disposed = true;
    this.events.removeAllListeners?.();

    this.logger?.info?.(
      "[SchedulerRestoreMonitor] Disposed.",
    );
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreMonitor;