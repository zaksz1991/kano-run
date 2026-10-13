const DEFAULT_STORAGE_KEY = "kanoRun.rulesEngine.alerts";
const DEFAULT_MAX_HISTORY = 1000;

const SEVERITIES = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

const ACTIVE_STATUSES = new Set(["active", "acknowledged"]);
const TERMINAL_STATUSES = new Set(["resolved", "dismissed"]);

function createId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function safeDate(value, fallback) {
  const date = value ? new Date(value) : new Date(fallback());

  return Number.isNaN(date.getTime())
    ? new Date(fallback()).toISOString()
    : date.toISOString();
}

function normalizeSeverity(value) {
  const severity = String(value ?? "medium").toLowerCase();

  if (SEVERITIES.includes(severity)) {
    return severity;
  }

  if (severity === "warning" || severity === "warn") {
    return "medium";
  }

  if (severity === "error") {
    return "high";
  }

  if (severity === "fatal") {
    return "critical";
  }

  if (severity === "notice" || severity === "debug") {
    return "info";
  }

  return "medium";
}

function normalizeStatus(value) {
  const status = String(value ?? "active").toLowerCase();

  if (
    status === "acknowledged" ||
    status === "resolved" ||
    status === "dismissed"
  ) {
    return status;
  }

  return "active";
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeAlert(input = {}, clock = Date.now) {
  const source =
    input && typeof input === "object" ? input : { message: String(input) };

  const now = new Date(clock()).toISOString();
  const id = String(source.id ?? source.alertId ?? createId());

  return {
    ...clone(source),
    id,
    alertId: id,
    title: String(source.title ?? source.name ?? "Rules engine alert"),
    message: String(
      source.message ??
        source.description ??
        source.reason ??
        source.error?.message ??
        "An alert was generated.",
    ),
    severity: normalizeSeverity(source.severity ?? source.level),
    status: normalizeStatus(source.status),
    source: String(source.source ?? "rules-engine"),
    ruleId: source.ruleId ?? source.rule?.id ?? null,
    ruleName: source.ruleName ?? source.rule?.name ?? null,
    createdAt: safeDate(source.createdAt ?? source.timestamp, clock),
    updatedAt: safeDate(source.updatedAt ?? source.createdAt, clock),
    acknowledgedAt: source.acknowledgedAt ?? null,
    resolvedAt: source.resolvedAt ?? null,
    dismissedAt: source.dismissedAt ?? null,
    occurrenceCount: Math.max(
      1,
      Number.isFinite(Number(source.occurrenceCount))
        ? Number(source.occurrenceCount)
        : 1,
    ),
  };
}

export class AlertQueueDashboardDiagnosticsRulesEngineAlerts {
  constructor({
    engine = null,
    analytics = null,
    storage = null,
    storageKey = DEFAULT_STORAGE_KEY,
    maxHistory = DEFAULT_MAX_HISTORY,
    clock = Date.now,
    onAlert = null,
    onError = null,
    autoSubscribe = true,
  } = {}) {
    this.engine = engine;
    this.analytics = analytics;
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || DEFAULT_MAX_HISTORY);
    this.clock = typeof clock === "function" ? clock : Date.now;
    this.onAlert = typeof onAlert === "function" ? onAlert : null;
    this.onError = typeof onError === "function" ? onError : null;

    this.alerts = new Map();
    this.listeners = new Set();
    this.engineUnsubscribe = null;
    this.destroyed = false;
    this.statistics = {
      created: 0,
      updated: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      errors: 0,
    };

    this.load();

    if (autoSubscribe && this.engine) {
      this.connect(this.engine);
    }
  }

  now() {
    return new Date(this.clock()).toISOString();
  }

  connect(engine = this.engine) {
    this.disconnect();

    if (!engine || typeof engine.subscribe !== "function") {
      this.engine = engine;
      return false;
    }

    this.engine = engine;

    try {
      const unsubscribe = engine.subscribe((event, payload) => {
        this.handleEngineEvent(event, payload);
      });

      if (typeof unsubscribe === "function") {
        this.engineUnsubscribe = unsubscribe;
      } else if (unsubscribe && typeof unsubscribe.unsubscribe === "function") {
        this.engineUnsubscribe = () => unsubscribe.unsubscribe();
      }

      return true;
    } catch (error) {
      this.reportError(error, "connect");
      return false;
    }
  }

  disconnect() {
    if (typeof this.engineUnsubscribe === "function") {
      try {
        this.engineUnsubscribe();
      } catch (error) {
        this.reportError(error, "disconnect");
      }
    }

    this.engineUnsubscribe = null;
  }

  handleEngineEvent(event, payload) {
    if (this.destroyed) {
      return;
    }

    const eventName =
      typeof event === "string"
        ? event
        : event?.type ?? event?.event ?? "";

    const data =
      typeof event === "object" && event !== null
        ? event.payload ?? event.data ?? event
        : payload;

    const normalizedName = String(eventName).toLowerCase();

    if (
      normalizedName.includes("error") ||
      normalizedName.includes("failed")
    ) {
      const error =
        data?.error ??
        data?.message ??
        data?.reason ??
        "Rules engine error";

      this.create({
        title: "Rules engine error",
        message: typeof error === "string" ? error : error.message,
        severity: "high",
        source: "rules-engine",
        details: data,
      });

      return;
    }

    if (
      normalizedName.includes("match") ||
      normalizedName.includes("alert") ||
      normalizedName.includes("trigger")
    ) {
      const matches = Array.isArray(data)
        ? data
        : Array.isArray(data?.matches)
          ? data.matches
          : Array.isArray(data?.alerts)
            ? data.alerts
            : [data];

      for (const match of matches) {
        if (!match || typeof match !== "object") {
          continue;
        }

        this.create({
          ...match,
          source: match.source ?? "rules-engine",
          ruleId: match.ruleId ?? match.rule?.id ?? null,
          ruleName: match.ruleName ?? match.rule?.name ?? null,
        });
      }
    }
  }

  create(input = {}) {
    if (this.destroyed) {
      return null;
    }

    const candidate = normalizeAlert(input, this.clock);
    const existing = this.alerts.get(candidate.id);

    if (existing) {
      const updated = {
        ...existing,
        ...candidate,
        id: existing.id,
        alertId: existing.id,
        createdAt: existing.createdAt,
        updatedAt: this.now(),
        occurrenceCount: existing.occurrenceCount + 1,
      };

      this.alerts.set(existing.id, updated);
      this.statistics.updated += 1;
      this.commit("updated", updated);
      return clone(updated);
    }

    const alert = {
      ...candidate,
      updatedAt: this.now(),
    };

    this.alerts.set(alert.id, alert);
    this.statistics.created += 1;
    this.trimHistory();
    this.commit("created", alert);

    if (this.onAlert) {
      try {
        this.onAlert(clone(alert));
      } catch (error) {
        this.reportError(error, "onAlert");
      }
    }

    return clone(alert);
  }

  add(input) {
    return this.create(input);
  }

  push(input) {
    return this.create(input);
  }

  enqueue(input) {
    return this.create(input);
  }

  get(id) {
    const alert = this.alerts.get(String(id));
    return alert ? clone(alert) : null;
  }

  getAlert(id) {
    return this.get(id);
  }

  getAll({
    status = null,
    severity = null,
    source = null,
    ruleId = null,
    search = "",
    activeOnly = false,
    limit = 0,
    offset = 0,
    sort = "newest",
  } = {}) {
    let results = Array.from(this.alerts.values());

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      const normalized = new Set(statuses.map(normalizeStatus));

      results = results.filter((alert) => normalized.has(alert.status));
    }

    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      const normalized = new Set(severities.map(normalizeSeverity));

      results = results.filter((alert) => normalized.has(alert.severity));
    }

    if (source) {
      results = results.filter((alert) => alert.source === source);
    }

    if (ruleId !== null) {
      results = results.filter(
        (alert) => String(alert.ruleId) === String(ruleId),
      );
    }

    if (activeOnly) {
      results = results.filter((alert) => ACTIVE_STATUSES.has(alert.status));
    }

    if (search) {
      const query = String(search).toLowerCase();

      results = results.filter((alert) =>
        [
          alert.title,
          alert.message,
          alert.ruleName,
          alert.ruleId,
          alert.source,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      );
    }

    results.sort((a, b) => {
      if (sort === "oldest") {
        return a.createdAt.localeCompare(b.createdAt);
      }

      if (sort === "severity") {
        return (
          SEVERITIES.indexOf(a.severity) -
            SEVERITIES.indexOf(b.severity) ||
          b.createdAt.localeCompare(a.createdAt)
        );
      }

      return b.createdAt.localeCompare(a.createdAt);
    });

    const start = Math.max(0, Number(offset) || 0);
    const end =
      Number(limit) > 0 ? start + Number(limit) : undefined;

    return clone(results.slice(start, end));
  }

  list(options = {}) {
    return this.getAll(options);
  }

  getActive(options = {}) {
    return this.getAll({ ...options, activeOnly: true });
  }

  acknowledge(id, metadata = {}) {
    return this.updateStatus(id, "acknowledged", metadata);
  }

  resolve(id, metadata = {}) {
    return this.updateStatus(id, "resolved", metadata);
  }

  dismiss(id, metadata = {}) {
    return this.updateStatus(id, "dismissed", metadata);
  }

  reopen(id, metadata = {}) {
    return this.updateStatus(id, "active", metadata);
  }

  updateStatus(id, status, metadata = {}) {
    if (this.destroyed) {
      return null;
    }

    const key = String(id);
    const existing = this.alerts.get(key);

    if (!existing) {
      return null;
    }

    const normalizedStatus = normalizeStatus(status);
    const now = this.now();

    const updated = {
      ...existing,
      ...clone(metadata),
      id: existing.id,
      alertId: existing.id,
      status: normalizedStatus,
      updatedAt: now,
    };

    if (normalizedStatus === "acknowledged") {
      updated.acknowledgedAt = now;
      this.statistics.acknowledged += 1;
    } else if (normalizedStatus === "resolved") {
      updated.resolvedAt = now;
      this.statistics.resolved += 1;
    } else if (normalizedStatus === "dismissed") {
      updated.dismissedAt = now;
      this.statistics.dismissed += 1;
    }

    if (normalizedStatus === "active") {
      updated.acknowledgedAt = null;
      updated.resolvedAt = null;
      updated.dismissedAt = null;
    }

    this.alerts.set(key, updated);
    this.commit(`status-${normalizedStatus}`, updated);

    return clone(updated);
  }

  acknowledgeAll(options = {}) {
    return this.bulkUpdate("acknowledged", options);
  }

  resolveAll(options = {}) {
    return this.bulkUpdate("resolved", options);
  }

  dismissAll(options = {}) {
    return this.bulkUpdate("dismissed", options);
  }

  bulkUpdate(status, options = {}) {
    const candidates = this.getAll({
      ...options,
      activeOnly: options.activeOnly ?? true,
    });

    const results = [];

    for (const alert of candidates) {
      const updated = this.updateStatus(alert.id, status);

      if (updated) {
        results.push(updated);
      }
    }

    return results;
  }

  remove(id) {
    const key = String(id);
    const existing = this.alerts.get(key);

    if (!existing) {
      return false;
    }

    this.alerts.delete(key);
    this.commit("removed", existing);
    return true;
  }

  clear({ includeResolved = true } = {}) {
    if (this.destroyed) {
      return 0;
    }

    const before = this.alerts.size;

    if (includeResolved) {
      this.alerts.clear();
    } else {
      for (const [id, alert] of this.alerts.entries()) {
        if (TERMINAL_STATUSES.has(alert.status)) {
          this.alerts.delete(id);
        }
      }
    }

    const removed = before - this.alerts.size;

    if (removed > 0) {
      this.commit("cleared", { removed });
    }

    return removed;
  }

  getSummary() {
    const alerts = Array.from(this.alerts.values());

    const bySeverity = Object.fromEntries(
      SEVERITIES.map((severity) => [severity, 0]),
    );

    const byStatus = {
      active: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
    };

    for (const alert of alerts) {
      bySeverity[alert.severity] += 1;
      byStatus[alert.status] = (byStatus[alert.status] ?? 0) + 1;
    }

    const active = byStatus.active + byStatus.acknowledged;
    const critical = alerts.filter(
      (alert) =>
        alert.severity === "critical" &&
        ACTIVE_STATUSES.has(alert.status),
    ).length;

    return {
      total: alerts.length,
      active,
      unacknowledged: byStatus.active,
      acknowledged: byStatus.acknowledged,
      resolved: byStatus.resolved,
      dismissed: byStatus.dismissed,
      critical,
      bySeverity,
      byStatus,
      statistics: { ...this.statistics },
    };
  }

  getStatistics() {
    return { ...this.statistics };
  }

  getHistory(options = {}) {
    return this.getAll(options);
  }

  trimHistory() {
    if (this.alerts.size <= this.maxHistory) {
      return;
    }

    const ordered = Array.from(this.alerts.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    this.alerts = new Map(
      ordered
        .slice(0, this.maxHistory)
        .map((alert) => [alert.id, alert]),
    );
  }

  load() {
    try {
      const raw = this.readStorage();

      if (!raw) {
        return false;
      }

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.alerts)
          ? parsed.alerts
          : [];

      this.alerts.clear();

      for (const record of records) {
        if (!record || typeof record !== "object") {
          continue;
        }

        const alert = normalizeAlert(record, this.clock);
        this.alerts.set(alert.id, alert);
      }

      if (parsed?.statistics && typeof parsed.statistics === "object") {
        this.statistics = {
          ...this.statistics,
          ...parsed.statistics,
        };
      }

      this.trimHistory();
      return true;
    } catch (error) {
      this.reportError(error, "load");
      return false;
    }
  }

  readStorage() {
    if (this.storage && typeof this.storage.getItem === "function") {
      return this.storage.getItem(this.storageKey);
    }

    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(this.storageKey);
    }

    return null;
  }

  persist() {
    try {
      const payload = JSON.stringify({
        version: 1,
        updatedAt: this.now(),
        alerts: Array.from(this.alerts.values()),
        statistics: this.statistics,
      });

      if (this.storage && typeof this.storage.setItem === "function") {
        this.storage.setItem(this.storageKey, payload);
        return true;
      }

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.storageKey, payload);
        return true;
      }

      return false;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  exportJSON({ pretty = true } = {}) {
    const payload = {
      version: 1,
      exportedAt: this.now(),
      summary: this.getSummary(),
      statistics: this.getStatistics(),
      alerts: this.getAll({ sort: "newest" }),
    };

    return JSON.stringify(payload, null, pretty ? 2 : 0);
  }

  importJSON(input, { replace = false } = {}) {
    if (this.destroyed) {
      return { imported: 0, skipped: 0, error: "Module is destroyed." };
    }

    let parsed;

    try {
      parsed = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      this.reportError(error, "import");
      return { imported: 0, skipped: 0, error: "Invalid JSON." };
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.alerts)
        ? parsed.alerts
        : null;

    if (!records) {
      return {
        imported: 0,
        skipped: 0,
        error: "Expected an array of alerts or an object containing alerts.",
      };
    }

    if (replace) {
      this.alerts.clear();
    }

    let imported = 0;
    let skipped = 0;

    for (const record of records) {
      if (!record || typeof record !== "object") {
        skipped += 1;
        continue;
      }

      const alert = normalizeAlert(record, this.clock);

      if (!alert.id) {
        skipped += 1;
        continue;
      }

      this.alerts.set(alert.id, alert);
      imported += 1;
    }

    this.trimHistory();
    this.persist();
    this.emit("imported", { imported, skipped });

    return { imported, skipped, error: null };
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
    this.statistics.errors += 1;

    if (this.onError) {
      try {
        this.onError(error, context);
      } catch {
        // Error reporting must not interrupt alert processing.
      }
    }

    if (context !== "listener") {
      this.emit("error", {
        context,
        message: error?.message ?? String(error),
      });
    }
  }

  refresh() {
    this.load();
    this.emit("refreshed", this.getSummary());
    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.disconnect();
    this.persist();
    this.listeners.clear();
    this.onAlert = null;
    this.onError = null;
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlerts;