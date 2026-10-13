import RecoveryHealth from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealth.js";

export class RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboard {
  constructor(healthService = null, options = {}) {
    this.health = healthService || new RecoveryHealth();
    this.options = {
      historyLimit: 200,
      alertLimit: 100,
      ...options,
    };

    this.history = [];
    this.alerts = [];
    this.listeners = new Set();
    this.unsubscribeHealth = null;
    this.disposed = false;

    this.dashboard = this.createInitialDashboard();

    this.unsubscribeHealth = this.health.subscribe((event) => {
      this.handleHealthEvent(event);
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Dashboard listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    this.assertActive();

    const state = this.health.start();
    this.updateDashboard(state);

    return this.getDashboard();
  }

  stop() {
    this.health.stop();
    this.refresh();
    return this.getDashboard();
  }

  refresh() {
    this.assertActive();

    const state = this.health.check();
    this.updateDashboard(state);

    return this.getDashboard();
  }

  handleHealthEvent(event) {
    if (this.disposed) return;

    const state = event.detail;

    if (state && typeof state === "object" && "status" in state) {
      this.updateDashboard(state);
    }

    if (
      event.type === "health:unhealthy" ||
      event.type === "health:degraded"
    ) {
      this.addAlert({
        severity: event.type === "health:unhealthy" ? "error" : "warning",
        type: event.type,
        message:
          event.type === "health:unhealthy"
            ? "Recovery system is unhealthy."
            : "Recovery system is operating in a degraded state.",
        detail: state,
      });
    }

    this.emit("dashboard:event", {
      sourceEvent: event.type,
      dashboard: this.getDashboard(),
    });
  }

  updateDashboard(state) {
    if (!state) return;

    const previousStatus = this.dashboard.status;

    this.dashboard = {
      status: state.status || "unknown",
      healthy: state.healthy ?? null,
      checkedAt: state.checkedAt ?? null,
      consecutiveFailures: state.consecutiveFailures || 0,
      issues: Array.isArray(state.issues)
        ? state.issues.map((issue) => ({ ...issue }))
        : [],
      metrics: { ...(state.metrics || {}) },
      updatedAt: Date.now(),
    };

    this.recordSnapshot();

    if (previousStatus !== this.dashboard.status) {
      this.emit("dashboard:status_changed", {
        previousStatus,
        currentStatus: this.dashboard.status,
      });
    }

    this.emit("dashboard:updated", this.getDashboard());
  }

  addAlert(alert) {
    const entry = {
      id: `health-alert-${Date.now()}-${this.alerts.length + 1}`,
      timestamp: Date.now(),
      acknowledged: false,
      ...alert,
    };

    this.alerts.push(entry);

    const limit = Math.max(1, this.options.alertLimit);

    if (this.alerts.length > limit) {
      this.alerts.splice(0, this.alerts.length - limit);
    }

    this.emit("dashboard:alert", structuredClone(entry));

    return structuredClone(entry);
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find((item) => item.id === String(id));

    if (!alert || alert.acknowledged) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();

    this.emit("dashboard:alert_acknowledged", structuredClone(alert));

    return true;
  }

  acknowledgeAllAlerts() {
    let acknowledged = 0;
    const now = Date.now();

    for (const alert of this.alerts) {
      if (!alert.acknowledged) {
        alert.acknowledged = true;
        alert.acknowledgedAt = now;
        acknowledged += 1;
      }
    }

    this.emit("dashboard:alerts_acknowledged", { acknowledged });

    return acknowledged;
  }

  getAlerts(options = {}) {
    let results = this.alerts;

    if (options.severity) {
      results = results.filter(
        (alert) => alert.severity === options.severity
      );
    }

    if (options.unacknowledgedOnly) {
      results = results.filter((alert) => !alert.acknowledged);
    }

    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.alertLimit)
    );

    return results
      .slice(-limit)
      .reverse()
      .map((alert) => structuredClone(alert));
  }

  getDashboard() {
    return {
      ...structuredClone(this.dashboard),
      alerts: {
        total: this.alerts.length,
        unacknowledged: this.alerts.filter(
          (alert) => !alert.acknowledged
        ).length,
        errors: this.alerts.filter(
          (alert) => alert.severity === "error"
        ).length,
        warnings: this.alerts.filter(
          (alert) => alert.severity === "warning"
        ).length,
      },
    };
  }

  getHistory(options = {}) {
    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.historyLimit)
    );

    return this.history
      .slice(-limit)
      .map((entry) => structuredClone(entry));
  }

  recordSnapshot() {
    this.history.push({
      timestamp: Date.now(),
      ...this.getDashboard(),
    });

    const limit = Math.max(1, this.options.historyLimit);

    if (this.history.length > limit) {
      this.history.splice(0, this.history.length - limit);
    }
  }

  createInitialDashboard() {
    return {
      status: "unknown",
      healthy: null,
      checkedAt: null,
      consecutiveFailures: 0,
      issues: [],
      metrics: {},
      updatedAt: Date.now(),
    };
  }

  emit(type, detail) {
    const event = {
      type,
      detail,
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryHealthDashboard]", error);
      }
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Recovery health dashboard has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.stop();

    if (typeof this.unsubscribeHealth === "function") {
      this.unsubscribeHealth();
      this.unsubscribeHealth = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryHealthDashboard;