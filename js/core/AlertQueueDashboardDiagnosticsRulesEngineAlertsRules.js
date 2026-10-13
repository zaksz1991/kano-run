const DEFAULT_CONFIG = Object.freeze({
  storageKey: "kanoRun.alertDashboard.alertRules",
  maxRules: 500,
  maxHistory: 1000,
  maxRuleNameLength: 120,
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
  value !== null && typeof value === "object" && !Array.isArray(value);

const clone = (value) => {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON cloning for serializable values.
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

const safeTime = (clock) => {
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

const getPath = (source, path) => {
  if (!path) return source;

  return String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (current == null || !Object.prototype.hasOwnProperty.call(
        Object(current),
        key,
      )) {
        return undefined;
      }

      return current[key];
    }, source);
};

const normalizeCondition = (condition) => {
  if (!isObject(condition)) {
    throw new TypeError("Each rule condition must be an object.");
  }

  const field = normalizeText(condition.field, 240);

  if (!field) {
    throw new TypeError("Rule conditions require a field.");
  }

  const operator = normalizeText(condition.operator, 40, "eq");

  if (!VALID_OPERATORS.has(operator)) {
    throw new TypeError(`Unsupported rule operator: ${operator}`);
  }

  return {
    field,
    operator,
    value: clone(condition.value),
    secondValue: clone(condition.secondValue),
    caseSensitive: condition.caseSensitive === true,
  };
};

const normalizeRule = (input, existing = {}) => {
  if (!isObject(input)) {
    throw new TypeError("A rule must be an object.");
  }

  const combined = { ...existing, ...input };
  const name = normalizeText(
    combined.name ?? combined.title,
    DEFAULT_CONFIG.maxRuleNameLength,
  );

  if (!name) {
    throw new TypeError("Rules require a non-empty name.");
  }

  const rawConditions = combined.conditions ?? (
    combined.condition ? [combined.condition] : []
  );

  if (!Array.isArray(rawConditions)) {
    throw new TypeError("Rule conditions must be an array.");
  }

  const conditions = rawConditions.map(normalizeCondition);
  const matchMode = combined.matchMode === "any" ? "any" : "all";

  const severity = normalizeSeverity(combined.severity);

  const cooldownMs = Math.max(
    0,
    Number.isFinite(Number(combined.cooldownMs))
      ? Number(combined.cooldownMs)
      : 0,
  );

  const threshold = Number.isFinite(Number(combined.threshold))
    ? Math.max(1, Math.floor(Number(combined.threshold)))
    : 1;

  return {
    id: normalizeText(combined.id, 180) || makeId(),
    name,
    description: normalizeText(
      combined.description,
      DEFAULT_CONFIG.maxDescriptionLength,
    ),
    enabled: combined.enabled !== false,
    severity,
    eventType: normalizeText(combined.eventType, 180, "*") || "*",
    matchMode,
    conditions,
    cooldownMs,
    threshold,
    tags: Array.isArray(combined.tags)
      ? [...new Set(
          combined.tags
            .map((tag) => normalizeText(tag, 60))
            .filter(Boolean),
        )].slice(0, 50)
      : [],
    alertTitle: normalizeText(
      combined.alertTitle,
      DEFAULT_CONFIG.maxRuleNameLength,
    ),
    alertMessage: normalizeText(
      combined.alertMessage,
      DEFAULT_CONFIG.maxDescriptionLength,
    ),
    metadata: isObject(combined.metadata) ? clone(combined.metadata) : {},
    createdAt: Number.isFinite(Number(combined.createdAt))
      ? Number(combined.createdAt)
      : Date.now(),
    updatedAt: Date.now(),
    lastEvaluatedAt: Number.isFinite(Number(combined.lastEvaluatedAt))
      ? Number(combined.lastEvaluatedAt)
      : null,
    lastMatchedAt: Number.isFinite(Number(combined.lastMatchedAt))
      ? Number(combined.lastMatchedAt)
      : null,
    evaluationCount: Math.max(
      0,
      Math.floor(Number(combined.evaluationCount) || 0),
    ),
    matchCount: Math.max(
      0,
      Math.floor(Number(combined.matchCount) || 0),
    ),
  };
};

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsRules {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(isObject(options.config) ? options.config : {}),
    };

    this.clock = options.clock;
    this.onError = typeof options.onError === "function"
      ? options.onError
      : null;

    this.rulesStore = options.rulesStore ?? options.store ?? null;
    this.storage = options.storage ?? this.getDefaultStorage();
    this.storageKey = normalizeText(
      options.storageKey,
      240,
      this.config.storageKey,
    ) || this.config.storageKey;

    this.rules = new Map();
    this.history = [];
    this.listeners = new Set();
    this.destroyed = false;

    this.statistics = {
      created: 0,
      updated: 0,
      removed: 0,
      enabled: 0,
      disabled: 0,
      imported: 0,
      errors: 0,
    };

    this.unsubscribeStore = null;

    this.load();

    if (Array.isArray(options.rules)) {
      for (const rule of options.rules) {
        try {
          this.addRule(rule, { persist: false });
        } catch (error) {
          this.reportError(error, "initialize-rule");
        }
      }
    }

    if (options.autoSubscribe !== false) {
      this.connectStore();
    }
  }

  getDefaultStorage() {
    try {
      if (typeof globalThis.localStorage !== "undefined") {
        return globalThis.localStorage;
      }
    } catch {
      // Storage may be blocked by browser privacy settings.
    }

    return null;
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Rules manager has been destroyed.");
    }
  }

  reportError(error, operation = "unknown") {
    this.statistics.errors += 1;

    const payload = {
      type: "error",
      operation,
      message: error instanceof Error ? error.message : String(error),
      timestamp: safeTime(this.clock),
    };

    if (this.onError) {
      try {
        this.onError(error, payload);
      } catch {
        // Error callbacks must not break rule management.
      }
    }

    this.emit(payload);
  }

  emit(event) {
    if (this.destroyed) return;

    const payload = {
      ...clone(event),
      timestamp: Number.isFinite(Number(event?.timestamp))
        ? Number(event.timestamp)
        : safeTime(this.clock),
    };

    for (const listener of this.listeners) {
      try {
        listener(clone(payload));
      } catch (error) {
        if (this.onError) {
          try {
            this.onError(error, {
              operation: "listener",
              event: payload,
            });
          } catch {
            // Ignore listener error-handler failures.
          }
        }
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

  connectStore() {
    if (!this.rulesStore || typeof this.rulesStore.subscribe !== "function") {
      return false;
    }

    try {
      this.unsubscribeStore = this.rulesStore.subscribe((event) => {
        if (!event || this.destroyed) return;

        const type = String(event.type ?? event.action ?? "").toLowerCase();

        if (type.includes("removed") || type.includes("deleted")) {
          const id = event.id ?? event.rule?.id;

          if (id && this.rules.has(String(id))) {
            this.removeRule(String(id), { persist: false });
          }

          return;
        }

        const candidate = event.rule ?? event.data;

        if (isObject(candidate) && candidate.id) {
          try {
            if (this.rules.has(String(candidate.id))) {
              this.updateRule(String(candidate.id), candidate, {
                persist: false,
              });
            } else {
              this.addRule(candidate, { persist: false });
            }
          } catch (error) {
            this.reportError(error, "store-sync");
          }
        }
      });

      return true;
    } catch (error) {
      this.reportError(error, "connect-store");
      return false;
    }
  }

  recordHistory(type, rule, details = {}) {
    this.history.push({
      id: makeId(),
      type,
      ruleId: rule?.id ?? null,
      ruleName: rule?.name ?? null,
      details: clone(details),
      timestamp: safeTime(this.clock),
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

      const parsed = JSON.parse(raw);

      if (!isObject(parsed)) return false;

      const records = Array.isArray(parsed.rules) ? parsed.rules : [];

      this.rules.clear();

      for (const item of records.slice(0, this.config.maxRules)) {
        try {
          const rule = normalizeRule(item);

          if (!this.rules.has(rule.id)) {
            this.rules.set(rule.id, rule);
          }
        } catch (error) {
          this.reportError(error, "load-rule");
        }
      }

      this.history = Array.isArray(parsed.history)
        ? parsed.history.slice(-this.config.maxHistory)
        : [];

      if (isObject(parsed.statistics)) {
        for (const key of Object.keys(this.statistics)) {
          const value = Number(parsed.statistics[key]);

          if (Number.isFinite(value) && value >= 0) {
            this.statistics[key] = Math.floor(value);
          }
        }
      }

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
          savedAt: safeTime(this.clock),
          rules: this.getRules(),
          history: this.history.slice(-this.config.maxHistory),
          statistics: this.statistics,
        }),
      );

      return true;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  addRule(input, options = {}) {
    this.assertActive();

    if (this.rules.size >= this.config.maxRules) {
      throw new RangeError("Maximum number of rules reached.");
    }

    const rule = normalizeRule(input);

    if (this.rules.has(rule.id)) {
      throw new Error(`Rule already exists: ${rule.id}`);
    }

    this.rules.set(rule.id, rule);
    this.statistics.created += 1;
    this.recordHistory("created", rule);

    if (options.persist !== false) this.persist();

    this.emit({
      type: "rule:created",
      rule: clone(rule),
    });

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
      throw new TypeError("Rule updates must be an object.");
    }

    if (changes.id && String(changes.id) !== key) {
      throw new Error("A rule ID cannot be changed.");
    }

    const updated = normalizeRule(
      { ...changes, id: key },
      existing,
    );

    updated.createdAt = existing.createdAt;
    updated.updatedAt = safeTime(this.clock);

    this.rules.set(key, updated);
    this.statistics.updated += 1;
    this.recordHistory("updated", updated);

    if (options.persist !== false) this.persist();

    this.emit({
      type: "rule:updated",
      rule: clone(updated),
      previous: clone(existing),
    });

    return clone(updated);
  }

  removeRule(id, options = {}) {
    this.assertActive();

    const key = String(id ?? "");
    const existing = this.rules.get(key);

    if (!existing) return false;

    this.rules.delete(key);
    this.statistics.removed += 1;
    this.recordHistory("removed", existing);

    if (options.persist !== false) this.persist();

    this.emit({
      type: "rule:removed",
      id: key,
      rule: clone(existing),
    });

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
      rules = rules.filter((rule) => rule.tags.includes(String(options.tag)));
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
    } else {
      rules.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return rules.map(clone);
  }

  setRuleEnabled(id, enabled) {
    const rule = this.getRule(id);

    if (!rule) return null;

    const nextEnabled = Boolean(enabled);

    if (rule.enabled === nextEnabled) return rule;

    const updated = this.updateRule(id, {
      enabled: nextEnabled,
    });

    this.statistics[nextEnabled ? "enabled" : "disabled"] += 1;
    this.recordHistory(nextEnabled ? "enabled" : "disabled", updated);
    this.persist();

    this.emit({
      type: nextEnabled ? "rule:enabled" : "rule:disabled",
      rule: updated,
    });

    return updated;
  }

  enableRule(id) {
    return this.setRuleEnabled(id, true);
  }

  disableRule(id) {
    return this.setRuleEnabled(id, false);
  }

  toggleRule(id) {
    const rule = this.getRule(id);

    return rule ? this.setRuleEnabled(id, !rule.enabled) : null;
  }

  evaluateCondition(condition, event) {
    const actual = getPath(event, condition.field);
    const expected = condition.value;

    const normalizeComparable = (value) => {
      if (condition.caseSensitive || typeof value !== "string") {
        return value;
      }

      return value.toLowerCase();
    };

    const left = normalizeComparable(actual);
    const right = normalizeComparable(expected);

    switch (condition.operator) {
      case "eq":
        return Object.is(left, right) || left === right;

      case "neq":
        return !(Object.is(left, right) || left === right);

      case "gt":
        return Number(actual) > Number(expected);

      case "gte":
        return Number(actual) >= Number(expected);

      case "lt":
        return Number(actual) < Number(expected);

      case "lte":
        return Number(actual) <= Number(expected);

      case "contains":
        if (Array.isArray(actual)) {
          return actual.some((item) => Object.is(
            normalizeComparable(item),
            right,
          ));
        }

        return typeof left === "string" &&
          typeof right === "string" &&
          left.includes(right);

      case "notContains":
        if (Array.isArray(actual)) {
          return !actual.some((item) => Object.is(
            normalizeComparable(item),
            right,
          ));
        }

        return typeof left === "string" &&
          typeof right === "string" &&
          !left.includes(right);

      case "startsWith":
        return typeof left === "string" &&
          typeof right === "string" &&
          left.startsWith(right);

      case "endsWith":
        return typeof left === "string" &&
          typeof right === "string" &&
          left.endsWith(right);

      case "matches":
        if (typeof actual !== "string" || typeof expected !== "string") {
          return false;
        }

        try {
          return new RegExp(expected, condition.caseSensitive ? "" : "i")
            .test(actual);
        } catch {
          return false;
        }

      case "exists":
        return actual !== undefined && actual !== null;

      case "notExists":
        return actual === undefined || actual === null;

      case "in":
        return Array.isArray(expected) && expected.some(
          (item) => Object.is(normalizeComparable(item), left),
        );

      case "notIn":
        return Array.isArray(expected) && !expected.some(
          (item) => Object.is(normalizeComparable(item), left),
        );

      case "between": {
        const min = Number(expected);
        const max = Number(condition.secondValue);
        const value = Number(actual);

        return Number.isFinite(value) &&
          Number.isFinite(min) &&
          Number.isFinite(max) &&
          value >= Math.min(min, max) &&
          value <= Math.max(min, max);
      }

      case "truthy":
        return Boolean(actual);

      case "falsy":
        return !actual;

      default:
        return false;
    }
  }

  evaluateRule(ruleOrId, event = {}) {
    this.assertActive();

    const rule = typeof ruleOrId === "string"
      ? this.rules.get(ruleOrId)
      : ruleOrId;

    if (!rule) {
      return {
        matched: false,
        reason: "rule-not-found",
        ruleId: typeof ruleOrId === "string" ? ruleOrId : null,
      };
    }

    if (!rule.enabled) {
      return {
        matched: false,
        reason: "rule-disabled",
        ruleId: rule.id,
      };
    }

    const eventType = String(event?.type ?? event?.eventType ?? "*");

    if (rule.eventType !== "*" && rule.eventType !== eventType) {
      return {
        matched: false,
        reason: "event-type-mismatch",
        ruleId: rule.id,
      };
    }

    if (rule.conditions.length === 0) {
      return {
        matched: true,
        reason: "no-conditions",
        ruleId: rule.id,
        conditionsMatched: 0,
      };
    }

    const results = rule.conditions.map((condition) => {
      try {
        return this.evaluateCondition(condition, event);
      } catch (error) {
        this.reportError(error, "evaluate-condition");
        return false;
      }
    });

    const matched = rule.matchMode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);

    return {
      matched,
      reason: matched ? "matched" : "conditions-not-matched",
      ruleId: rule.id,
      conditionsMatched: results.filter(Boolean).length,
      conditionCount: results.length,
    };
  }

  recordEvaluation(id, result) {
    const rule = this.rules.get(String(id));

    if (!rule) return;

    rule.evaluationCount += 1;
    rule.lastEvaluatedAt = safeTime(this.clock);
    rule.updatedAt = safeTime(this.clock);

    if (result?.matched) {
      rule.matchCount += 1;
      rule.lastMatchedAt = rule.lastEvaluatedAt;
    }

    this.recordHistory("evaluated", rule, {
      matched: Boolean(result?.matched),
      reason: result?.reason ?? null,
    });
  }

  evaluate(event = {}) {
    this.assertActive();

    const results = [];
    const timestamp = safeTime(this.clock);

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const result = this.evaluateRule(rule, event);

        this.recordEvaluation(rule.id, result);

        results.push({
          ...result,
          rule: clone(rule),
          timestamp,
        });

        this.emit({
          type: "rule:evaluated",
          ruleId: rule.id,
          matched: result.matched,
          result: clone(result),
          event: clone(event),
          timestamp,
        });

        if (result.matched) {
          this.emit({
            type: "rule:matched",
            rule: clone(rule),
            result: clone(result),
            event: clone(event),
            timestamp,
          });
        }
      } catch (error) {
        this.reportError(error, "evaluate-rule");
      }
    }

    this.persist();

    return results;
  }

  getHistory(options = {}) {
    let history = [...this.history];

    if (options.type) {
      history = history.filter((entry) => entry.type === options.type);
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

    const limit = Math.max(
      0,
      Math.floor(Number(options.limit) || history.length),
    );

    return history.slice(-limit).reverse().map(clone);
  }

  clearHistory() {
    this.assertActive();

    this.history = [];
    this.persist();

    this.emit({ type: "history:cleared" });

    return true;
  }

  clearStatistics() {
    this.assertActive();

    for (const rule of this.rules.values()) {
      rule.evaluationCount = 0;
      rule.matchCount = 0;
      rule.lastEvaluatedAt = null;
      rule.lastMatchedAt = null;
    }

    this.statistics = {
      created: 0,
      updated: 0,
      removed: 0,
      enabled: 0,
      disabled: 0,
      imported: 0,
      errors: 0,
    };

    this.persist();

    this.emit({ type: "statistics:cleared" });

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
    };
  }

  getSummary() {
    const statistics = this.getStatistics();

    return {
      ...statistics,
      rules: this.getRules(),
      recentHistory: this.getHistory({ limit: 10 }),
    };
  }

  exportJSON() {
    return JSON.stringify({
      version: 1,
      exportedAt: safeTime(this.clock),
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

    const normalized = incoming.map((item) => normalizeRule(item));
    const replace = options.replace === true;

    if (replace) {
      this.rules.clear();
    }

    let imported = 0;

    for (const rule of normalized) {
      if (this.rules.has(rule.id) && options.overwrite !== true) {
        if (replace) {
          throw new Error(`Duplicate rule ID in import: ${rule.id}`);
        }

        rule.id = makeId();
      }

      this.rules.set(rule.id, rule);
      imported += 1;
    }

    if (this.rules.size > this.config.maxRules) {
      throw new RangeError("Import would exceed the maximum rule count.");
    }

    this.statistics.imported += imported;
    this.recordHistory("imported", null, {
      count: imported,
      replace,
    });

    this.persist();

    this.emit({
      type: "rules:imported",
      count: imported,
      replace,
    });

    return {
      imported: imported,
      totalRules: this.rules.size,
    };
  }

  refresh() {
    this.assertActive();

    const loaded = this.load();

    this.emit({
      type: "refreshed",
      loaded,
      totalRules: this.rules.size,
    });

    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) return;

    if (typeof this.unsubscribeStore === "function") {
      try {
        this.unsubscribeStore();
      } catch {
        // Cleanup continues even if the store unsubscribe fails.
      }
    }

    this.unsubscribeStore = null;
    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsRules;