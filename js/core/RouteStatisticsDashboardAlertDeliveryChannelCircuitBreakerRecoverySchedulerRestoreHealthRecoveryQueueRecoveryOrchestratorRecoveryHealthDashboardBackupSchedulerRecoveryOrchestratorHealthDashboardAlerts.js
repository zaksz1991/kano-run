import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboard.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardMetrics from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardMetrics.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlerts {
  constructor({
    dashboard = null,
    metrics = null,
    clock = () => Date.now(),
    historyLimit = 200,
    cooldownMs = 30000,
    thresholds = {},
  } = {}) {
    this.dashboard =
      dashboard ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard();

    this.metrics =
      metrics ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardMetrics({
        dashboard: this.dashboard,
      });

    this.clock = clock;
    this.historyLimit = Math.max(10, Number(historyLimit) || 200);
    this.cooldownMs = Math.max(0, Number(cooldownMs) || 0);

    this.thresholds = {
      failedChecks: Math.max(1, Number(thresholds.failedChecks) || 1),
      degradedSamples: Math.max(1, Number(thresholds.degradedSamples) || 3),
      staleAfterMs: Math.max(10000, Number(thresholds.staleAfterMs) || 30000),
    };

    this.alerts = [];
    this.activeAlerts = new Map();
    this.lastRaisedAt = new Map();
    this.unsubscribe = null;
    this.started = false;
  }

  start() {
    if (this.started) {
      return this.getStatus();
    }

    this.started = true;

    this.unsubscribe = this.dashboard.subscribe(({ status, snapshot }) => {
      this.evaluate({ status, snapshot });
    });

    const snapshot = this.dashboard.getSnapshot();

    if (snapshot) {
      this.evaluate({
        status: this.dashboard.getStatus(),
        snapshot,
      });
    }

    return this.getStatus();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.started = false;

    return this.getStatus();
  }

  evaluate({ status = null, snapshot = null } = {}) {
    const now = this.clock();
    const health = snapshot?.health;
    const checks = Array.isArray(health?.checks) ? health.checks : [];
    const failedChecks = checks.filter(
      (check) => check.status === "failed",
    );

    if (failedChecks.length > 0) {
      this.raise({
        key: "health_check_failure",
        severity: "critical",
        message: `${failedChecks.length} health check(s) failed.`,
        details: {
          failedChecks: failedChecks.map((check) => ({
            name: check.name,
            error: check.error ?? null,
          })),
        },
      });
    } else {
      this.resolve("health_check_failure");
    }

    const degradedCount = this.metrics.getSummary().degradedSamples;

    if (degradedCount >= this.thresholds.degradedSamples) {
      this.raise({
        key: "sustained_degraded_health",
        severity: "warning",
        message: "The dashboard has recorded repeated degraded health samples.",
        details: {
          degradedSamples: degradedCount,
          threshold: this.thresholds.degradedSamples,
        },
      });
    } else {
      this.resolve("sustained_degraded_health");
    }

    if (
      status?.lastError ||
      snapshot?.status === "degraded"
    ) {
      this.raise({
        key: "dashboard_degraded",
        severity: "warning",
        message: status?.lastError
          ? "The dashboard encountered a refresh error."
          : "The dashboard health status is degraded.",
        details: {
          lastError: status?.lastError ?? null,
        },
      });
    } else {
      this.resolve("dashboard_degraded");
    }

    const lastRefreshAt = status?.lastRefreshAt;

    if (
      lastRefreshAt &&
      now - lastRefreshAt > this.thresholds.staleAfterMs
    ) {
      this.raise({
        key: "stale_dashboard_data",
        severity: "warning",
        message: "Dashboard data has not refreshed within the expected interval.",
        details: {
          lastRefreshAt,
          staleForMs: now - lastRefreshAt,
          thresholdMs: this.thresholds.staleAfterMs,
        },
      });
    } else {
      this.resolve("stale_dashboard_data");
    }

    return this.getActiveAlerts();
  }

  raise({
    key,
    severity = "warning",
    message,
    details = {},
  }) {
    if (!key || !message) {
      throw new TypeError("Alert key and message are required.");
    }

    const now = this.clock();
    const existing = this.activeAlerts.get(key);

    if (existing) {
      existing.lastSeenAt = now;
      existing.occurrences += 1;
      existing.details = { ...details };
      existing.message = message;
      existing.severity = severity;

      return { ...existing, details: { ...existing.details } };
    }

    const lastRaised = this.lastRaisedAt.get(key) ?? 0;

    if (now - lastRaised < this.cooldownMs) {
      return null;
    }

    const alert = {
      id: `${key}-${now}-${this.alerts.length + 1}`,
      key,
      severity,
      message,
      details: { ...details },
      raisedAt: now,
      lastSeenAt: now,
      occurrences: 1,
      status: "active",
      resolvedAt: null,
    };

    this.activeAlerts.set(key, alert);
    this.lastRaisedAt.set(key, now);
    this.#record(alert);

    return { ...alert, details: { ...alert.details } };
  }

  resolve(key, resolution = "condition_cleared") {
    const alert = this.activeAlerts.get(key);

    if (!alert) {
      return false;
    }

    alert.status = "resolved";
    alert.resolvedAt = this.clock();
    alert.resolution = resolution;

    this.activeAlerts.delete(key);
    this.#record(alert);

    return true;
  }

  resolveAll(resolution = "manually_resolved") {
    const keys = [...this.activeAlerts.keys()];
    let resolved = 0;

    for (const key of keys) {
      if (this.resolve(key, resolution)) {
        resolved += 1;
      }
    }

    return { resolved, timestamp: this.clock() };
  }

  getActiveAlerts() {
    return [...this.activeAlerts.values()].map((alert) => ({
      ...alert,
      details: { ...alert.details },
    }));
  }

  getHistory({ limit = this.historyLimit, severity = null } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit),
    );

    let items = this.alerts;

    if (severity) {
      items = items.filter((alert) => alert.severity === severity);
    }

    return items.slice(-safeLimit).map((alert) => ({
      ...alert,
      details: { ...alert.details },
    }));
  }

  getStatus() {
    const active = this.getActiveAlerts();

    return {
      started: this.started,
      activeCount: active.length,
      criticalCount: active.filter(
        (alert) => alert.severity === "critical",
      ).length,
      warningCount: active.filter(
        (alert) => alert.severity === "warning",
      ).length,
      historyCount: this.alerts.length,
      thresholds: { ...this.thresholds },
    };
  }

  #record(alert) {
    this.alerts.push({
      ...alert,
      details: { ...alert.details },
    });

    if (this.alerts.length > this.historyLimit) {
      this.alerts.splice(0, this.alerts.length - this.historyLimit);
    }
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlerts;