import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorDiagnostics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorDiagnostics.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard {
  constructor({
    orchestrator = null,
    monitor = null,
    metrics = null,
    diagnostics = null,
    refreshIntervalMs = 5000,
    historyLimit = 60,
    clock = () => Date.now(),
  } = {}) {
    this.orchestrator =
      orchestrator ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator();

    this.monitor =
      monitor ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor({
        orchestrator: this.orchestrator,
      });

    this.metrics =
      metrics ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics({
        orchestrator: this.orchestrator,
        monitor: this.monitor,
      });

    this.diagnostics =
      diagnostics ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorDiagnostics({
        orchestrator: this.orchestrator,
        monitor: this.monitor,
        metrics: this.metrics,
      });

    this.refreshIntervalMs = Math.max(
      1000,
      Number(refreshIntervalMs) || 5000,
    );

    this.historyLimit = Math.max(
      10,
      Number(historyLimit) || 60,
    );

    this.clock = clock;
    this.history = [];
    this.snapshot = null;
    this.timer = null;
    this.refreshing = false;
    this.startedAt = null;
    this.lastRefreshAt = null;
    this.lastError = null;
    this.listeners = new Set();
  }

  start({ immediate = true } = {}) {
    if (this.timer) {
      return this.getStatus();
    }

    this.startedAt = this.clock();

    if (immediate) {
      void this.refresh();
    }

    this.timer = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);

    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.#record("dashboard_stopped", {
      timestamp: this.clock(),
    });

    return this.getStatus();
  }

  async refresh() {
    if (this.refreshing) {
      return this.snapshot;
    }

    this.refreshing = true;

    try {
      const timestamp = this.clock();

      const health = await this.diagnostics.runHealthCheck();

      const snapshot = {
        timestamp,
        status: health.status,
        health,
        orchestrator: this.#safe(() =>
          this.orchestrator.getStatus(),
        ),
        monitor: this.#safe(() =>
          this.monitor.getStatus(),
        ),
        metrics: this.#safe(() =>
          this.metrics.getMetrics(),
        ),
        history: this.getHistory(),
      };

      this.snapshot = snapshot;
      this.lastRefreshAt = timestamp;
      this.lastError = null;

      this.#record("dashboard_refreshed", {
        status: snapshot.status,
        failedChecks: health.failedChecks,
      });

      this.#notify();

      return this.getSnapshot();
    } catch (error) {
      this.lastError = error instanceof Error
        ? error.message
        : String(error);

      this.#record("dashboard_refresh_failed", {
        message: this.lastError,
      });

      this.#notify();

      return this.getSnapshot();
    } finally {
      this.refreshing = false;
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Dashboard listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    if (!this.snapshot) {
      return null;
    }

    return structuredClone(this.snapshot);
  }

  getStatus() {
    return {
      running: Boolean(this.timer),
      refreshing: this.refreshing,
      startedAt: this.startedAt,
      lastRefreshAt: this.lastRefreshAt,
      refreshIntervalMs: this.refreshIntervalMs,
      historyCount: this.history.length,
      listenerCount: this.listeners.size,
      lastError: this.lastError,
      healthStatus: this.snapshot?.status ?? "unknown",
    };
  }

  getHistory(limit = this.historyLimit) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit),
    );

    return this.history.slice(-safeLimit).map((entry) => ({
      ...entry,
      details: { ...entry.details },
    }));
  }

  clearHistory() {
    const removed = this.history.length;
    this.history = [];

    this.#record("dashboard_history_cleared", {
      removed,
    });

    this.#notify();

    return { removed };
  }

  destroy() {
    this.stop();
    this.listeners.clear();
    this.snapshot = null;
  }

  #record(event, details = {}) {
    this.history.push({
      timestamp: this.clock(),
      event,
      details,
    });

    if (this.history.length > this.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.historyLimit,
      );
    }
  }

  #safe(operation) {
    try {
      return operation();
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  #notify() {
    const state = {
      status: this.getStatus(),
      snapshot: this.getSnapshot(),
    };

    for (const listener of this.listeners) {
      try {
        listener(structuredClone(state));
      } catch {
        // A subscriber must not interrupt dashboard updates.
      }
    }
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard;