import { Logger } from "./Logger.js";

const SEVERITIES = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  staleAfterMs: 60000,
  errorRateWarning: 0.05,
  errorRateCritical: 0.2,
  minimumSampleSize: 20,
  slowRefreshMs: 5000,
  slowRefreshCriticalMs: 15000,
  crashWarningCount: 1,
  crashCriticalCount: 5,
  lowCompletionRate: 0.4,
  lowSuccessRate: 0.5,
  storageWarningRatio: 0.8,
  storageCriticalRatio: 0.95,
});

export class RouteStatisticsDashboardAlertRules {
  constructor({
    thresholds = {},
    logger = null,
    customRules = [],
  } = {}) {
    this.logger =
      logger ?? new Logger("RouteStatisticsDashboardAlertRules");

    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };

    this.rules = new Map();
    this.disposed = false;

    this.registerDefaultRules();

    for (const rule of customRules) {
      this.register(rule);
    }
  }

  registerDefaultRules() {
    this.register({
      id: "dashboard-stale-data",
      title: "Dashboard data is stale",
      severity: SEVERITIES.WARNING,
      message: "Dashboard statistics have not refreshed within the expected interval.",
      evaluate: (snapshot, context) => {
        const age = this.getSnapshotAge(snapshot, context);

        return age !== null && age > this.thresholds.staleAfterMs;
      },
    });

    this.register({
      id: "dashboard-refresh-failure",
      title: "Dashboard refresh failed",
      severity: SEVERITIES.ERROR,
      message: "The dashboard's latest refresh reported an error.",
      evaluate: (snapshot) =>
        snapshot?.error != null ||
        snapshot?.refreshError != null ||
        snapshot?.status === "error",
    });

    this.register({
      id: "dashboard-slow-refresh",
      title: "Dashboard refresh is slow",
      severity: SEVERITIES.WARNING,
      message: "Dashboard refresh duration is above the warning threshold.",
      evaluate: (snapshot) => {
        const duration = this.getRefreshDuration(snapshot);

        return (
          duration !== null &&
          duration >= this.thresholds.slowRefreshMs &&
          duration < this.thresholds.slowRefreshCriticalMs
        );
      },
    });

    this.register({
      id: "dashboard-critical-refresh-delay",
      title: "Dashboard refresh delay is critical",
      severity: SEVERITIES.CRITICAL,
      message: "Dashboard refresh duration has exceeded the critical threshold.",
      evaluate: (snapshot) => {
        const duration = this.getRefreshDuration(snapshot);

        return (
          duration !== null &&
          duration >= this.thresholds.slowRefreshCriticalMs
        );
      },
    });

    this.register({
      id: "statistics-high-error-rate",
      title: "Statistics error rate is elevated",
      severity: SEVERITIES.WARNING,
      message: "The recorded statistics error rate exceeds the warning threshold.",
      evaluate: (snapshot) => {
        const metrics = this.getMetrics(snapshot);
        const sampleSize = this.getNumber(
          metrics,
          ["totalRuns", "totalRecords", "sampleSize"]
        );
        const errorRate = this.getErrorRate(metrics);

        return (
          sampleSize !== null &&
          sampleSize >= this.thresholds.minimumSampleSize &&
          errorRate !== null &&
          errorRate >= this.thresholds.errorRateWarning &&
          errorRate < this.thresholds.errorRateCritical
        );
      },
    });

    this.register({
      id: "statistics-critical-error-rate",
      title: "Statistics error rate is critical",
      severity: SEVERITIES.CRITICAL,
      message: "The recorded statistics error rate exceeds the critical threshold.",
      evaluate: (snapshot) => {
        const metrics = this.getMetrics(snapshot);
        const sampleSize = this.getNumber(
          metrics,
          ["totalRuns", "totalRecords", "sampleSize"]
        );
        const errorRate = this.getErrorRate(metrics);

        return (
          sampleSize !== null &&
          sampleSize >= this.thresholds.minimumSampleSize &&
          errorRate !== null &&
          errorRate >= this.thresholds.errorRateCritical
        );
      },
    });

    this.register({
      id: "statistics-low-completion-rate",
      title: "Route completion rate is low",
      severity: SEVERITIES.WARNING,
      message: "The route completion rate is below the configured threshold.",
      evaluate: (snapshot) => {
        const metrics = this.getMetrics(snapshot);
        const completionRate = this.getRate(
          metrics,
          ["completionRate", "completedRate"]
        );

        return (
          completionRate !== null &&
          completionRate < this.thresholds.lowCompletionRate
        );
      },
    });

    this.register({
      id: "statistics-low-success-rate",
      title: "Route success rate is low",
      severity: SEVERITIES.WARNING,
      message: "The route success rate is below the configured threshold.",
      evaluate: (snapshot) => {
        const metrics = this.getMetrics(snapshot);
        const successRate = this.getRate(
          metrics,
          ["successRate", "successfulRunRate"]
        );

        return (
          successRate !== null &&
          successRate < this.thresholds.lowSuccessRate
        );
      },
    });

    this.register({
      id: "statistics-crash-warning",
      title: "Vehicle crashes detected",
      severity: SEVERITIES.WARNING,
      message: "Recorded route statistics include vehicle crashes.",
      evaluate: (snapshot) => {
        const crashes = this.getNumber(
          this.getMetrics(snapshot),
          ["crashes", "totalCrashes", "crashCount"]
        );

        return (
          crashes !== null &&
          crashes >= this.thresholds.crashWarningCount &&
          crashes < this.thresholds.crashCriticalCount
        );
      },
    });

    this.register({
      id: "statistics-crash-critical",
      title: "Vehicle crash count is high",
      severity: SEVERITIES.CRITICAL,
      message: "Recorded vehicle crashes have reached the critical threshold.",
      evaluate: (snapshot) => {
        const crashes = this.getNumber(
          this.getMetrics(snapshot),
          ["crashes", "totalCrashes", "crashCount"]
        );

        return (
          crashes !== null &&
          crashes >= this.thresholds.crashCriticalCount
        );
      },
    });

    this.register({
      id: "dashboard-empty-statistics",
      title: "No statistics available",
      severity: SEVERITIES.INFO,
      message: "No route statistics have been recorded yet.",
      evaluate: (snapshot) => {
        const metrics = this.getMetrics(snapshot);
        const total = this.getNumber(
          metrics,
          ["totalRuns", "totalRecords", "count"]
        );

        return total === 0;
      },
    });

    this.register({
      id: "dashboard-storage-capacity-warning",
      title: "Statistics storage is nearly full",
      severity: SEVERITIES.WARNING,
      message: "Statistics storage usage has exceeded the warning threshold.",
      evaluate: (snapshot) => {
        const ratio = this.getStorageRatio(snapshot);

        return (
          ratio !== null &&
          ratio >= this.thresholds.storageWarningRatio &&
          ratio < this.thresholds.storageCriticalRatio
        );
      },
    });

    this.register({
      id: "dashboard-storage-capacity-critical",
      title: "Statistics storage capacity is critical",
      severity: SEVERITIES.CRITICAL,
      message: "Statistics storage usage has exceeded the critical threshold.",
      evaluate: (snapshot) => {
        const ratio = this.getStorageRatio(snapshot);

        return (
          ratio !== null &&
          ratio >= this.thresholds.storageCriticalRatio
        );
      },
    });
  }

  register(rule) {
    this.assertActive();

    if (!rule || typeof rule !== "object") {
      throw new TypeError("Alert rule must be an object.");
    }

    const id = String(rule.id ?? "").trim();

    if (!id) {
      throw new TypeError("Alert rule requires an ID.");
    }

    if (typeof rule.evaluate !== "function") {
      throw new TypeError(`Alert rule "${id}" requires an evaluate function.`);
    }

    const severity = String(
      rule.severity ?? SEVERITIES.WARNING
    ).toLowerCase();

    if (!Object.values(SEVERITIES).includes(severity)) {
      throw new TypeError(
        `Alert rule "${id}" has an invalid severity: ${severity}`
      );
    }

    const normalized = {
      id,
      title: String(rule.title ?? "Dashboard alert"),
      severity,
      message: String(rule.message ?? "A dashboard condition was detected."),
      enabled: rule.enabled !== false,
      evaluate: rule.evaluate,
      metadata:
        rule.metadata && typeof rule.metadata === "object"
          ? { ...rule.metadata }
          : {},
    };

    this.rules.set(id, normalized);

    return this.get(id);
  }

  unregister(id) {
    this.assertActive();
    return this.rules.delete(String(id));
  }

  get(id) {
    const rule = this.rules.get(String(id));

    if (!rule) {
      return null;
    }

    return {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      message: rule.message,
      enabled: rule.enabled,
      metadata: { ...rule.metadata },
    };
  }

  getAll({ enabledOnly = false } = {}) {
    this.assertActive();

    return [...this.rules.values()]
      .filter((rule) => !enabledOnly || rule.enabled)
      .map((rule) => ({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        message: rule.message,
        enabled: rule.enabled,
        metadata: { ...rule.metadata },
      }));
  }

  setEnabled(id, enabled) {
    this.assertActive();

    const rule = this.rules.get(String(id));

    if (!rule) {
      return false;
    }

    rule.enabled = Boolean(enabled);
    return true;
  }

  setThresholds(thresholds = {}) {
    this.assertActive();

    for (const [key, value] of Object.entries(thresholds)) {
      if (
        !Object.hasOwn(this.thresholds, key) ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
      ) {
        throw new TypeError(`Invalid alert threshold: ${key}`);
      }
    }

    this.thresholds = {
      ...this.thresholds,
      ...Object.fromEntries(
        Object.entries(thresholds).map(([key, value]) => [
          key,
          Number(value),
        ])
      ),
    };

    return { ...this.thresholds };
  }

  async evaluateAll(snapshot, context = {}) {
    this.assertActive();

    const results = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      try {
        const triggered = Boolean(
          await rule.evaluate(snapshot, context)
        );

        results.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          message: rule.message,
          triggered,
          metadata: { ...rule.metadata },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        this.logger?.warn?.(
          `Alert rule evaluation failed: ${rule.id}`,
          error
        );

        results.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          message: rule.message,
          triggered: false,
          error: message,
          metadata: { ...rule.metadata },
        });
      }
    }

    return {
      evaluatedAt: new Date().toISOString(),
      totalRules: results.length,
      triggeredCount: results.filter((result) => result.triggered).length,
      results,
    };
  }

  getMetrics(snapshot) {
    return (
      snapshot?.metrics ??
      snapshot?.statistics?.metrics ??
      snapshot?.summary ??
      snapshot?.statistics ??
      snapshot ??
      {}
    );
  }

  getNumber(source, keys) {
    for (const key of keys) {
      const value = source?.[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        Number.isFinite(Number(value))
      ) {
        return Number(value);
      }
    }

    return null;
  }

  getRate(source, keys) {
    const value = this.getNumber(source, keys);

    if (value === null) {
      return null;
    }

    // Accept either a decimal ratio (0.5) or a percentage (50).
    return value > 1 ? value / 100 : value;
  }

  getErrorRate(metrics) {
    const directRate = this.getRate(metrics, [
      "errorRate",
      "failureRate",
    ]);

    if (directRate !== null) {
      return directRate;
    }

    const errors = this.getNumber(metrics, [
      "errors",
      "totalErrors",
      "failedRuns",
    ]);

    const total = this.getNumber(metrics, [
      "totalRuns",
      "totalRecords",
      "sampleSize",
    ]);

    if (errors === null || total === null || total <= 0) {
      return null;
    }

    return errors / total;
  }

  getSnapshotAge(snapshot, context) {
    if (
      Number.isFinite(context?.snapshotAgeMs) &&
      context.snapshotAgeMs >= 0
    ) {
      return context.snapshotAgeMs;
    }

    const timestamp =
      snapshot?.lastRefreshAt ??
      snapshot?.refreshedAt ??
      snapshot?.updatedAt ??
      null;

    if (!timestamp) {
      return null;
    }

    const parsed = Date.parse(timestamp);

    return Number.isNaN(parsed)
      ? null
      : Math.max(0, Date.now() - parsed);
  }

  getRefreshDuration(snapshot) {
    return this.getNumber(snapshot, [
      "refreshDurationMs",
      "durationMs",
      "lastRefreshDurationMs",
    ]);
  }

  getStorageRatio(snapshot) {
    const storage = snapshot?.storage ?? snapshot?.storageInfo ?? snapshot;

    const directRatio = this.getRate(storage, [
      "usageRatio",
      "capacityRatio",
      "utilization",
    ]);

    if (directRatio !== null) {
      return directRatio;
    }

    const used = this.getNumber(storage, [
      "usedBytes",
      "bytesUsed",
      "used",
    ]);

    const capacity = this.getNumber(storage, [
      "capacityBytes",
      "totalBytes",
      "capacity",
    ]);

    if (used === null || capacity === null || capacity <= 0) {
      return null;
    }

    return used / capacity;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertRules has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.rules.clear();
    this.disposed = true;
  }
}

export {
  DEFAULT_THRESHOLDS as ROUTE_STATISTICS_DASHBOARD_ALERT_THRESHOLDS,
  SEVERITIES as ROUTE_STATISTICS_DASHBOARD_ALERT_SEVERITIES,
};

export default RouteStatisticsDashboardAlertRules;