import { Logger } from "./Logger.js";
import {
  RouteStatisticsDashboardAlerts,
  RouteStatisticsDashboardAlertSeverities,
} from "./RouteStatisticsDashboardAlerts.js";

const SEVERITIES = RouteStatisticsDashboardAlertSeverities;

const DEFAULT_RULES = Object.freeze([
  {
    id: "dashboard-unhealthy",
    severity: SEVERITIES.ERROR,
    message: "The dashboard reports an unhealthy state.",
    evaluate: (snapshot) =>
      snapshot?.healthy === false || snapshot?.status === "error",
  },
  {
    id: "dashboard-loading",
    severity: SEVERITIES.WARNING,
    message: "The dashboard is still loading.",
    evaluate: (snapshot) => snapshot?.status === "loading",
  },
  {
    id: "dashboard-stale",
    severity: SEVERITIES.WARNING,
    message: "Dashboard statistics have not refreshed recently.",
    evaluate: (snapshot, context) =>
      Number.isFinite(context.snapshotAgeMs) &&
      context.snapshotAgeMs > context.staleAfterMs,
  },
  {
    id: "dashboard-empty",
    severity: SEVERITIES.INFO,
    message: "No dashboard statistics are currently available.",
    evaluate: (snapshot) =>
      snapshot?.totalRecords === 0 ||
      snapshot?.metrics?.totalRecords === 0,
  },
]);

export class RouteStatisticsDashboardAlertManager {
  constructor({
    alerts = null,
    monitor = null,
    dashboard = null,
    logger = null,
    rules = DEFAULT_RULES,
    staleAfterMs = 60000,
    autoStart = false,
    intervalMs = 15000,
  } = {}) {
    this.logger =
      logger ?? new Logger("RouteStatisticsDashboardAlertManager");

    this.alerts =
      alerts ??
      new RouteStatisticsDashboardAlerts({
        logger: this.logger,
        autoResolve: true,
      });

    this.monitor = monitor;
    this.dashboard = dashboard;
    this.rules = this.normalizeRules(rules);
    this.staleAfterMs = Math.max(1000, Number(staleAfterMs) || 60000);
    this.intervalMs = Math.max(1000, Number(intervalMs) || 15000);

    this.timer = null;
    this.unsubscribeMonitor = null;
    this.running = false;
    this.disposed = false;
    this.checkInProgress = false;
    this.lastEvaluationAt = null;
    this.lastSnapshot = null;
    this.lastError = null;
    this.listeners = new Set();

    if (autoStart) {
      this.start();
    }
  }

  normalizeRules(rules) {
    if (!Array.isArray(rules)) {
      throw new TypeError("Alert rules must be an array.");
    }

    const ids = new Set();

    return rules.map((rule, index) => {
      if (!rule || typeof rule.evaluate !== "function") {
        throw new TypeError(
          `Alert rule at index ${index} must provide an evaluate function.`
        );
      }

      const id = String(rule.id ?? `custom-rule-${index}`).trim();

      if (!id || ids.has(id)) {
        throw new TypeError(`Alert rule ID is missing or duplicated: ${id}`);
      }

      ids.add(id);

      return {
        id,
        title: String(rule.title ?? "Dashboard alert"),
        severity: rule.severity ?? SEVERITIES.WARNING,
        message: String(rule.message ?? "A dashboard condition was detected."),
        evaluate: rule.evaluate,
      };
    });
  }

  start() {
    this.assertActive();

    if (this.running) {
      return false;
    }

    this.running = true;

    if (this.monitor && typeof this.monitor.subscribe === "function") {
      this.unsubscribeMonitor = this.monitor.subscribe((event) => {
        if (
          event?.type === "routeStatisticsMonitor:checked" ||
          event?.type === "routeStatisticsMonitor:warning"
        ) {
          this.evaluate(event.payload).catch((error) => {
            this.handleError(error);
          });
        }
      });
    }

    this.timer = globalThis.setInterval(() => {
      this.evaluate().catch((error) => {
        this.handleError(error);
      });
    }, this.intervalMs);

    this.evaluate().catch((error) => {
      this.handleError(error);
    });

    this.emit("started", {
      intervalMs: this.intervalMs,
      startedAt: new Date().toISOString(),
    });

    return true;
  }

  stop() {
    if (!this.running) {
      return false;
    }

    this.running = false;

    if (this.timer !== null) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }

    if (this.unsubscribeMonitor) {
      this.unsubscribeMonitor();
      this.unsubscribeMonitor = null;
    }

    this.emit("stopped", {
      stoppedAt: new Date().toISOString(),
    });

    return true;
  }

  async evaluate(providedSnapshot = null) {
    this.assertActive();

    if (this.checkInProgress) {
      return {
        skipped: true,
        reason: "evaluation_in_progress",
        evaluatedAt: this.lastEvaluationAt,
      };
    }

    this.checkInProgress = true;

    try {
      const snapshot =
        providedSnapshot?.snapshot ??
        providedSnapshot ??
        (await this.readSnapshot());

      const evaluatedAt = new Date().toISOString();
      const context = this.createContext(snapshot);
      const triggeredRuleIds = new Set();
      const outcomes = [];

      this.lastSnapshot = snapshot;
      this.lastEvaluationAt = evaluatedAt;

      for (const rule of this.rules) {
        let triggered = false;

        try {
          triggered = Boolean(await rule.evaluate(snapshot, context));
        } catch (error) {
          this.logger?.warn?.(
            `Dashboard alert rule "${rule.id}" failed.`,
            error
          );

          outcomes.push({
            ruleId: rule.id,
            triggered: false,
            error: error instanceof Error ? error.message : String(error),
          });

          continue;
        }

        const key = `rule:${rule.id}`;

        if (triggered) {
          triggeredRuleIds.add(rule.id);

          this.alerts.create({
            key,
            title: rule.title,
            message: rule.message,
            severity: rule.severity,
            source: "dashboard-rule",
            persistent: true,
            metadata: {
              ruleId: rule.id,
              evaluatedAt,
              context: this.sanitizeContext(context),
            },
          });
        } else {
          this.alerts.resolveByKey(key, {
            message: "The condition is no longer active.",
            metadata: {
              ruleId: rule.id,
              resolvedDuringEvaluation: evaluatedAt,
            },
          });
        }

        outcomes.push({
          ruleId: rule.id,
          triggered,
        });
      }

      this.lastError = null;

      const result = {
        evaluatedAt,
        ruleCount: this.rules.length,
        triggeredCount: triggeredRuleIds.size,
        triggeredRuleIds: [...triggeredRuleIds],
        outcomes,
        activeAlerts: this.alerts.getActive().length,
      };

      this.emit("evaluated", result);

      return result;
    } finally {
      this.checkInProgress = false;
    }
  }

  async readSnapshot() {
    if (this.dashboard?.getDashboard) {
      return this.dashboard.getDashboard();
    }

    if (this.dashboard?.getSnapshot) {
      return this.dashboard.getSnapshot();
    }

    if (this.monitor?.check) {
      return this.monitor.check();
    }

    if (this.monitor?.lastResult) {
      return this.monitor.lastResult;
    }

    throw new Error(
      "No dashboard snapshot source is available for alert evaluation."
    );
  }

  createContext(snapshot) {
    const timestamp =
      snapshot?.lastRefreshAt ??
      snapshot?.refreshedAt ??
      snapshot?.updatedAt ??
      null;

    const parsedTimestamp = timestamp ? Date.parse(timestamp) : NaN;

    return {
      now: Date.now(),
      evaluatedAt: new Date().toISOString(),
      snapshotAgeMs: Number.isFinite(parsedTimestamp)
        ? Math.max(0, Date.now() - parsedTimestamp)
        : null,
      staleAfterMs: this.staleAfterMs,
      snapshotTimestamp: timestamp,
      monitorStatus: this.monitor?.getStatus?.() ?? null,
      activeAlertCount: this.alerts.getActive().length,
    };
  }

  sanitizeContext(context) {
    return {
      snapshotAgeMs: context.snapshotAgeMs,
      staleAfterMs: context.staleAfterMs,
      snapshotTimestamp: context.snapshotTimestamp,
      activeAlertCount: context.activeAlertCount,
    };
  }

  addRule(rule) {
    this.assertActive();

    const [normalized] = this.normalizeRules([
      rule,
    ]);

    if (this.rules.some((existing) => existing.id === normalized.id)) {
      throw new Error(`Alert rule already exists: ${normalized.id}`);
    }

    this.rules.push(normalized);

    this.emit("rule-added", {
      id: normalized.id,
      addedAt: new Date().toISOString(),
    });

    return normalized.id;
  }

  removeRule(id) {
    this.assertActive();

    const ruleId = String(id);
    const previousLength = this.rules.length;

    this.rules = this.rules.filter((rule) => rule.id !== ruleId);

    if (this.rules.length === previousLength) {
      return false;
    }

    this.alerts.resolveByKey(`rule:${ruleId}`, {
      message: "The alert rule was removed.",
    });

    this.emit("rule-removed", {
      id: ruleId,
      removedAt: new Date().toISOString(),
    });

    return true;
  }

  getRules() {
    this.assertActive();

    return this.rules.map(({ id, title, severity, message }) => ({
      id,
      title,
      severity,
      message,
    }));
  }

  getStatus() {
    return {
      running: this.running,
      disposed: this.disposed,
      checkInProgress: this.checkInProgress,
      intervalMs: this.intervalMs,
      staleAfterMs: this.staleAfterMs,
      lastEvaluationAt: this.lastEvaluationAt,
      ruleCount: this.rules.length,
      alertSummary: this.alerts.getSummary(),
      lastError: this.lastError,
    };
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Alert manager listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(type, payload = {}) {
    const event = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logger?.warn?.("Alert manager listener failed.", error);
      }
    }
  }

  handleError(error) {
    this.lastError =
      error instanceof Error ? error.message : String(error);

    this.logger?.error?.(
      "Dashboard alert evaluation failed.",
      error
    );

    this.emit("error", {
      message: this.lastError,
      occurredAt: new Date().toISOString(),
    });
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertManager has been disposed."
      );
    }
  }

  dispose({ disposeAlerts = false } = {}) {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.listeners.clear();

    if (disposeAlerts) {
      this.alerts.dispose();
    }

    this.disposed = true;
  }
}

export { DEFAULT_RULES as RouteStatisticsDashboardDefaultAlertRules };

export default RouteStatisticsDashboardAlertManager;