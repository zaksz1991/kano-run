import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  ALERT_CREATED: "routeStatisticsAlerts:created",
  ALERT_UPDATED: "routeStatisticsAlerts:updated",
  ALERT_RESOLVED: "routeStatisticsAlerts:resolved",
  ALERT_DISMISSED: "routeStatisticsAlerts:dismissed",
  ALERTS_CLEARED: "routeStatisticsAlerts:cleared",
});

const SEVERITIES = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
});

const VALID_SEVERITIES = new Set(Object.values(SEVERITIES));

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSeverity(severity) {
  const value = String(severity ?? SEVERITIES.WARNING).toLowerCase();

  if (!VALID_SEVERITIES.has(value)) {
    throw new TypeError(`Invalid alert severity: ${value}`);
  }

  return value;
}

function normalizeMessage(message) {
  const value = String(message ?? "").trim();

  if (!value) {
    throw new TypeError("Alert message cannot be empty.");
  }

  return value.slice(0, 1000);
}

export class RouteStatisticsDashboardAlerts {
  constructor({
    eventBus = null,
    logger = null,
    maxAlerts = 200,
    deduplicate = true,
    autoResolve = true,
  } = {}) {
    this.eventBus = eventBus ?? new EventBus();
    this.logger = logger ?? new Logger("RouteStatisticsDashboardAlerts");

    this.maxAlerts = Math.max(1, Math.floor(Number(maxAlerts) || 200));
    this.deduplicate = Boolean(deduplicate);
    this.autoResolve = Boolean(autoResolve);

    this.alerts = new Map();
    this.listeners = new Set();
    this.disposed = false;
  }

  create({
    key = null,
    title = "Dashboard alert",
    message,
    severity = SEVERITIES.WARNING,
    source = "dashboard",
    metadata = {},
    persistent = false,
  } = {}) {
    this.assertActive();

    const normalizedMessage = normalizeMessage(message);
    const normalizedSeverity = normalizeSeverity(severity);
    const normalizedKey = key ? String(key).trim() : null;

    if (this.deduplicate && normalizedKey) {
      const existing = this.findActiveByKey(normalizedKey);

      if (existing) {
        return this.update(existing.id, {
          title,
          message: normalizedMessage,
          severity: normalizedSeverity,
          source,
          metadata,
          persistent,
        });
      }
    }

    const now = new Date().toISOString();

    const alert = {
      id: createId(),
      key: normalizedKey,
      title: String(title || "Dashboard alert").slice(0, 160),
      message: normalizedMessage,
      severity: normalizedSeverity,
      source: String(source || "dashboard").slice(0, 120),
      metadata: this.cloneMetadata(metadata),
      persistent: Boolean(persistent),
      status: "active",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      dismissedAt: null,
      occurrences: 1,
    };

    this.alerts.set(alert.id, alert);
    this.trimAlerts();
    this.emit(EVENTS.ALERT_CREATED, alert);

    return this.cloneAlert(alert);
  }

  update(id, changes = {}) {
    this.assertActive();

    const alert = this.alerts.get(String(id));

    if (!alert) {
      return null;
    }

    if (alert.status !== "active") {
      return this.cloneAlert(alert);
    }

    if (changes.title !== undefined) {
      alert.title = String(changes.title || "Dashboard alert").slice(0, 160);
    }

    if (changes.message !== undefined) {
      alert.message = normalizeMessage(changes.message);
    }

    if (changes.severity !== undefined) {
      alert.severity = normalizeSeverity(changes.severity);
    }

    if (changes.source !== undefined) {
      alert.source = String(changes.source || "dashboard").slice(0, 120);
    }

    if (changes.metadata !== undefined) {
      alert.metadata = this.cloneMetadata(changes.metadata);
    }

    if (changes.persistent !== undefined) {
      alert.persistent = Boolean(changes.persistent);
    }

    alert.occurrences += 1;
    alert.updatedAt = new Date().toISOString();

    this.emit(EVENTS.ALERT_UPDATED, alert);

    return this.cloneAlert(alert);
  }

  resolve(id, resolution = {}) {
    this.assertActive();

    const alert = this.alerts.get(String(id));

    if (!alert || alert.status !== "active") {
      return null;
    }

    const now = new Date().toISOString();

    alert.status = "resolved";
    alert.resolvedAt = now;
    alert.updatedAt = now;
    alert.resolution = {
      message: String(resolution.message ?? "").slice(0, 500),
      metadata: this.cloneMetadata(resolution.metadata ?? {}),
    };

    this.emit(EVENTS.ALERT_RESOLVED, alert);

    return this.cloneAlert(alert);
  }

  resolveByKey(key, resolution = {}) {
    this.assertActive();

    const normalizedKey = String(key ?? "").trim();

    if (!normalizedKey) {
      return [];
    }

    const resolved = [];

    for (const alert of this.alerts.values()) {
      if (alert.key === normalizedKey && alert.status === "active") {
        const result = this.resolve(alert.id, resolution);

        if (result) {
          resolved.push(result);
        }
      }
    }

    return resolved;
  }

  dismiss(id) {
    this.assertActive();

    const alert = this.alerts.get(String(id));

    if (!alert || alert.status !== "active") {
      return null;
    }

    const now = new Date().toISOString();

    alert.status = "dismissed";
    alert.dismissedAt = now;
    alert.updatedAt = now;

    this.emit(EVENTS.ALERT_DISMISSED, alert);

    return this.cloneAlert(alert);
  }

  recordCheckResult(result = {}) {
    this.assertActive();

    const issues = Array.isArray(result.issues) ? result.issues : [];
    const activeKeys = new Set();

    for (const issue of issues) {
      const message =
        typeof issue === "string"
          ? issue
          : String(issue?.message ?? "Dashboard health check failed.");

      const key = `health:${message}`;
      activeKeys.add(key);

      this.create({
        key,
        title: "Dashboard health warning",
        message,
        severity: result.severity ?? SEVERITIES.WARNING,
        source: "health-monitor",
        metadata: {
          checkedAt: result.checkedAt ?? new Date().toISOString(),
          durationMs: Number(result.durationMs) || 0,
        },
        persistent: true,
      });
    }

    if (this.autoResolve) {
      for (const alert of this.alerts.values()) {
        if (
          alert.status === "active" &&
          alert.source === "health-monitor" &&
          alert.key &&
          !activeKeys.has(alert.key)
        ) {
          this.resolve(alert.id, {
            message: "The corresponding health issue is no longer reported.",
          });
        }
      }
    }

    return this.getActive();
  }

  findActiveByKey(key) {
    for (const alert of this.alerts.values()) {
      if (alert.key === key && alert.status === "active") {
        return alert;
      }
    }

    return null;
  }

  get(id) {
    const alert = this.alerts.get(String(id));
    return alert ? this.cloneAlert(alert) : null;
  }

  getAll({
    status = null,
    severity = null,
    source = null,
    limit = null,
  } = {}) {
    this.assertActive();

    let results = [...this.alerts.values()];

    if (status) {
      results = results.filter((alert) => alert.status === status);
    }

    if (severity) {
      const normalizedSeverity = normalizeSeverity(severity);
      results = results.filter(
        (alert) => alert.severity === normalizedSeverity
      );
    }

    if (source) {
      results = results.filter(
        (alert) => alert.source === String(source)
      );
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (limit !== null && Number.isFinite(Number(limit))) {
      results = results.slice(0, Math.max(0, Math.floor(Number(limit))));
    }

    return results.map((alert) => this.cloneAlert(alert));
  }

  getActive(options = {}) {
    return this.getAll({ ...options, status: "active" });
  }

  getSummary() {
    this.assertActive();

    const summary = {
      total: this.alerts.size,
      active: 0,
      resolved: 0,
      dismissed: 0,
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
    };

    for (const alert of this.alerts.values()) {
      if (Object.hasOwn(summary, alert.status)) {
        summary[alert.status] += 1;
      }

      if (alert.status === "active") {
        summary.bySeverity[alert.severity] += 1;
      }
    }

    return summary;
  }

  clear({ includePersistent = false } = {}) {
    this.assertActive();

    let removed = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (!includePersistent && alert.persistent) {
        continue;
      }

      this.alerts.delete(id);
      removed += 1;
    }

    this.emit(EVENTS.ALERTS_CLEARED, {
      removed,
      clearedAt: new Date().toISOString(),
    });

    return removed;
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Alert listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(type, alert) {
    const payload = this.cloneAlert(alert);

    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(type, payload);
      } else if (typeof this.eventBus?.dispatch === "function") {
        this.eventBus.dispatch(type, payload);
      }
    } catch (error) {
      this.logger?.warn?.("Alert event dispatch failed.", error);
    }

    const event = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logger?.warn?.("Alert listener failed.", error);
      }
    }
  }

  trimAlerts() {
    if (this.alerts.size <= this.maxAlerts) {
      return;
    }

    const removable = [...this.alerts.values()]
      .filter((alert) => alert.status !== "active" && !alert.persistent)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

    while (this.alerts.size > this.maxAlerts && removable.length > 0) {
      this.alerts.delete(removable.shift().id);
    }

    if (this.alerts.size > this.maxAlerts) {
      const oldest = [...this.alerts.values()]
        .filter((alert) => !alert.persistent)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      while (this.alerts.size > this.maxAlerts && oldest.length > 0) {
        this.alerts.delete(oldest.shift().id);
      }
    }
  }

  cloneMetadata(metadata) {
    if (metadata === null || typeof metadata !== "object") {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch {
      return {};
    }
  }

  cloneAlert(alert) {
    return {
      ...alert,
      metadata: this.cloneMetadata(alert.metadata),
      ...(alert.resolution
        ? {
            resolution: {
              ...alert.resolution,
              metadata: this.cloneMetadata(alert.resolution.metadata),
            },
          }
        : {}),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlerts has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.listeners.clear();
    this.alerts.clear();
    this.disposed = true;
  }
}

export {
  EVENTS as RouteStatisticsDashboardAlertsEvents,
  SEVERITIES as RouteStatisticsDashboardAlertSeverities,
};

export default RouteStatisticsDashboardAlerts;