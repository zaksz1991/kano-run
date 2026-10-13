const DEFAULT_STORAGE_KEY = "kanoRun.rulesEngine.alertsStore";
const DEFAULT_MAX_HISTORY = 1500;

const VALID_STATUSES = new Set([
  "active",
  "acknowledged",
  "resolved",
  "dismissed",
]);

const VALID_SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

function createId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `alert-store-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

  return VALID_SEVERITIES.has(severity) ? severity : "medium";
}

function normalizeStatus(value) {
  const status = String(value ?? "active").toLowerCase();

  return VALID_STATUSES.has(status) ? status : "active";
}

function toISOString(value, clock) {
  const date = value ? new Date(value) : new Date(clock());

  return Number.isNaN(date.getTime())
    ? new Date(clock()).toISOString()
    : date.toISOString();
}

function normalizeAlert(input, clock) {
  const source =
    input && typeof input === "object" ? input : { message: String(input) };

  const id = String(source.id ?? source.alertId ?? createId());
  const createdAt = toISOString(source.createdAt ?? source.timestamp, clock);

  return {
    ...clone(source),
    id,
    alertId: id,
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
    ruleId: source.ruleId ?? source.rule?.id ?? null,
    ruleName: source.ruleName ?? source.rule?.name ?? null,
    createdAt,
    updatedAt: toISOString(source.updatedAt ?? createdAt, clock),
    acknowledgedAt: source.acknowledgedAt ?? null,
    resolvedAt: source.resolvedAt ?? null,
    dismissedAt: source.dismissedAt ?? null,
    occurrenceCount: Math.max(
      1,
      Number(source.occurrenceCount) || 1,
    ),
  };
}

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsStore {
  constructor({
    storage = null,
    storageKey = DEFAULT_STORAGE_KEY,
    maxHistory = DEFAULT_MAX_HISTORY,
    clock = Date.now,
    initialAlerts = [],
    onError = null,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || DEFAULT_MAX_HISTORY);
    this.clock = typeof clock === "function" ? clock : Date.now;
    this.onError = typeof onError === "function" ? onError : null;

    this.records = new Map();
    this.listeners = new Set();
    this.destroyed = false;

    this.statistics = {
      created: 0,
      updated: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      removed: 0,
      errors: 0,
    };

    this.load();

    if (this.records.size === 0 && Array.isArray(initialAlerts)) {
      for (const alert of initialAlerts) {
        if (alert && typeof alert === "object") {
          const normalized = normalizeAlert(alert, this.clock);
          this.records.set(normalized.id, normalized);
        }
      }

      this.trim();
      this.persist();
    }
  }

  now() {
    return new Date(this.clock()).toISOString();
  }

  getStorage() {
    if (this.storage) {
      return this.storage;
    }

    if (typeof localStorage !== "undefined") {
      return localStorage;
    }

    return null;
  }

  load() {
    try {
      const storage = this.getStorage();
      const raw = storage?.getItem?.(this.storageKey);

      if (!raw) {
        return false;
      }

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const alerts = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.alerts)
          ? parsed.alerts
          : [];

      this.records.clear();

      for (const item of alerts) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const alert = normalizeAlert(item, this.clock);
        this.records.set(alert.id, alert);
      }

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
          alerts: Array.from(this.records.values()),
          statistics: this.statistics,
        }),
      );

      return true;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  add(input = {}) {
    if (this.destroyed) {
      return null;
    }

    const incoming = normalizeAlert(input, this.clock);
    const existing = this.records.get(incoming.id);

    if (existing) {
      const updated = {
        ...existing,
        ...incoming,
        id: existing.id,
        alertId: existing.id,
        createdAt: existing.createdAt,
        updatedAt: this.now(),
        occurrenceCount:
          existing.occurrenceCount + Math.max(1, incoming.occurrenceCount),
      };

      this.records.set(updated.id, updated);
      this.statistics.updated += 1;
      this.commit("updated", updated);

      return clone(updated);
    }

    incoming.updatedAt = this.now();
    this.records.set(incoming.id, incoming);
    this.statistics.created += 1;

    this.trim();
    this.commit("created", incoming);

    return clone(incoming);
  }

  create(input = {}) {
    return this.add(input);
  }

  push(input = {}) {
    return this.add(input);
  }

  enqueue(input = {}) {
    return this.add(input);
  }

  update(id, changes = {}) {
    if (this.destroyed) {
      return null;
    }

    const key = String(id);
    const existing = this.records.get(key);

    if (!existing) {
      return null;
    }

    const patch =
      changes && typeof changes === "object" ? clone(changes) : {};

    delete patch.id;
    delete patch.alertId;
    delete patch.createdAt;

    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      alertId: existing.id,
      severity: normalizeSeverity(patch.severity ?? existing.severity),
      status: normalizeStatus(patch.status ?? existing.status),
      updatedAt: this.now(),
    };

    this.records.set(key, updated);
    this.statistics.updated += 1;
    this.commit("updated", updated);

    return clone(updated);
  }

  get(id) {
    const alert = this.records.get(String(id));
    return alert ? clone(alert) : null;
  }

  getAlert(id) {
    return this.get(id);
  }

  has(id) {
    return this.records.has(String(id));
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
    let results = Array.from(this.records.values());

    if (status) {
      const statuses = new Set(
        (Array.isArray(status) ? status : [status]).map(normalizeStatus),
      );

      results = results.filter((alert) => statuses.has(alert.status));
    }

    if (severity) {
      const severities = new Set(
        (Array.isArray(severity) ? severity : [severity]).map(
          normalizeSeverity,
        ),
      );

      results = results.filter((alert) => severities.has(alert.severity));
    }

    if (source) {
      results = results.filter((alert) => alert.source === source);
    }

    if (ruleId !== null && ruleId !== undefined) {
      results = results.filter(
        (alert) => String(alert.ruleId) === String(ruleId),
      );
    }

    if (activeOnly) {
      results = results.filter(
        (alert) =>
          alert.status === "active" || alert.status === "acknowledged",
      );
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
          .filter((value) => value !== null && value !== undefined)
          .some((value) => String(value).toLowerCase().includes(query)),
      );
    }

    results.sort((a, b) => {
      if (sort === "oldest") {
        return a.createdAt.localeCompare(b.createdAt);
      }

      if (sort === "severity") {
        const order = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
          info: 4,
        };

        return (
          order[a.severity] - order[b.severity] ||
          b.createdAt.localeCompare(a.createdAt)
        );
      }

      return b.createdAt.localeCompare(a.createdAt);
    });

    const start = Math.max(0, Number(offset) || 0);
    const end = Number(limit) > 0 ? start + Number(limit) : undefined;

    return clone(results.slice(start, end));
  }

  list(options = {}) {
    return this.getAll(options);
  }

  getAlerts(options = {}) {
    return this.getAll(options);
  }

  getActive(options = {}) {
    return this.getAll({ ...options, activeOnly: true });
  }

  getHistory(options = {}) {
    return this.getAll(options);
  }

  acknowledge(id, metadata = {}) {
    const result = this.update(id, {
      ...metadata,
      status: "acknowledged",
      acknowledgedAt: this.now(),
    });

    if (result) {
      this.statistics.acknowledged += 1;
      this.persist();
    }

    return result;
  }

  resolve(id, metadata = {}) {
    const result = this.update(id, {
      ...metadata,
      status: "resolved",
      resolvedAt: this.now(),
    });

    if (result) {
      this.statistics.resolved += 1;
      this.persist();
    }

    return result;
  }

  dismiss(id, metadata = {}) {
    const result = this.update(id, {
      ...metadata,
      status: "dismissed",
      dismissedAt: this.now(),
    });

    if (result) {
      this.statistics.dismissed += 1;
      this.persist();
    }

    return result;
  }

  reopen(id, metadata = {}) {
    return this.update(id, {
      ...metadata,
      status: "active",
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
    });
  }

  acknowledgeAll({ activeOnly = true, severity = null } = {}) {
    return this.bulkUpdate("acknowledge", { activeOnly, severity });
  }

  resolveAll({ activeOnly = true, severity = null } = {}) {
    return this.bulkUpdate("resolve", { activeOnly, severity });
  }

  dismissAll({ activeOnly = true, severity = null } = {}) {
    return this.bulkUpdate("dismiss", { activeOnly, severity });
  }

  bulkUpdate(action, options = {}) {
    const method = this[action];

    if (typeof method !== "function") {
      return [];
    }

    const candidates = this.getAll(options);
    const updated = [];

    for (const alert of candidates) {
      const result = method.call(this, alert.id);

      if (result) {
        updated.push(result);
      }
    }

    return updated;
  }

  remove(id) {
    if (this.destroyed) {
      return false;
    }

    const key = String(id);
    const existing = this.records.get(key);

    if (!existing) {
      return false;
    }

    this.records.delete(key);
    this.statistics.removed += 1;
    this.commit("removed", existing);

    return true;
  }

  clear({ includeActive = true } = {}) {
    if (this.destroyed) {
      return 0;
    }

    let removed = 0;

    for (const [id, alert] of this.records.entries()) {
      const isActive =
        alert.status === "active" || alert.status === "acknowledged";

      if (includeActive || !isActive) {
        this.records.delete(id);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.statistics.removed += removed;
      this.commit("cleared", { removed });
    }

    return removed;
  }

  clearResolved() {
    let removed = 0;

    for (const [id, alert] of this.records.entries()) {
      if (alert.status === "resolved" || alert.status === "dismissed") {
        this.records.delete(id);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.statistics.removed += removed;
      this.commit("cleared-resolved", { removed });
    }

    return removed;
  }

  getSummary() {
    const alerts = Array.from(this.records.values());

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const byStatus = {
      active: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
    };

    for (const alert of alerts) {
      bySeverity[alert.severity] += 1;
      byStatus[alert.status] += 1;
    }

    return {
      total: alerts.length,
      active: byStatus.active + byStatus.acknowledged,
      unacknowledged: byStatus.active,
      acknowledged: byStatus.acknowledged,
      resolved: byStatus.resolved,
      dismissed: byStatus.dismissed,
      critical: alerts.filter(
        (alert) =>
          alert.severity === "critical" &&
          (alert.status === "active" ||
            alert.status === "acknowledged"),
      ).length,
      bySeverity,
      byStatus,
      statistics: this.getStatistics(),
    };
  }

  getStatistics() {
    return { ...this.statistics };
  }

  getSize() {
    return this.records.size;
  }

  trim() {
    if (this.records.size <= this.maxHistory) {
      return;
    }

    const newest = Array.from(this.records.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, this.maxHistory);

    this.records = new Map(newest.map((alert) => [alert.id, alert]));
  }

  exportJSON({ pretty = true } = {}) {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: this.now(),
        summary: this.getSummary(),
        statistics: this.getStatistics(),
        alerts: this.getAll({ sort: "newest" }),
      },
      null,
      pretty ? 2 : 0,
    );
  }

  importJSON(input, { replace = false } = {}) {
    if (this.destroyed) {
      return {
        imported: 0,
        skipped: 0,
        error: "Store has been destroyed.",
      };
    }

    let parsed;

    try {
      parsed = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      this.reportError(error, "import");
      return { imported: 0, skipped: 0, error: "Invalid JSON." };
    }

    const alerts = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.alerts)
        ? parsed.alerts
        : null;

    if (!alerts) {
      return {
        imported: 0,
        skipped: 0,
        error: "Expected an array of alerts.",
      };
    }

    if (replace) {
      this.records.clear();
    }

    let imported = 0;
    let skipped = 0;

    for (const item of alerts) {
      if (!item || typeof item !== "object") {
        skipped += 1;
        continue;
      }

      const alert = normalizeAlert(item, this.clock);
      this.records.set(alert.id, alert);
      imported += 1;
    }

    this.trim();
    this.commit("imported", { imported, skipped });

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
        // Prevent errors in reporting callbacks from interrupting the store.
      }
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

    this.persist();
    this.listeners.clear();
    this.onError = null;
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsStore;