import { Logger } from "./Logger.js";

const DEFAULT_KEY = "kanoRun.routeStatisticsDashboardAlerts";
const STORAGE_VERSION = 1;

export class RouteStatisticsDashboardAlertStorage {
  constructor({
    storage = globalThis.localStorage,
    key = DEFAULT_KEY,
    maxAlerts = 500,
    logger = null,
  } = {}) {
    this.storage = storage;
    this.key = String(key || DEFAULT_KEY);
    this.maxAlerts = Math.max(1, Math.floor(Number(maxAlerts) || 500));
    this.logger =
      logger ?? new Logger("RouteStatisticsDashboardAlertStorage");

    this.disposed = false;
    this.memoryFallback = null;
  }

  save(alerts, metadata = {}) {
    this.assertActive();

    if (!Array.isArray(alerts)) {
      throw new TypeError("Alerts must be supplied as an array.");
    }

    const records = alerts
      .filter((alert) => alert && typeof alert === "object")
      .slice(-this.maxAlerts)
      .map((alert) => this.normalizeAlert(alert));

    const payload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      metadata: this.normalizeMetadata(metadata),
      alerts: records,
    };

    const serialized = JSON.stringify(payload);

    try {
      if (!this.storage || typeof this.storage.setItem !== "function") {
        this.memoryFallback = serialized;
        return {
          success: true,
          persisted: false,
          count: records.length,
        };
      }

      this.storage.setItem(this.key, serialized);
      this.memoryFallback = null;

      return {
        success: true,
        persisted: true,
        count: records.length,
      };
    } catch (error) {
      this.logger?.warn?.(
        "Unable to persist dashboard alerts; using memory fallback.",
        error
      );

      this.memoryFallback = serialized;

      return {
        success: true,
        persisted: false,
        count: records.length,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  load() {
    this.assertActive();

    let serialized = null;

    try {
      serialized = this.storage?.getItem?.(this.key) ?? null;
    } catch (error) {
      this.logger?.warn?.(
        "Unable to read persisted dashboard alerts.",
        error
      );
    }

    if (!serialized) {
      serialized = this.memoryFallback;
    }

    if (!serialized) {
      return {
        success: true,
        found: false,
        alerts: [],
        metadata: {},
        savedAt: null,
      };
    }

    try {
      const payload = JSON.parse(serialized);

      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray(payload.alerts)
      ) {
        throw new Error("Stored alert data has an invalid structure.");
      }

      if (payload.version !== STORAGE_VERSION) {
        return {
          success: false,
          found: true,
          alerts: [],
          metadata: {},
          savedAt: payload.savedAt ?? null,
          error: `Unsupported storage version: ${payload.version}`,
        };
      }

      const alerts = payload.alerts
        .slice(-this.maxAlerts)
        .map((alert) => this.normalizeAlert(alert));

      return {
        success: true,
        found: true,
        alerts,
        metadata: this.normalizeMetadata(payload.metadata),
        savedAt: payload.savedAt ?? null,
      };
    } catch (error) {
      this.logger?.warn?.(
        "Stored dashboard alerts could not be parsed.",
        error
      );

      return {
        success: false,
        found: true,
        alerts: [],
        metadata: {},
        savedAt: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  restore(alertManager, { replace = false } = {}) {
    this.assertActive();

    if (!alertManager) {
      throw new TypeError("An alert manager is required for restoration.");
    }

    const result = this.load();

    if (!result.success) {
      return {
        ...result,
        restored: 0,
      };
    }

    if (replace && typeof alertManager.clear === "function") {
      alertManager.clear({ includePersistent: true });
    }

    let restored = 0;

    for (const alert of result.alerts) {
      try {
        this.restoreAlert(alertManager, alert);
        restored += 1;
      } catch (error) {
        this.logger?.warn?.(
          `Unable to restore alert "${alert.id}".`,
          error
        );
      }
    }

    return {
      ...result,
      restored,
    };
  }

  restoreAlert(alertManager, alert) {
    if (typeof alertManager.importAlert === "function") {
      return alertManager.importAlert(alert);
    }

    if (!alertManager.alerts || typeof alertManager.alerts.set !== "function") {
      throw new Error(
        "The alert manager does not support importing saved alerts."
      );
    }

    const normalized = this.normalizeAlert(alert);

    if (alertManager.alerts.has(normalized.id)) {
      return false;
    }

    alertManager.alerts.set(normalized.id, normalized);
    return true;
  }

  exportJSON({ pretty = true } = {}) {
    this.assertActive();

    const result = this.load();

    if (!result.success) {
      throw new Error(result.error || "Unable to export dashboard alerts.");
    }

    const payload = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      savedAt: result.savedAt,
      metadata: result.metadata,
      alerts: result.alerts,
    };

    return JSON.stringify(payload, null, pretty ? 2 : 0);
  }

  importJSON(input, { merge = true } = {}) {
    this.assertActive();

    let payload;

    try {
      payload = typeof input === "string" ? JSON.parse(input) : input;
    } catch {
      throw new TypeError("Import data must be valid JSON.");
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray(payload.alerts)
    ) {
      throw new TypeError("Import data does not contain an alerts array.");
    }

    if (payload.version !== STORAGE_VERSION) {
      throw new Error(
        `Unsupported import version: ${String(payload.version)}`
      );
    }

    const imported = payload.alerts
      .slice(-this.maxAlerts)
      .map((alert) => this.normalizeAlert(alert));

    let combined = imported;

    if (merge) {
      const existing = this.load();

      if (existing.success) {
        const byId = new Map(
          existing.alerts.map((alert) => [alert.id, alert])
        );

        for (const alert of imported) {
          byId.set(alert.id, alert);
        }

        combined = [...byId.values()].slice(-this.maxAlerts);
      }
    }

    return this.save(combined, {
      ...this.normalizeMetadata(payload.metadata),
      importedAt: new Date().toISOString(),
    });
  }

  remove() {
    this.assertActive();

    let removed = false;

    try {
      if (this.storage && typeof this.storage.removeItem === "function") {
        this.storage.removeItem(this.key);
        removed = true;
      }
    } catch (error) {
      this.logger?.warn?.(
        "Unable to remove persisted dashboard alerts.",
        error
      );
    }

    this.memoryFallback = null;

    return removed;
  }

  getStorageInfo() {
    this.assertActive();

    let available = false;

    try {
      available =
        Boolean(this.storage) &&
        typeof this.storage.getItem === "function" &&
        typeof this.storage.setItem === "function";
    } catch {
      available = false;
    }

    const result = this.load();

    return {
      key: this.key,
      version: STORAGE_VERSION,
      available,
      found: result.found,
      count: result.alerts.length,
      savedAt: result.savedAt,
      memoryFallbackActive: this.memoryFallback !== null,
    };
  }

  normalizeAlert(alert) {
    if (!alert || typeof alert !== "object") {
      throw new TypeError("Invalid alert record.");
    }

    const now = new Date().toISOString();
    const id = String(alert.id ?? "").trim();
    const message = String(alert.message ?? "").trim();

    if (!id || !message) {
      throw new TypeError("Alert records require an ID and message.");
    }

    const validSeverities = new Set([
      "info",
      "warning",
      "error",
      "critical",
    ]);

    const validStatuses = new Set([
      "active",
      "resolved",
      "dismissed",
    ]);

    const severity = validSeverities.has(alert.severity)
      ? alert.severity
      : "warning";

    const status = validStatuses.has(alert.status)
      ? alert.status
      : "active";

    return {
      id,
      key: alert.key == null ? null : String(alert.key),
      title: String(alert.title ?? "Dashboard alert").slice(0, 160),
      message: message.slice(0, 1000),
      severity,
      source: String(alert.source ?? "dashboard").slice(0, 120),
      metadata: this.normalizeMetadata(alert.metadata),
      persistent: Boolean(alert.persistent),
      status,
      createdAt: this.normalizeTimestamp(alert.createdAt, now),
      updatedAt: this.normalizeTimestamp(alert.updatedAt, now),
      resolvedAt: alert.resolvedAt
        ? this.normalizeTimestamp(alert.resolvedAt, now)
        : null,
      dismissedAt: alert.dismissedAt
        ? this.normalizeTimestamp(alert.dismissedAt, now)
        : null,
      occurrences: Math.max(
        1,
        Math.floor(Number(alert.occurrences) || 1)
      ),
      ...(alert.resolution && typeof alert.resolution === "object"
        ? {
            resolution: {
              message: String(alert.resolution.message ?? "").slice(0, 500),
              metadata: this.normalizeMetadata(alert.resolution.metadata),
            },
          }
        : {}),
    };
  }

  normalizeTimestamp(value, fallback) {
    if (!value) {
      return fallback;
    }

    const parsed = Date.parse(value);

    return Number.isNaN(parsed)
      ? fallback
      : new Date(parsed).toISOString();
  }

  normalizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch {
      return {};
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertStorage has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.memoryFallback = null;
    this.disposed = true;
  }
}

export {
  DEFAULT_KEY as ROUTE_STATISTICS_DASHBOARD_ALERT_STORAGE_KEY,
  STORAGE_VERSION as ROUTE_STATISTICS_DASHBOARD_ALERT_STORAGE_VERSION,
};

export default RouteStatisticsDashboardAlertStorage;