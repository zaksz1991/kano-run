export class AlertQueueDashboardDiagnosticsRulesStore {
  constructor({
    storage = globalThis.localStorage ?? null,
    storageKey = "kano-run-diagnostics-rules-store",
    maxRules = 1000,
    maxHistory = 2000,
    version = 1,
    clock = () => Date.now(),
    onError = null,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxRules = Math.max(1, Number(maxRules) || 1000);
    this.maxHistory = Math.max(1, Number(maxHistory) || 2000);
    this.version = Math.max(1, Number(version) || 1);
    this.clock = clock;
    this.onError = onError;

    this.rules = new Map();
    this.history = [];
    this.listeners = new Set();
    this.destroyed = false;

    this.load();
  }

  now() {
    const value = Number(this.clock());
    return Number.isFinite(value) ? value : Date.now();
  }

  createId(prefix = "rule") {
    const random =
      globalThis.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2, 14);

    return `${prefix}-${this.now()}-${random}`;
  }

  reportError(error, operation) {
    try {
      this.onError?.({ error, operation, timestamp: this.now() });
    } catch {
      // Storage errors must not interrupt application execution.
    }
  }

  clone(value) {
    if (value === undefined) return undefined;

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  normalizeRule(input = {}) {
    const source = input && typeof input === "object" ? input : {};

    return {
      id: String(source.id ?? this.createId()),
      name: String(source.name ?? "Untitled rule").slice(0, 160),
      description: String(source.description ?? "").slice(0, 1000),
      enabled: source.enabled !== false,
      severity: this.normalizeSeverity(source.severity),
      action: ["alert", "log", "callback"].includes(source.action)
        ? source.action
        : "alert",
      eventTypes: Array.isArray(source.eventTypes)
        ? [...new Set(source.eventTypes.map(String))]
        : ["*"],
      conditions: Array.isArray(source.conditions)
        ? source.conditions.map((condition) => ({
            field: String(condition?.field ?? ""),
            operator: String(condition?.operator ?? "equals"),
            value: this.clone(condition?.value) ?? null,
            caseSensitive: condition?.caseSensitive === true,
          }))
        : [],
      conditionMode: source.conditionMode === "any" ? "any" : "all",
      message: String(
        source.message ?? source.description ?? source.name ?? ""
      ).slice(0, 2000),
      cooldownMs: Math.max(0, Number(source.cooldownMs) || 0),
      stopProcessing: source.stopProcessing === true,
      metadata:
        source.metadata && typeof source.metadata === "object"
          ? this.clone(source.metadata) ?? {}
          : {},
      createdAt: Number(source.createdAt) || this.now(),
      updatedAt: Number(source.updatedAt) || this.now(),
    };
  }

  normalizeSeverity(value) {
    const severity = String(value ?? "warning").toLowerCase();

    if (["critical", "fatal"].includes(severity)) return "critical";
    if (severity === "error") return "error";
    if (["info", "notice"].includes(severity)) return "info";

    return "warning";
  }

  normalizeHistoryRecord(input = {}) {
    const source = input && typeof input === "object" ? input : {};

    return {
      id: String(source.id ?? this.createId("match")),
      ruleId: String(source.ruleId ?? ""),
      ruleName: String(source.ruleName ?? "Unknown rule").slice(0, 160),
      action: String(source.action ?? "log"),
      severity: this.normalizeSeverity(source.severity),
      message: String(source.message ?? "").slice(0, 2000),
      eventType: String(source.eventType ?? "unknown").slice(0, 200),
      timestamp: Number(source.timestamp) || this.now(),
      context: this.clone(source.context) ?? null,
    };
  }

  load() {
    if (!this.storage?.getItem) {
      return { rules: 0, history: 0 };
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return { rules: 0, history: 0 };
      }

      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        throw new TypeError("Invalid diagnostic rules store format.");
      }

      const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
      const history = Array.isArray(parsed.history) ? parsed.history : [];

      this.rules.clear();

      for (const item of rules.slice(-this.maxRules)) {
        if (!item || typeof item !== "object" || !item.id) continue;

        const rule = this.normalizeRule(item);
        this.rules.set(rule.id, rule);
      }

      this.history = history
        .filter((item) => item && typeof item === "object")
        .slice(-this.maxHistory)
        .map((item) => this.normalizeHistoryRecord(item));

      return {
        rules: this.rules.size,
        history: this.history.length,
      };
    } catch (error) {
      this.reportError(error, "load");
      return { rules: 0, history: 0 };
    }
  }

  persist() {
    if (!this.storage?.setItem || this.destroyed) {
      return false;
    }

    try {
      const payload = {
        version: this.version,
        savedAt: this.now(),
        rules: this.getRules(),
        history: this.getHistory(),
      };

      this.storage.setItem(this.storageKey, JSON.stringify(payload));
      this.emit("persisted", {
        ruleCount: payload.rules.length,
        historyCount: payload.history.length,
      });

      return true;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  emit(type, details = {}) {
    if (this.destroyed) return;

    const event = {
      type,
      details: this.clone(details) ?? {},
      timestamp: this.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.reportError(error, "listener");
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function" || this.destroyed) {
      return () => {};
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRule(input) {
    if (this.destroyed) {
      throw new Error("Diagnostic rules store has been destroyed.");
    }

    const rule = this.normalizeRule(input);

    if (!rule.name.trim()) {
      throw new TypeError("Rule name is required.");
    }

    if (this.rules.has(rule.id)) {
      throw new Error(`Rule already exists: ${rule.id}`);
    }

    this.rules.set(rule.id, rule);
    this.trimRules();
    this.persist();
    this.emit("rule-added", { rule });

    return this.clone(rule);
  }

  updateRule(id, changes = {}) {
    const key = String(id);
    const current = this.rules.get(key);

    if (!current) return null;

    const updated = this.normalizeRule({
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now(),
    });

    if (!updated.name.trim()) {
      throw new TypeError("Rule name is required.");
    }

    this.rules.set(key, updated);
    this.persist();
    this.emit("rule-updated", { rule: updated });

    return this.clone(updated);
  }

  getRule(id) {
    const rule = this.rules.get(String(id));
    return rule ? this.clone(rule) : null;
  }

  hasRule(id) {
    return this.rules.has(String(id));
  }

  removeRule(id) {
    const key = String(id);
    const rule = this.rules.get(key);

    if (!rule) return false;

    this.rules.delete(key);
    this.persist();
    this.emit("rule-removed", { rule });

    return true;
  }

  setRuleEnabled(id, enabled) {
    return this.updateRule(id, { enabled: enabled === true });
  }

  getRules({
    enabled = null,
    search = null,
    severity = null,
    eventType = null,
    limit = null,
  } = {}) {
    let rules = [...this.rules.values()];

    if (enabled !== null) {
      rules = rules.filter((rule) => rule.enabled === (enabled === true));
    }

    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      const normalized = severities.map((value) =>
        this.normalizeSeverity(value)
      );

      rules = rules.filter((rule) => normalized.includes(rule.severity));
    }

    if (eventType) {
      rules = rules.filter(
        (rule) =>
          rule.eventTypes.includes("*") ||
          rule.eventTypes.includes(String(eventType))
      );
    }

    if (search) {
      const query = String(search).toLowerCase();

      rules = rules.filter((rule) =>
        [
          rule.id,
          rule.name,
          rule.description,
          rule.message,
          ...rule.eventTypes,
        ].some((value) => String(value).toLowerCase().includes(query))
      );
    }

    rules.sort(
      (a, b) =>
        Number(b.enabled) - Number(a.enabled) ||
        b.updatedAt - a.updatedAt
    );

    if (limit !== null) {
      rules = rules.slice(0, Math.max(0, Number(limit) || 0));
    }

    return rules.map((rule) => this.clone(rule));
  }

  trimRules() {
    if (this.rules.size <= this.maxRules) return 0;

    const sorted = [...this.rules.values()].sort(
      (a, b) => a.updatedAt - b.updatedAt
    );

    const removeCount = this.rules.size - this.maxRules;

    for (const rule of sorted.slice(0, removeCount)) {
      this.rules.delete(rule.id);
    }

    return removeCount;
  }

  recordMatch(input) {
    if (this.destroyed) return null;

    const record = this.normalizeHistoryRecord(input);

    this.history.push(record);

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    this.persist();
    this.emit("match-recorded", { record });

    return this.clone(record);
  }

  recordMatches(records = []) {
    if (!Array.isArray(records)) return [];

    const added = [];

    for (const record of records) {
      const normalized = this.normalizeHistoryRecord(record);
      this.history.push(normalized);
      added.push(normalized);
    }

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    if (added.length) {
      this.persist();
      this.emit("matches-recorded", {
        count: added.length,
        records: added,
      });
    }

    return added.map((record) => this.clone(record));
  }

  getHistory({
    ruleId = null,
    eventType = null,
    severity = null,
    since = null,
    until = null,
    search = null,
    limit = null,
    sort = "newest",
  } = {}) {
    let records = this.history.slice();

    if (ruleId) {
      records = records.filter(
        (record) => record.ruleId === String(ruleId)
      );
    }

    if (eventType) {
      records = records.filter(
        (record) => record.eventType === String(eventType)
      );
    }

    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      const normalized = severities.map((value) =>
        this.normalizeSeverity(value)
      );

      records = records.filter((record) =>
        normalized.includes(record.severity)
      );
    }

    if (since !== null) {
      records = records.filter(
        (record) => record.timestamp >= Number(since)
      );
    }

    if (until !== null) {
      records = records.filter(
        (record) => record.timestamp <= Number(until)
      );
    }

    if (search) {
      const query = String(search).toLowerCase();

      records = records.filter((record) =>
        [
          record.ruleName,
          record.ruleId,
          record.message,
          record.eventType,
          record.action,
        ].some((value) => String(value).toLowerCase().includes(query))
      );
    }

    records.sort((a, b) =>
      sort === "oldest"
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    if (limit !== null) {
      records = records.slice(0, Math.max(0, Number(limit) || 0));
    }

    return records.map((record) => this.clone(record));
  }

  getMatchSummary() {
    const summary = {
      total: this.history.length,
      bySeverity: {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0,
      },
      byAction: {},
      byRule: {},
      latestAt: null,
    };

    for (const record of this.history) {
      summary.bySeverity[record.severity] += 1;

      summary.byAction[record.action] =
        (summary.byAction[record.action] ?? 0) + 1;

      summary.byRule[record.ruleId] =
        (summary.byRule[record.ruleId] ?? 0) + 1;

      summary.latestAt = Math.max(
        summary.latestAt ?? 0,
        record.timestamp
      );
    }

    return summary;
  }

  clearHistory({ ruleId = null, before = null } = {}) {
    const initialCount = this.history.length;

    this.history = this.history.filter((record) => {
      if (ruleId && record.ruleId !== String(ruleId)) return true;
      if (before !== null && record.timestamp >= Number(before)) return true;

      return false;
    });

    const removed = initialCount - this.history.length;

    if (removed > 0) {
      this.persist();
      this.emit("history-cleared", { removed, ruleId, before });
    }

    return removed;
  }

  clearRules() {
    const removed = this.rules.size;

    if (removed === 0) return 0;

    this.rules.clear();
    this.persist();
    this.emit("rules-cleared", { removed });

    return removed;
  }

  clearAll() {
    const rulesRemoved = this.rules.size;
    const historyRemoved = this.history.length;

    this.rules.clear();
    this.history = [];

    this.persist();
    this.emit("store-cleared", { rulesRemoved, historyRemoved });

    return { rulesRemoved, historyRemoved };
  }

  exportJSON() {
    return JSON.stringify(
      {
        version: this.version,
        exportedAt: this.now(),
        rules: this.getRules(),
        history: this.getHistory(),
        summary: {
          ruleCount: this.rules.size,
          historyCount: this.history.length,
          matches: this.getMatchSummary(),
        },
      },
      null,
      2
    );
  }

  importJSON(input, { replace = false, importHistory = true } = {}) {
    let parsed = input;

    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        this.reportError(error, "import");
        return {
          importedRules: 0,
          importedHistory: 0,
          errors: ["Invalid JSON input."],
        };
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        importedRules: 0,
        importedHistory: 0,
        errors: ["Import data must be an object."],
      };
    }

    const incomingRules = Array.isArray(parsed.rules) ? parsed.rules : null;
    const incomingHistory = Array.isArray(parsed.history)
      ? parsed.history
      : [];

    if (!incomingRules) {
      return {
        importedRules: 0,
        importedHistory: 0,
        errors: ["Import data must include a rules array."],
      };
    }

    const errors = [];
    let importedRules = 0;
    let importedHistory = 0;

    if (replace) {
      this.rules.clear();

      if (importHistory) {
        this.history = [];
      }
    }

    for (const source of incomingRules) {
      try {
        const rule = this.normalizeRule(source);

        if (this.rules.has(rule.id)) {
          errors.push(`Duplicate rule ID: ${rule.id}`);
          continue;
        }

        this.rules.set(rule.id, rule);
        importedRules += 1;
      } catch (error) {
        errors.push(String(error?.message ?? error));
      }
    }

    if (importHistory) {
      for (const source of incomingHistory) {
        try {
          this.history.push(this.normalizeHistoryRecord(source));
          importedHistory += 1;
        } catch (error) {
          errors.push(String(error?.message ?? error));
        }
      }
    }

    this.trimRules();

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    this.persist();

    this.emit("import-completed", {
      importedRules,
      importedHistory,
      errors,
    });

    return { importedRules, importedHistory, errors };
  }

  getMetadata() {
    return {
      version: this.version,
      storageKey: this.storageKey,
      ruleCount: this.rules.size,
      historyCount: this.history.length,
      maxRules: this.maxRules,
      maxHistory: this.maxHistory,
      lastMatchAt: this.getMatchSummary().latestAt,
    };
  }

  refresh() {
    if (this.destroyed) {
      return this.getMetadata();
    }

    const result = this.load();

    this.emit("refreshed", result);

    return this.getMetadata();
  }

  destroy() {
    if (this.destroyed) return;

    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesStore;