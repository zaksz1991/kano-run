const DEFAULT_CONFIG = Object.freeze({
  storageKey: "kanoRun.alertDashboard.alertRulesStore",
  maxRules: 500,
  maxHistory: 1000,
  maxNameLength: 120,
  maxDescriptionLength: 1000,
});

const VALID_SEVERITIES = new Set([
  "debug",
  "info",
  "success",
  "warning",
  "error",
  "critical",
]);

const VALID_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "matches",
  "exists",
  "notExists",
  "in",
  "notIn",
  "between",
  "truthy",
  "falsy",
]);

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const clone = (value) => {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON serialization.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const makeId = () => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const getTimestamp = (clock) => {
  try {
    const value = typeof clock === "function" ? clock() : Date.now();
    const timestamp = value instanceof Date ? value.getTime() : Number(value);

    return Number.isFinite(timestamp) ? timestamp : Date.now();
  } catch {
    return Date.now();
  }
};

const normalizeText = (value, maxLength, fallback = "") =>
  String(value ?? fallback).trim().slice(0, maxLength);

const normalizeSeverity = (value) => {
  const severity = String(value ?? "warning").toLowerCase();

  return VALID_SEVERITIES.has(severity) ? severity : "warning";
};

const normalizeCondition = (condition) => {
  if (!isObject(condition)) {
    throw new TypeError("Each condition must be an object.");
  }

  const field = normalizeText(condition.field, 240);
  const operator = normalizeText(condition.operator, 40, "eq");

  if (!field) {
    throw new TypeError("Condition field is required.");
  }

  if (!VALID_OPERATORS.has(operator)) {
    throw new TypeError(`Unsupported condition operator: ${operator}`);
  }

  return {
    field,
    operator,
    value: clone(condition.value),
    secondValue: clone(condition.secondValue),
    caseSensitive: condition.caseSensitive === true,
  };
};

const normalizeRule = (input, existing = {}, clock) => {
  if (!isObject(input)) {
    throw new TypeError("A rule must be an object.");
  }

  const source = { ...existing, ...input };
  const name = normalizeText(
    source.name ?? source.title,
    DEFAULT_CONFIG.maxNameLength,
  );

  if (!name) {
    throw new TypeError("Rule name is required.");
  }

  const rawConditions = source.conditions ?? (
    source.condition ? [source.condition] : []
  );

  if (!Array.isArray(rawConditions)) {
    throw new TypeError("Rule conditions must be an array.");
  }

  const now = getTimestamp(clock);

  return {
    id: normalizeText(source.id, 180) || makeId(),
    name,
    description: normalizeText(
      source.description,
      DEFAULT_CONFIG.maxDescriptionLength,
    ),
    enabled: source.enabled !== false,
    severity: normalizeSeverity(source.severity),
    eventType: normalizeText(source.eventType, 180, "*") || "*",
    matchMode: source.matchMode === "any" ? "any" : "all",
    conditions: rawConditions.map(normalizeCondition),
    cooldownMs: Math.max(
      0,
      Number.isFinite(Number(source.cooldownMs))
        ? Number(source.cooldownMs)
        : 0,
    ),
    threshold: Math.max(
      1,
      Math.floor(Number(source.threshold) || 1),
    ),
    tags: Array.isArray(source.tags)
      ? [...new Set(
          source.tags
            .map((tag) => normalizeText(tag, 60))
            .filter(Boolean),
        )].slice(0, 50)
      : [],
    alertTitle: normalizeText(source.alertTitle, 120),
    alertMessage: normalizeText(source.alertMessage, 1000),
    metadata: isObject(source.metadata) ? clone(source.metadata) : {},
    createdAt: Number.isFinite(Number(source.createdAt))
      ? Number(source.createdAt)
      : now,
    updatedAt: now,
    lastEvaluatedAt: Number.isFinite(Number(source.lastEvaluatedAt))
      ? Number(source.lastEvaluatedAt)
      : null,
    lastMatchedAt: Number.isFinite(Number(source.lastMatchedAt))
      ? Number(source.lastMatchedAt)
      : null,
    evaluationCount: Math.max(
      0,
      Math.floor(Number(source.evaluationCount) || 0),
    ),
    matchCount: Math.max(
      0,
      Math.floor(Number(source.matchCount) || 0),
    ),
  };
};

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesStore {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(isObject(options.config) ? options.config : {}),
    };

    this.clock = options.clock;
    this.storage = options.storage ?? this.getDefaultStorage();

    this.storageKey = normalizeText(
      options.storageKey,
      240,
      this.config.storageKey,
    ) || this.config.storageKey;

    this.onError = typeof options.onError === "function"
      ? options.onError
      : null;

    this.rules = new Map();
    this.history = [];
    this.listeners = new Set();
    this.destroyed = false;
    this.revision = 0;
    this.batchDepth = 0;
    this.pendingEvents = [];

    this.statistics = {
      created: 0,
      updated: 0,
      removed: 0,
      enabled: 0,
      disabled: 0,
      evaluations: 0,
      matches: 0,
      errors: 0,
      imports: 0,
    };

    this.load();

    if (Array.isArray(options.rules)) {
      for (const rule of options.rules) {
        try {
          this.addRule(rule, { persist: false });
        } catch (error) {
          this.reportError(error, "initialize");
        }
      }
    }
  }

  getDefaultStorage() {
    try {
      return typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage
        : null;
    } catch {
      return null;
    }
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Rules store has been destroyed.");
    }
  }

  reportError(error, operation = "unknown") {
    this.statistics.errors += 1;

    if (this.onError) {
      try {
        this.onError(error, {
          operation,
          timestamp: getTimestamp(this.clock),
        });
      } catch {
        // Error handlers must not interrupt store operations.
      }
    }
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("subscribe requires a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event) {
    if (this.destroyed) return;

    const payload = {
      ...clone(event),
      revision: this.revision,
      timestamp: Number.isFinite(Number(event?.timestamp))
        ? Number(event.timestamp)
        : getTimestamp(this.clock),
    };

    if (this.batchDepth > 0) {
      this.pendingEvents.push(payload);
      return;
    }

    for (const listener of this.listeners) {
      try {
        listener(clone(payload));
      } catch (error) {
        this.reportError(error, "subscriber");
      }
    }
  }

  beginBatch() {
    this.assertActive();
    this.batchDepth += 1;

    return this.batchDepth;
  }

  endBatch(options = {}) {
    this.assertActive();

    if (this.batchDepth === 0) return false;

    this.batchDepth -= 1;

    if (this.batchDepth > 0) return true;

    const events = this.pendingEvents.splice(0);

    for (const event of events) {
      for (const listener of this.listeners) {
        try {
          listener(clone(event));
        } catch (error) {
          this.reportError(error, "batch-subscriber");
        }
      }
    }

    if (options.persist !== false) {
      this.persist();
    }

    return true;
  }

  transaction(callback, options = {}) {
    this.assertActive();

    if (typeof callback !== "function") {
      throw new TypeError("transaction requires a callback.");
    }

    const rulesSnapshot = new Map(
      [...this.rules.entries()].map(([id, rule]) => [id, clone(rule)]),
    );

    const historySnapshot = clone(this.history);
    const statisticsSnapshot = clone(this.statistics);
    const revisionSnapshot = this.revision;
    const pendingSnapshot = clone(this.pendingEvents);

    this.beginBatch();

    try {
      const result = callback(this);

      if (result && typeof result.then === "function") {
        throw new TypeError(
          "Asynchronous callbacks are not supported by transaction().",
        );
      }

      this.endBatch({ persist: options.persist !== false });

      return result;
    } catch (error) {
      this.rules = rulesSnapshot;
      this.history = historySnapshot;
      this.statistics = statisticsSnapshot;
      this.revision = revisionSnapshot;
      this.pendingEvents = pendingSnapshot;
      this.batchDepth = 0;

      throw error;
    }
  }

  recordHistory(type, rule, details = {}) {
    this.history.push({
      id: makeId(),
      type,
      ruleId: rule?.id ?? details.ruleId ?? null,
      ruleName: rule?.name ?? details.ruleName ?? null,
      details: clone(details),
      timestamp: getTimestamp(this.clock),
    });

    if (this.history.length > this.config.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.config.maxHistory,
      );
    }
  }

  load() {
    if (!this.storage || typeof this.storage.getItem !== "function") {
      return false;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) return false;

      const data = JSON.parse(raw);

      if (!isObject(data)) return false;

      const incomingRules = Array.isArray(data.rules) ? data.rules : [];

      this.rules.clear();

      for (const input of incomingRules.slice(0, this.config.maxRules)) {
        try {
          const rule = normalizeRule(input, {}, this.clock);

          if (!this.rules.has(rule.id)) {
            this.rules.set(rule.id, rule);
          }
        } catch (error) {
          this.reportError(error, "load-rule");
        }
      }

      this.history = Array.isArray(data.history)
        ? data.history.slice(-this.config.maxHistory)
        : [];

      if (isObject(data.statistics)) {
        for (const key of Object.keys(this.statistics)) {
          const value = Number(data.statistics[key]);

          if (Number.isFinite(value) && value >= 0) {
            this.statistics[key] = Math.floor(value);
          }
        }
      }

      this.revision = Math.max(
        0,
        Math.floor(Number(data.revision) || 0),
      );

      return true;
    } catch (error) {
      this.reportError(error, "load");
      return false;
    }
  }

  persist() {
    if (!this.storage || typeof this.storage.setItem !== "function") {
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          revision: this.revision,
          savedAt: getTimestamp(this.clock),
          rules: this.getRules(),
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

  commit(type, rule, details = {}, options = {}) {
    this.revision += 1;

    this.recordHistory(type, rule, details);

    this.emit({
      type: `rule:${type}`,
      action: type,
      id: rule?.id ?? details.ruleId ?? null,
      rule: rule ? clone(rule) : null,
      details: clone(details),
    });

    if (options.persist !== false && this.batchDepth === 0) {
      this.persist();
    }
  }

  addRule(input, options = {}) {
    this.assertActive();

    if (this.rules.size >= this.config.maxRules) {
      throw new RangeError("Maximum number of rules reached.");
    }

    const rule = normalizeRule(input, {}, this.clock);

    if (this.rules.has(rule.id)) {
      throw new Error(`Rule already exists: ${rule.id}`);
    }

    this.rules.set(rule.id, rule);
    this.statistics.created += 1;

    this.commit("created", rule, {}, options);

    return clone(rule);
  }

  updateRule(id, changes, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const existing = this.rules.get(key);

    if (!existing) {
      throw new Error(`Rule not found: ${key}`);
    }

    if (!isObject(changes)) {
      throw new TypeError("Rule changes must be an object.");
    }

    if (changes.id && String(changes.id) !== key) {
      throw new Error("Rule ID cannot be changed.");
    }

    const updated = normalizeRule(
      { ...changes, id: key },
      existing,
      this.clock,
    );

    updated.id = key;
    updated.createdAt = existing.createdAt;
    updated.updatedAt = getTimestamp(this.clock);

    this.rules.set(key, updated);
    this.statistics.updated += 1;

    this.commit("updated", updated, {
      previous: clone(existing),
    }, options);

    return clone(updated);
  }

  removeRule(id, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const existing = this.rules.get(key);

    if (!existing) return false;

    this.rules.delete(key);
    this.statistics.removed += 1;

    this.commit("removed", existing, {}, options);

    return true;
  }

  getRule(id) {
    const rule = this.rules.get(String(id ?? ""));

    return rule ? clone(rule) : null;
  }

  getRules(options = {}) {
    let rules = [...this.rules.values()];

    if (options.enabled === true) {
      rules = rules.filter((rule) => rule.enabled);
    } else if (options.enabled === false) {
      rules = rules.filter((rule) => !rule.enabled);
    }

    if (options.severity) {
      const severity = normalizeSeverity(options.severity);

      rules = rules.filter((rule) => rule.severity === severity);
    }

    if (options.eventType) {
      const eventType = String(options.eventType);

      rules = rules.filter(
        (rule) => rule.eventType === "*" || rule.eventType === eventType,
      );
    }

    if (options.tag) {
      rules = rules.filter(
        (rule) => rule.tags.includes(String(options.tag)),
      );
    }

    if (options.search) {
      const query = String(options.search).trim().toLowerCase();

      rules = rules.filter((rule) =>
        `${rule.name} ${rule.description} ${rule.tags.join(" ")}`
          .toLowerCase()
          .includes(query),
      );
    }

    if (options.sortBy === "name") {
      rules.sort((a, b) => a.name.localeCompare(b.name));
    } else if (options.sortBy === "matches") {
      rules.sort((a, b) => b.matchCount - a.matchCount);
    } else if (options.sortBy === "evaluations") {
      rules.sort((a, b) => b.evaluationCount - a.evaluationCount);
    } else {
      rules.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return rules.map(clone);
  }

  setRuleEnabled(id, enabled, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const rule = this.rules.get(key);

    if (!rule) return null;

    const nextEnabled = Boolean(enabled);

    if (rule.enabled === nextEnabled) {
      return clone(rule);
    }

    const updated = {
      ...rule,
      enabled: nextEnabled,
      updatedAt: getTimestamp(this.clock),
    };

    this.rules.set(key, updated);
    this.statistics[nextEnabled ? "enabled" : "disabled"] += 1;

    this.commit(
      nextEnabled ? "enabled" : "disabled",
      updated,
      {},
      options,
    );

    return clone(updated);
  }

  enableRule(id, options = {}) {
    return this.setRuleEnabled(id, true, options);
  }

  disableRule(id, options = {}) {
    return this.setRuleEnabled(id, false, options);
  }

  toggleRule(id, options = {}) {
    const rule = this.rules.get(String(id ?? ""));

    if (!rule) return null;

    return this.setRuleEnabled(id, !rule.enabled, options);
  }

  recordEvaluation(id, result = {}, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const rule = this.rules.get(key);

    if (!rule) return null;

    const now = getTimestamp(this.clock);
    const matched = Boolean(result.matched);

    const updated = {
      ...rule,
      evaluationCount: rule.evaluationCount + 1,
      matchCount: rule.matchCount + (matched ? 1 : 0),
      lastEvaluatedAt: now,
      lastMatchedAt: matched ? now : rule.lastMatchedAt,
      updatedAt: now,
    };

    this.rules.set(key, updated);

    this.statistics.evaluations += 1;

    if (matched) {
      this.statistics.matches += 1;
    }

    this.commit("evaluated", updated, {
      matched,
      reason: result.reason ?? null,
    }, options);

    return clone(updated);
  }

  recordMatch(id, details = {}, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const rule = this.rules.get(key);

    if (!rule) return null;

    const now = getTimestamp(this.clock);

    const updated = {
      ...rule,
      matchCount: rule.matchCount + 1,
      lastMatchedAt: now,
      updatedAt: now,
    };

    this.rules.set(key, updated);
    this.statistics.matches += 1;

    this.commit("matched", updated, details, options);

    return clone(updated);
  }

  getHistory(options = {}) {
    let history = [...this.history];

    if (options.type) {
      history = history.filter((entry) =>
        entry.type === options.type ||
        entry.type === `rule:${options.type}`,
      );
    }

    if (options.ruleId) {
      history = history.filter(
        (entry) => entry.ruleId === String(options.ruleId),
      );
    }

    if (Number.isFinite(Number(options.since))) {
      history = history.filter(
        (entry) => entry.timestamp >= Number(options.since),
      );
    }

    if (Number.isFinite(Number(options.until))) {
      history = history.filter(
        (entry) => entry.timestamp <= Number(options.until),
      );
    }

    if (options.order === "asc") {
      history.reverse();
    }

    const limit = Math.max(
      0,
      Math.floor(Number(options.limit) || history.length),
    );

    return history.slice(0, limit).map(clone);
  }

  clearHistory(options = {}) {
    this.assertActive();

    this.history = [];
    this.revision += 1;

    this.emit({
      type: "history:cleared",
      action: "clear-history",
    });

    if (options.persist !== false) this.persist();

    return true;
  }

  clearStatistics(options = {}) {
    this.assertActive();

    for (const [id, rule] of this.rules) {
      this.rules.set(id, {
        ...rule,
        evaluationCount: 0,
        matchCount: 0,
        lastEvaluatedAt: null,
        lastMatchedAt: null,
        updatedAt: getTimestamp(this.clock),
      });
    }

    for (const key of Object.keys(this.statistics)) {
      this.statistics[key] = 0;
    }

    this.revision += 1;

    this.emit({
      type: "statistics:cleared",
      action: "clear-statistics",
    });

    if (options.persist !== false) this.persist();

    return true;
  }

  clear(options = {}) {
    this.assertActive();

    this.rules.clear();
    this.history = [];

    for (const key of Object.keys(this.statistics)) {
      this.statistics[key] = 0;
    }

    this.revision += 1;

    this.emit({
      type: "cleared",
      action: "clear",
    });

    if (options.persist !== false) this.persist();

    return true;
  }

  getStatistics() {
    const rules = [...this.rules.values()];

    return {
      ...this.statistics,
      totalRules: rules.length,
      enabledRules: rules.filter((rule) => rule.enabled).length,
      disabledRules: rules.filter((rule) => !rule.enabled).length,
      totalEvaluations: rules.reduce(
        (sum, rule) => sum + rule.evaluationCount,
        0,
      ),
      totalMatches: rules.reduce(
        (sum, rule) => sum + rule.matchCount,
        0,
      ),
      historyEntries: this.history.length,
      revision: this.revision,
    };
  }

  getSummary() {
    return {
      statistics: this.getStatistics(),
      rules: this.getRules(),
      recentHistory: this.getHistory({ limit: 10 }),
    };
  }

  exportJSON() {
    return JSON.stringify({
      version: 1,
      exportedAt: getTimestamp(this.clock),
      revision: this.revision,
      rules: this.getRules(),
      history: this.history,
      statistics: this.statistics,
    }, null, 2);
  }

  importJSON(input, options = {}) {
    this.assertActive();

    let parsed;

    try {
      parsed = typeof input === "string" ? JSON.parse(input) : input;
    } catch {
      throw new TypeError("Import data is not valid JSON.");
    }

    const incoming = Array.isArray(parsed)
      ? parsed
      : parsed?.rules;

    if (!Array.isArray(incoming)) {
      throw new TypeError("Import data must contain a rules array.");
    }

    if (incoming.length > this.config.maxRules) {
      throw new RangeError("Import exceeds the maximum rule count.");
    }

    const normalized = incoming.map((item) =>
      normalizeRule(item, {}, this.clock),
    );

    const replace = options.replace === true;
    const overwrite = options.overwrite === true;
    const before = this.rules;

    const nextRules = replace ? new Map() : new Map(before);

    for (const rule of normalized) {
      if (nextRules.has(rule.id) && !overwrite) {
        if (replace) {
          throw new Error(`Duplicate rule ID in import: ${rule.id}`);
        }

        rule.id = makeId();
      }

      nextRules.set(rule.id, rule);
    }

    if (nextRules.size > this.config.maxRules) {
      throw new RangeError("Import exceeds the maximum rule count.");
    }

    this.rules = nextRules;
    this.statistics.imports += normalized.length;
    this.revision += 1;

    this.recordHistory("imported", null, {
      count: normalized.length,
      replace,
      overwrite,
    });

    this.emit({
      type: "rules:imported",
      action: "import",
      count: normalized.length,
      replace,
      overwrite,
    });

    if (options.persist !== false) this.persist();

    return {
      imported: normalized.length,
      totalRules: this.rules.size,
      revision: this.revision,
    };
  }

  refresh() {
    this.assertActive();

    const loaded = this.load();

    this.emit({
      type: "refreshed",
      action: "refresh",
      loaded,
    });

    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) return;

    this.listeners.clear();
    this.pendingEvents = [];
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesStore;