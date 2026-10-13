import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  EVALUATION_STARTED: "route-statistics-alert-engine:evaluation-started",
  EVALUATION_COMPLETED: "route-statistics-alert-engine:evaluation-completed",
  ALERT_TRIGGERED: "route-statistics-alert-engine:alert-triggered",
  EVALUATION_FAILED: "route-statistics-alert-engine:evaluation-failed",
  DISPOSED: "route-statistics-alert-engine:disposed",
});

export class RouteStatisticsDashboardAlertEngine {
  constructor({
    rules,
    alerts,
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    cooldownMs = 30000,
    maxAlertsPerEvaluation = 50,
  } = {}) {
    if (!rules || typeof rules.evaluate !== "function") {
      throw new TypeError(
        "RouteStatisticsDashboardAlertEngine requires a rules evaluator."
      );
    }

    if (!alerts || typeof alerts.createAlert !== "function") {
      throw new TypeError(
        "RouteStatisticsDashboardAlertEngine requires an alert manager."
      );
    }

    this.rules = rules;
    this.alerts = alerts;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.cooldownMs = Math.max(0, Number(cooldownMs) || 0);
    this.maxAlertsPerEvaluation = Math.max(
      1,
      Math.floor(Number(maxAlertsPerEvaluation) || 50)
    );

    this.lastTriggeredAt = new Map();
    this.evaluationCount = 0;
    this.triggeredCount = 0;
    this.suppressedCount = 0;
    this.failedCount = 0;
    this.evaluating = false;
    this.disposed = false;
  }

  async evaluate(snapshot, context = {}) {
    this.assertActive();

    if (this.evaluating) {
      return {
        success: false,
        skipped: true,
        reason: "evaluation-in-progress",
        alerts: [],
      };
    }

    this.evaluating = true;
    this.evaluationCount += 1;

    const startedAt = this.clock();
    const triggered = [];
    const suppressed = [];

    this.emit(EVENTS.EVALUATION_STARTED, {
      evaluation: this.evaluationCount,
      startedAt,
    });

    try {
      const result = await this.rules.evaluate(snapshot, context);
      const candidates = this.normalizeCandidates(result);

      for (const candidate of candidates.slice(
        0,
        this.maxAlertsPerEvaluation
      )) {
        if (this.disposed) break;

        const key = this.getAlertKey(candidate);
        const previousTime = this.lastTriggeredAt.get(key);
        const now = this.clock();

        if (
          previousTime !== undefined &&
          now - previousTime < this.cooldownMs
        ) {
          this.suppressedCount += 1;
          suppressed.push({
            key,
            reason: "cooldown",
          });
          continue;
        }

        const alert = await this.createAlert(candidate, {
          ...context,
          snapshot,
          evaluation: this.evaluationCount,
        });

        if (!alert) continue;

        this.lastTriggeredAt.set(key, this.clock());
        this.triggeredCount += 1;
        triggered.push(alert);

        this.emit(EVENTS.ALERT_TRIGGERED, {
          alert,
          key,
          evaluation: this.evaluationCount,
        });
      }

      const summary = {
        success: true,
        evaluation: this.evaluationCount,
        durationMs: Math.max(0, this.clock() - startedAt),
        candidates: candidates.length,
        triggered,
        suppressed,
      };

      this.emit(EVENTS.EVALUATION_COMPLETED, summary);
      return summary;
    } catch (error) {
      this.failedCount += 1;

      const failure = {
        success: false,
        evaluation: this.evaluationCount,
        error: error?.message ?? String(error),
      };

      this.logError("Alert evaluation failed.", error);
      this.emit(EVENTS.EVALUATION_FAILED, failure);

      return {
        ...failure,
        triggered,
        suppressed,
      };
    } finally {
      this.evaluating = false;
    }
  }

  normalizeCandidates(result) {
    if (Array.isArray(result)) return result.filter(Boolean);

    if (Array.isArray(result?.alerts)) {
      return result.alerts.filter(Boolean);
    }

    if (Array.isArray(result?.matches)) {
      return result.matches.filter(Boolean);
    }

    if (Array.isArray(result?.triggered)) {
      return result.triggered.filter(Boolean);
    }

    if (result && typeof result === "object" && result.triggered === true) {
      return [result];
    }

    return [];
  }

  async createAlert(candidate, context) {
    const payload = {
      ...candidate,
      context: {
        ...(candidate.context ?? {}),
        ...context,
      },
      createdAt: candidate.createdAt ?? new Date(this.clock()).toISOString(),
    };

    return this.alerts.createAlert(payload);
  }

  getAlertKey(candidate) {
    const ruleId =
      candidate.ruleId ??
      candidate.rule?.id ??
      candidate.id ??
      candidate.type ??
      "unknown-rule";

    const subject =
      candidate.subject ??
      candidate.metric ??
      candidate.routeId ??
      candidate.name ??
      "global";

    return `${String(ruleId)}:${String(subject)}`;
  }

  clearCooldown(key) {
    if (key === undefined || key === null) {
      this.lastTriggeredAt.clear();
      return true;
    }

    return this.lastTriggeredAt.delete(String(key));
  }

  getStats() {
    return {
      evaluationCount: this.evaluationCount,
      triggeredCount: this.triggeredCount,
      suppressedCount: this.suppressedCount,
      failedCount: this.failedCount,
      activeCooldowns: this.lastTriggeredAt.size,
      evaluating: this.evaluating,
      disposed: this.disposed,
    };
  }

  subscribe(event, handler) {
    this.assertActive();

    if (typeof handler !== "function") {
      throw new TypeError("Event handler must be a function.");
    }

    if (typeof this.eventBus.on === "function") {
      return this.eventBus.on(event, handler);
    }

    throw new Error("The configured event bus does not support subscriptions.");
  }

  emit(event, payload) {
    try {
      if (typeof this.eventBus.emit === "function") {
        this.eventBus.emit(event, payload);
      } else if (typeof this.eventBus.publish === "function") {
        this.eventBus.publish(event, payload);
      }
    } catch (error) {
      this.logError(`Failed to emit event "${event}".`, error);
    }
  }

  logError(message, error) {
    try {
      if (typeof this.logger.error === "function") {
        this.logger.error(message, error);
      }
    } catch {
      // Logging failures must not interrupt alert processing.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertEngine has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.lastTriggeredAt.clear();

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export { EVENTS as RouteStatisticsDashboardAlertEngineEvents };

export default RouteStatisticsDashboardAlertEngine;