const DEFAULT_STORAGE_KEY = "kanoRun.rulesEngine.alertsAnalytics";
const DEFAULT_MAX_HISTORY = 2000;

const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const STATUSES = ["active", "acknowledged", "resolved", "dismissed"];

function clone(value) {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeSeverity(value) {
  const severity = String(value ?? "medium").toLowerCase();

  if (severity === "fatal") return "critical";
  if (severity === "error") return "high";
  if (severity === "warning" || severity === "warn") return "medium";
  if (severity === "notice" || severity === "debug") return "info";

  return SEVERITIES.includes(severity) ? severity : "medium";
}

function normalizeStatus(value) {
  const status = String(value ?? "active").toLowerCase();

  return STATUSES.includes(status) ? status : "active";
}

function normalizeTimestamp(value, clock) {
  const date = value ? new Date(value) : new Date(clock());

  return Number.isNaN(date.getTime())
    ? new Date(clock()).toISOString()
    : date.toISOString();
}

function makeId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `alert-analytics-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeRecord(input = {}, clock = Date.now) {
  const source =
    input && typeof input === "object" ? input : { message: String(input) };

  return {
    id: String(source.id ?? source.alertId ?? makeId()),
    type: String(source.type ?? "created"),
    alertId: source.alertId ?? source.id ?? null,
    ruleId: source.ruleId ?? source.rule?.id ?? null,
    ruleName: source.ruleName ?? source.rule?.name ?? null,
    title: String(source.title ?? source.name ?? "Rules engine alert"),
    message: String(
      source.message ??
        source.description ??
        source.reason ??
        "An alert was generated.",
    ),
    severity: normalizeSeverity(source.severity ?? source.level),
    status: normalizeStatus(source.status),
    source: String(source.source ?? "rules-engine"),
    occurrenceCount: Math.max(1, Number(source.occurrenceCount) || 1),
    timestamp: normalizeTimestamp(
      source.timestamp ?? source.createdAt ?? source.updatedAt,
      clock,
    ),
    metadata:
      source.metadata && typeof source.metadata === "object"
        ? clone(source.metadata)
        : null,
  };
}

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsAnalytics {
  constructor({
    alerts = null,
    store = null,
    storage = null,
    storageKey = DEFAULT_STORAGE_KEY,
    maxHistory = DEFAULT_MAX_HISTORY,
    clock = Date.now,
    onError = null,
    autoSubscribe = true,
  } = {}) {
    this.alerts = alerts;
    this.store = store;
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || DEFAULT_MAX_HISTORY);
    this.clock = typeof clock === "function" ? clock : Date.now;
    this.onError = typeof onError === "function" ? onError : null;

    this.history = [];
    this.listeners = new Set();
    this.unsubscribeAlerts = null;
    this.unsubscribeStore = null;
    this.destroyed = false;

    this.statistics = {
      events: 0,
      created: 0,
      updated: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      removed: 0,
      imported: 0,
      errors: 0,
    };

    this.load();

    if (autoSubscribe) {
      if (this.alerts?.subscribe) {
        this.unsubscribeAlerts = this.alerts.subscribe(
          (event, payload) => this.handleEvent(event, payload),
        );
      }

      if (this.store?.subscribe && this.store !== this.alerts) {
        this.unsubscribeStore = this.store.subscribe(
          (event, payload) => this.handleEvent(event, payload),
        );
      }
    }
  }

  now() {
    return new Date(this.clock()).toISOString();
  }

  getStorage() {
    if (this.storage) return this.storage;

    if (typeof localStorage !== "undefined") {
      return localStorage;
    }

    return null;
  }

  handleEvent(event, payload) {
    if (this.destroyed) return;

    const type =
      typeof event === "string"
        ? event
        : event?.type ?? event?.event ?? "unknown";

    const data =
      typeof event === "object" && event !== null
        ? event.payload ?? event.data ?? event
        : payload;

    const normalizedType = String(type).toLowerCase();

    if (normalizedType === "error" || normalizedType.includes("failed")) {
      this.recordError(data, { event: normalizedType });
      return;
    }

    if (
      normalizedType.includes("created") ||
      normalizedType.includes("added") ||
      normalizedType.includes("alert") ||
      normalizedType.includes("matched")
    ) {
      if (normalizedType.includes("removed")) {
        this.recordEvent("removed", data);
      } else if (normalizedType.includes("cleared")) {
        this.recordEvent("cleared", data);
      } else {
        this.recordEvent(normalizedType, data);
      }

      return;
    }

    this.recordEvent(normalizedType, data);
  }

  recordEvent(type, input = {}) {
    if (this.destroyed) return null;

    const data =
      input && typeof input === "object" ? input : { message: String(input) };

    const record = normalizeRecord(
      {
        ...data,
        type,
        alertId: data.alertId ?? data.id ?? null,
        timestamp: data.timestamp ?? data.updatedAt ?? this.now(),
      },
      this.clock,
    );

    this.history.push(record);
    this.statistics.events += 1;

    const normalizedType = String(type).toLowerCase();

    if (normalizedType.includes("created") || normalizedType.includes("added")) {
      this.statistics.created += 1;
    } else if (normalizedType.includes("updated")) {
      this.statistics.updated += 1;
    } else if (normalizedType.includes("acknowledged")) {
      this.statistics.acknowledged += 1;
    } else if (normalizedType.includes("resolved")) {
      this.statistics.resolved += 1;
    } else if (normalizedType.includes("dismissed")) {
      this.statistics.dismissed += 1;
    } else if (normalizedType.includes("removed")) {
      this.statistics.removed += 1;
    }

    this.trim();
    this.commit("recorded", record);

    return clone(record);
  }

  recordAlert(alert, type = "created") {
    return this.recordEvent(type, alert);
  }

  recordCreated(alert) {
    return this.recordEvent("created", alert);
  }

  recordUpdated(alert) {
    return this.recordEvent("updated", alert);
  }

  recordAcknowledged(alert) {
    return this.recordEvent("acknowledged", alert);
  }

  recordResolved(alert) {
    return this.recordEvent("resolved", alert);
  }

  recordDismissed(alert) {
    return this.recordEvent("dismissed", alert);
  }

  recordRemoved(alert) {
    return this.recordEvent("removed", alert);
  }

  recordError(error, metadata = {}) {
    const message =
      typeof error === "string"
        ? error
        : error?.message ?? "Unknown analytics error";

    this.statistics.errors += 1;

    return this.recordEvent("error", {
      title: "Alert analytics error",
      message,
      severity: "high",
      source: "alerts-analytics",
      metadata,
    });
  }

  getHistory({
    type = null,
    severity = null,
    status = null,
    ruleId = null,
    search = "",
    from = null,
    to = null,
    limit = 0,
    offset = 0,
    sort = "newest",
  } = {}) {
    let results = [...this.history];

    if (type) {
      const types = new Set(
        (Array.isArray(type) ? type : [type]).map((value) =>
          String(value).toLowerCase(),
        ),
      );

      results = results.filter((item) =>
        types.has(String(item.type).toLowerCase()),
      );
    }

    if (severity) {
      const severities = new Set(
        (Array.isArray(severity) ? severity : [severity]).map(
          normalizeSeverity,
        ),
      );

      results = results.filter((item) => severities.has(item.severity));
    }

    if (status) {
      const statuses = new Set(
        (Array.isArray(status) ? status : [status]).map(normalizeStatus),
      );

      results = results.filter((item) => statuses.has(item.status));
    }

    if (ruleId !== null && ruleId !== undefined) {
      results = results.filter(
        (item) => String(item.ruleId) === String(ruleId),
      );
    }

    if (search) {
      const query = String(search).toLowerCase();

      results = results.filter((item) =>
        [
          item.title,
          item.message,
          item.ruleName,
          item.ruleId,
          item.type,
          item.source,
        ]
          .filter((value) => value !== null && value !== undefined)
          .some((value) => String(value).toLowerCase().includes(query)),
      );
    }

    if (from) {
      const start = new Date(from).getTime();

      if (!Number.isNaN(start)) {
        results = results.filter(
          (item) => new Date(item.timestamp).getTime() >= start,
        );
      }
    }

    if (to) {
      const end = new Date(to).getTime();

      if (!Number.isNaN(end)) {
        results = results.filter(
          (item) => new Date(item.timestamp).getTime() <= end,
        );
      }
    }

    results.sort((a, b) => {
      if (sort === "oldest") {
        return a.timestamp.localeCompare(b.timestamp);
      }

      return b.timestamp.localeCompare(a.timestamp);
    });

    const startIndex = Math.max(0, Number(offset) || 0);
    const endIndex =
      Number(limit) > 0 ? startIndex + Number(limit) : undefined;

    return clone(results.slice(startIndex, endIndex));
  }

  getMetrics({ from = null, to = null } = {}) {
    const history = this.getHistory({ from, to });

    const byType = {};
    const bySeverity = Object.fromEntries(
      SEVERITIES.map((severity) => [severity, 0]),
    );
    const byStatus = Object.fromEntries(
      STATUSES.map((status) => [status, 0]),
    );
    const bySource = {};
    const byRule = {};

    for (const record of history) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
      bySeverity[record.severity] += 1;
      byStatus[record.status] += 1;
      bySource[record.source] = (bySource[record.source] ?? 0) + 1;

      if (record.ruleId !== null && record.ruleId !== undefined) {
        const key = String(record.ruleId);

        if (!byRule[key]) {
          byRule[key] = {
            ruleId: record.ruleId,
            ruleName: record.ruleName,
            events: 0,
            critical: 0,
            errors: 0,
          };
        }

        byRule[key].events += 1;

        if (record.severity === "critical") {
          byRule[key].critical += 1;
        }

        if (record.type === "error") {
          byRule[key].errors += 1;
        }
      }
    }

    return {
      totalEvents: history.length,
      byType,
      bySeverity,
      byStatus,
      bySource,
      byRule,
      statistics: this.getStatistics(),
    };
  }

  getRuleBreakdown(options = {}) {
    const metrics = this.getMetrics(options);

    return Object.values(metrics.byRule).sort(
      (a, b) => b.events - a.events,
    );
  }

  getSeverityBreakdown(options = {}) {
    return this.getMetrics(options).bySeverity;
  }

  getStatusBreakdown(options = {}) {
    return this.getMetrics(options).byStatus;
  }

  getTimeline({
    interval = "hour",
    from = null,
    to = null,
  } = {}) {
    const records = this.getHistory({ from, to });
    const buckets = new Map();

    for (const record of records) {
      const date = new Date(record.timestamp);

      if (Number.isNaN(date.getTime())) continue;

      let key;

      if (interval === "day") {
        key = date.toISOString().slice(0, 10);
      } else if (interval === "minute") {
        date.setSeconds(0, 0);
        key = date.toISOString();
      } else {
        date.setMinutes(0, 0, 0);
        key = date.toISOString();
      }

      if (!buckets.has(key)) {
        buckets.set(key, {
          timestamp: key,
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          errors: 0,
          created: 0,
          resolved: 0,
        });
      }

      const bucket = buckets.get(key);
      bucket.total += 1;
      bucket[record.severity] += 1;

      if (record.type === "error") bucket.errors += 1;
      if (record.type.includes("created")) bucket.created += 1;
      if (record.type.includes("resolved")) bucket.resolved += 1;
    }

    return Array.from(buckets.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }

  getSummary(options = {}) {
    const metrics = this.getMetrics(options);
    const activeAlerts = this.getActiveAlerts();
    const criticalActive = activeAlerts.filter(
      (alert) => normalizeSeverity(alert.severity) === "critical",
    ).length;

    return {
      totalEvents: metrics.totalEvents,
      activeAlerts: activeAlerts.length,
      criticalActive,
      createdEvents: this.statistics.created,
      acknowledgedEvents: this.statistics.acknowledged,
      resolvedEvents: this.statistics.resolved,
      dismissedEvents: this.statistics.dismissed,
      errorEvents: this.statistics.errors,
      bySeverity: metrics.bySeverity,
      byStatus: metrics.byStatus,
      byType: metrics.byType,
    };
  }

  getActiveAlerts() {
    const source = this.alerts ?? this.store;

    if (typeof source?.getActive === "function") {
      return source.getActive();
    }

    if (typeof source?.getAll === "function") {
      return source.getAll({ activeOnly: true });
    }

    if (typeof source?.list === "function") {
      return source.list({ activeOnly: true });
    }

    return [];
  }

  getStatistics() {
    return { ...this.statistics };
  }

  trim() {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  load() {
    try {
      const storage = this.getStorage();
      const raw = storage?.getItem?.(this.storageKey);

      if (!raw) return false;

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.history)
          ? parsed.history
          : [];

      this.history = records
        .filter((record) => record && typeof record === "object")
        .map((record) => normalizeRecord(record, this.clock));

      if (parsed?.statistics && typeof parsed.statistics === "object") {
        this.statistics = {
          ...this.statistics,
          ...parsed.statistics,
        };
      }

      this.trim();
      return true;
    } catch (error) {
      this.reportError(error, "load");
      return false;
    }
  }

  persist() {
    try {
      const storage = this.getStorage();

      if (!storage || typeof storage.setItem !== "function") {
        return false;
      }

      storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          updatedAt: this.now(),
          history: this.history,
          statistics: this.statistics,
        }),
      );

      return true;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  exportJSON({ pretty = true } = {}) {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: this.now(),
        summary: this.getSummary(),
        statistics: this.getStatistics(),
        history: this.getHistory(),
      },
      null,
      pretty ? 2 : 0,
    );
  }

  importJSON(input, { replace = false } = {}) {
    let parsed;

    try {
      parsed = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      this.reportError(error, "import");
      return { imported: 0, skipped: 0, error: "Invalid JSON." };
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.history)
        ? parsed.history
        : null;

    if (!records) {
      return {
        imported: 0,
        skipped: 0,
        error: "Expected an array or an object containing history.",
      };
    }

    if (replace) {
      this.history = [];
    }

    let imported = 0;
    let skipped = 0;

    for (const item of records) {
      if (!item || typeof item !== "object") {
        skipped += 1;
        continue;
      }

      this.history.push(normalizeRecord(item, this.clock));
      imported += 1;
    }

    this.statistics.imported += imported;
    this.trim();
    this.commit("imported", { imported, skipped });

    return { imported, skipped, error: null };
  }

  clearHistory() {
    const removed = this.history.length;
    this.history = [];

    this.commit("history-cleared", { removed });

    return removed;
  }

  resetStatistics() {
    this.statistics = {
      events: 0,
      created: 0,
      updated: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      removed: 0,
      imported: 0,
      errors: 0,
    };

    this.commit("statistics-reset", this.statistics);

    return this.getStatistics();
  }

  subscribe(listener) {
    if (typeof listener !== "function" || this.destroyed) {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(type, payload = {}) {
    const event = {
      type,
      payload: clone(payload),
      timestamp: this.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(type, clone(event.payload), clone(event));
      } catch (error) {
        this.reportError(error, "listener");
      }
    }
  }

  commit(type, payload) {
    this.persist();
    this.emit(type, payload);
  }

  reportError(error, context = "unknown") {
    if (context !== "listener") {
      this.statistics.errors += 1;
    }

    if (this.onError) {
      try {
        this.onError(error, context);
      } catch {
        // Ignore failures inside the error callback.
      }
    }
  }

  refresh() {
    this.load();
    this.emit("refreshed", this.getSummary());

    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) return;

    if (typeof this.unsubscribeAlerts === "function") {
      this.unsubscribeAlerts();
    }

    if (typeof this.unsubscribeStore === "function") {
      this.unsubscribeStore();
    }

    this.persist();
    this.listeners.clear();
    this.unsubscribeAlerts = null;
    this.unsubscribeStore = null;
    this.onError = null;
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsAnalytics;