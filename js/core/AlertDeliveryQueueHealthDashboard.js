import { AlertDeliveryQueueHealth } from "./AlertDeliveryQueueHealth.js";
import { AlertDeliveryQueueHealthReport } from "./AlertDeliveryQueueHealthReport.js";
import { AlertDeliveryQueueHealthAnalytics } from "./AlertDeliveryQueueHealthAnalytics.js";
import { AlertDeliveryQueueHealthNotifications } from "./AlertDeliveryQueueHealthNotifications.js";
import { AlertDeliveryQueueHealthStore } from "./AlertDeliveryQueueHealthStore.js";

export class AlertDeliveryQueueHealthDashboard {
  constructor({
    queue,
    monitor = null,
    recovery = null,
    storage = globalThis.localStorage,
    notify = null,
    storageKey = "kanoRun.alertQueueHealth",
    checkIntervalMs = 10000,
    historyLimit = 200,
    clock = () => Date.now(),
  } = {}) {
    if (!queue) {
      throw new Error("An alert delivery queue is required.");
    }

    this.clock = clock;
    this.checkIntervalMs = Math.max(
      1000,
      Number(checkIntervalMs) || 10000,
    );

    this.health = new AlertDeliveryQueueHealth({
      queue,
      monitor,
      recovery,
      historyLimit,
      clock,
    });

    this.store = new AlertDeliveryQueueHealthStore({
      storage,
      storageKey,
      maxRecords: historyLimit,
      clock,
    });

    this.reporter = new AlertDeliveryQueueHealthReport({
      health: this.health,
      historyLimit,
      clock,
    });

    this.analytics = new AlertDeliveryQueueHealthAnalytics({
      store: this.store,
      clock,
    });

    this.notifications = new AlertDeliveryQueueHealthNotifications({
      health: this.health,
      notify,
      clock,
    });

    this.timer = null;
    this.running = false;
    this.lastResult = null;
    this.listeners = new Set();
    this.unsubscribers = [];
  }

  start({ immediate = true } = {}) {
    if (this.running) {
      return this.getStatus();
    }

    this.store.load();
    this.notifications.start();

    this.unsubscribers.push(
      this.health.subscribe((event) => {
        if (event.type !== "health_check") return;

        const result = event.health;
        this.lastResult = result;

        this.store.add({
          id: `health-${result.timestamp}`,
          checkedAt: result.checkedAt,
          status: result.status,
          totalJobs: result.totalJobs,
          counts: result.counts,
          issues: result.issues,
          components: result.components,
        });

        this.#emit({
          type: "health_updated",
          health: result,
        });
      }),
    );

    this.running = true;

    if (immediate) {
      this.check();
    }

    this.timer = setInterval(
      () => this.check(),
      this.checkIntervalMs,
    );

    this.#emit({
      type: "dashboard_started",
      timestamp: this.clock(),
    });

    return this.getStatus();
  }

  check() {
    const result = this.health.check();
    this.lastResult = result;
    return result;
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Continue stopping remaining subscriptions.
      }
    }

    this.unsubscribers = [];
    this.notifications.stop();
    this.running = false;

    this.#emit({
      type: "dashboard_stopped",
      timestamp: this.clock(),
    });

    return this.getStatus();
  }

  getDashboardData() {
    return {
      generatedAt: new Date(this.clock()).toISOString(),
      status: this.lastResult?.status ?? "unknown",
      health: this.lastResult,
      summary: this.health.getSummary(),
      analytics: this.analytics.analyze(),
      notifications: this.notifications.getNotifications({
        limit: 20,
      }),
      notificationStatus: this.notifications.getStatus(),
    };
  }

  generateReport(options = {}) {
    return this.reporter.generate(options);
  }

  exportReportJSON(options = {}) {
    return this.reporter.exportJSON(options);
  }

  exportReportCSV() {
    return this.reporter.exportCSV();
  }

  getStatus() {
    return {
      running: this.running,
      checkIntervalMs: this.checkIntervalMs,
      lastCheckedAt: this.lastResult?.checkedAt ?? null,
      healthStatus: this.lastResult?.status ?? "unknown",
      notificationStatus: this.notifications.getStatus(),
      storeSummary: this.store.getSummary(),
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clearHistory() {
    this.health.clearHistory();
    this.store.clear();
    this.reporter.clearReports();
    this.notifications.clearHistory();

    this.lastResult = null;

    this.#emit({
      type: "dashboard_history_cleared",
      timestamp: this.clock(),
    });
  }

  destroy() {
    this.stop();
    this.health.destroy();
    this.store.destroy();
    this.notifications.destroy();
    this.reporter = null;
    this.analytics = null;
    this.listeners.clear();
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not interrupt dashboard operations.
      }
    }
  }
}

export default AlertDeliveryQueueHealthDashboard;