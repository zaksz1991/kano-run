import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  POLICY_UPDATED: "route-statistics-alert-policy:updated",
  ALERT_APPROVED: "route-statistics-alert-policy:approved",
  ALERT_REJECTED: "route-statistics-alert-policy:rejected",
  DISPOSED: "route-statistics-alert-policy:disposed",
});

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  minimumSeverity: "info",
  allowedSeverities: ["info", "success", "warning", "critical"],
  blockedRuleIds: [],
  blockedTypes: [],
  requireMessage: true,
  deduplicate: true,
  deduplicationWindowMs: 60000,
  maximumMessageLength: 500,
});

const SEVERITY_LEVELS = Object.freeze({
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
  critical: 4,
});

export class RouteStatisticsDashboardAlertPolicy {
  constructor({
    eventBus = new EventBus(),
    logger = new Logger(),
    policy = {},
    clock = () => Date.now(),
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.policy = this.normalizePolicy({
      ...DEFAULT_POLICY,
      ...policy,
    });

    this.recentAlerts = new Map();
    this.approvedCount = 0;
    this.rejectedCount = 0;
    this.disposed = false;
  }

  evaluate(alert = {}) {
    this.assertActive();

    const rejection = this.getRejectionReason(alert);

    if (rejection) {
      this.rejectedCount += 1;

      const result = {
        approved: false,
        reason: rejection,
        alertId: alert.id ?? null,
        evaluatedAt: new Date(this.clock()).toISOString(),
      };

      this.emit(EVENTS.ALERT_REJECTED, result);
      return result;
    }

    const key = this.getDeduplicationKey(alert);
    const now = this.clock();

    this.cleanupRecentAlerts(now);

    if (this.policy.deduplicate && key) {
      const previous = this.recentAlerts.get(key);

      if (
        previous !== undefined &&
        now - previous < this.policy.deduplicationWindowMs
      ) {
        this.rejectedCount += 1;

        const result = {
          approved: false,
          reason: "duplicate",
          alertId: alert.id ?? null,
          evaluatedAt: new Date(now).toISOString(),
        };

        this.emit(EVENTS.ALERT_REJECTED, result);
        return result;
      }

      this.recentAlerts.set(key, now);
    }

    this.approvedCount += 1;

    const result = {
      approved: true,
      reason: null,
      alertId: alert.id ?? null,
      severity: this.normalizeSeverity(alert.severity),
      evaluatedAt: new Date(now).toISOString(),
    };

    this.emit(EVENTS.ALERT_APPROVED, {
      ...result,
      alert,
    });

    return result;
  }

  getRejectionReason(alert) {
    if (!this.policy.enabled) {
      return "policy-disabled";
    }

    if (!alert || typeof alert !== "object" || Array.isArray(alert)) {
      return "invalid-alert";
    }

    const ruleId = String(alert.ruleId ?? alert.rule?.id ?? "");
    const type = String(alert.type ?? "");
    const severity = this.normalizeSeverity(alert.severity);
    const message = String(alert.message ?? "").trim();

    if (ruleId && this.policy.blockedRuleIds.includes(ruleId)) {
      return "rule-blocked";
    }

    if (type && this.policy.blockedTypes.includes(type)) {
      return "type-blocked";
    }

    if (!this.policy.allowedSeverities.includes(severity)) {
      return "severity-not-allowed";
    }

    const minimum = SEVERITY_LEVELS[this.policy.minimumSeverity];

    if (
      minimum !== undefined &&
      SEVERITY_LEVELS[severity] < minimum
    ) {
      return "below-minimum-severity";
    }

    if (this.policy.requireMessage && !message) {
      return "message-required";
    }

    if (message.length > this.policy.maximumMessageLength) {
      return "message-too-long";
    }

    return null;
  }

  normalizePolicy(policy) {
    const allowedSeverities = Array.isArray(policy.allowedSeverities)
      ? [...new Set(policy.allowedSeverities.map(String))]
      : [...DEFAULT_POLICY.allowedSeverities];

    const blockedRuleIds = Array.isArray(policy.blockedRuleIds)
      ? [...new Set(policy.blockedRuleIds.map(String))]
      : [];

    const blockedTypes = Array.isArray(policy.blockedTypes)
      ? [...new Set(policy.blockedTypes.map(String))]
      : [];

    const minimumSeverity = String(
      policy.minimumSeverity ?? DEFAULT_POLICY.minimumSeverity
    );

    if (!(minimumSeverity in SEVERITY_LEVELS)) {
      throw new TypeError(
        `Invalid minimum severity: ${minimumSeverity}`
      );
    }

    for (const severity of allowedSeverities) {
      if (!(severity in SEVERITY_LEVELS)) {
        throw new TypeError(`Invalid allowed severity: ${severity}`);
      }
    }

    return {
      enabled: Boolean(policy.enabled),
      minimumSeverity,
      allowedSeverities,
      blockedRuleIds,
      blockedTypes,
      requireMessage: Boolean(policy.requireMessage),
      deduplicate: Boolean(policy.deduplicate),
      deduplicationWindowMs: Math.max(
        0,
        Number(policy.deduplicationWindowMs) || 0
      ),
      maximumMessageLength: Math.max(
        1,
        Math.floor(
          Number(policy.maximumMessageLength) ||
            DEFAULT_POLICY.maximumMessageLength
        )
      ),
    };
  }

  updatePolicy(changes = {}) {
    this.assertActive();

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Policy changes must be an object.");
    }

    this.policy = this.normalizePolicy({
      ...this.policy,
      ...changes,
    });

    this.recentAlerts.clear();

    const result = {
      policy: this.getPolicy(),
      updatedAt: new Date(this.clock()).toISOString(),
    };

    this.emit(EVENTS.POLICY_UPDATED, result);
    return result;
  }

  getDeduplicationKey(alert) {
    const ruleId = alert.ruleId ?? alert.rule?.id ?? "unknown";
    const type = alert.type ?? "general";
    const subject = alert.subject ?? alert.metric ?? alert.routeId ?? "global";

    return `${String(ruleId)}:${String(type)}:${String(subject)}`;
  }

  normalizeSeverity(severity) {
    const value = String(severity ?? "info").toLowerCase();
    return value in SEVERITY_LEVELS ? value : "info";
  }

  cleanupRecentAlerts(now = this.clock()) {
    const windowMs = this.policy.deduplicationWindowMs;

    for (const [key, timestamp] of this.recentAlerts) {
      if (now - timestamp >= windowMs) {
        this.recentAlerts.delete(key);
      }
    }
  }

  clearHistory() {
    this.assertActive();
    this.recentAlerts.clear();
  }

  getPolicy() {
    return {
      ...this.policy,
      allowedSeverities: [...this.policy.allowedSeverities],
      blockedRuleIds: [...this.policy.blockedRuleIds],
      blockedTypes: [...this.policy.blockedTypes],
    };
  }

  getStats() {
    return {
      approvedCount: this.approvedCount,
      rejectedCount: this.rejectedCount,
      recentAlertKeys: this.recentAlerts.size,
      policy: this.getPolicy(),
      disposed: this.disposed,
    };
  }

  subscribe(event, handler) {
    this.assertActive();

    if (typeof handler !== "function") {
      throw new TypeError("Event handler must be a function.");
    }

    if (typeof this.eventBus.on !== "function") {
      throw new Error(
        "The configured event bus does not support subscriptions."
      );
    }

    return this.eventBus.on(event, handler);
  }

  emit(event, payload) {
    try {
      if (typeof this.eventBus.emit === "function") {
        this.eventBus.emit(event, payload);
      } else if (typeof this.eventBus.publish === "function") {
        this.eventBus.publish(event, payload);
      }
    } catch (error) {
      try {
        this.logger.error?.(`Failed to emit "${event}".`, error);
      } catch {
        // Logging failures must not interrupt policy evaluation.
      }
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertPolicy has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.recentAlerts.clear();

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export { EVENTS as RouteStatisticsDashboardAlertPolicyEvents };

export default RouteStatisticsDashboardAlertPolicy;