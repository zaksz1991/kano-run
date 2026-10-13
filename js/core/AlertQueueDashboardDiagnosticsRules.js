export class AlertQueueDashboardDiagnosticsRules {
  constructor({
    alerts = null,
    diagnostics = null,
    analytics = null,
    rules = [],
    storage = globalThis.localStorage ?? null,
    storageKey = "kano-run-diagnostics-rules",
    maxHistory = 500,
    clock = () => Date.now(),
    onMatch = null,
    onError = null,
  } = {}) {
    this.alerts = alerts;
    this.diagnostics = diagnostics;
    this.analytics = analytics;
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || 500);
    this.clock = clock;
    this.onMatch = onMatch;
    this.onError = onError;

    this.rules = new Map();
    this.history = [];
    this.listeners = new Set();
    this.cooldowns = new Map();
    this.unsubscribeAlerts = null;
    this.unsubscribeDiagnostics = null;
    this.unsubscribeAnalytics = null;
    this.destroyed = false;

    this.load();

    for (const rule of rules) {
      this.addRule(rule);
    }

    if (this.alerts?.subscribe) {
      this.unsubscribeAlerts = this.alerts.subscribe((event) => {
        this.handleAlertEvent(event);
      });
    }

    if (this.diagnostics?.subscribe) {
      this.unsubscribeDiagnostics = this.diagnostics.subscribe((event) => {
        this.handleDiagnosticEvent(event);
      });
    }

    if (this.analytics?.subscribe) {
      this.unsubscribeAnalytics = this.analytics.subscribe((event) => {
        this.handleAnalyticsEvent(event);
      });
    }
  }

  now() {
    const value = Number(this.clock());
    return Number.isFinite(value) ? value : Date.now();
  }

  createId() {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `rule-${this.now()}-${Math.random().toString(36).slice(2, 11)}`
    );
  }

  reportError(error, operation) {
    try {
      this.onError?.({
        error,
        operation,
        timestamp: this.now(),
      });
    } catch {
      // Keep rule processing isolated from error-handler failures.
    }
  }

  normalizeSeverity(value) {
    const severity = String(value ?? "warning").toLowerCase();

    if (["critical", "fatal"].includes(severity)) return "critical";
    if (severity === "error") return "error";
    if (["info", "notice"].includes(severity)) return "info";

    return "warning";
  }

  normalizeRule(input = {}) {
    const rule = input && typeof input === "object" ? input : {};

    const conditions = Array.isArray(rule.conditions)
      ? rule.conditions
      : [];

    return {
      id: String(rule.id ?? this.createId()),
      name: String(rule.name ?? "Untitled rule").slice(0, 160),
      description: String(rule.description ?? "").slice(0, 1000),
      enabled: rule.enabled !== false,
      eventTypes: Array.isArray(rule.eventTypes)
        ? rule.eventTypes.map(String)
        : ["*"],
      conditions: conditions.map((condition) => ({
        field: String(condition?.field ?? ""),
        operator: String(condition?.operator ?? "equals"),
        value: condition?.value ?? null,
        caseSensitive: condition?.caseSensitive === true,
      })),
      conditionMode: rule.conditionMode === "any" ? "any" : "all",
      action: ["alert", "log", "callback"].includes(rule.action)
        ? rule.action
        : "alert",
      severity: this.normalizeSeverity(rule.severity),
      message: String(
        rule.message ?? rule.description ?? rule.name ?? "Diagnostic rule matched."
      ).slice(0, 2000),
      cooldownMs: Math.max(0, Number(rule.cooldownMs) || 0),
      stopProcessing: rule.stopProcessing === true,
      metadata:
        rule.metadata && typeof rule.metadata === "object"
          ? { ...rule.metadata }
          : {},
      createdAt: Number(rule.createdAt) || this.now(),
      updatedAt: Number(rule.updatedAt) || this.now(),
    };
  }

  load() {
    if (!this.storage?.getItem) {
      return 0;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return 0;

      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.rules)
          ? parsed.rules
          : [];

      let loaded = 0;

      for (const item of records) {
        if (!item || typeof item !== "object" || !item.id) continue;

        const rule = this.normalizeRule(item);
        this.rules.set(rule.id, rule);
        loaded += 1;
      }

      return loaded;
    } catch (error) {
      this.reportError(error, "load");
      return 0;
    }
  }

  persist() {
    if (!this.storage?.setItem) return false;

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          savedAt: this.now(),
          rules: this.getRules(),
        })
      );

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
      details,
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
    if (this.destroyed) return null;

    const rule = this.normalizeRule(input);

    if (!rule.name.trim()) {
      throw new TypeError("A diagnostic rule must have a name.");
    }

    if (this.rules.has(rule.id)) {
      throw new Error(`Diagnostic rule already exists: ${rule.id}`);
    }

    this.rules.set(rule.id, rule);
    this.persist();
    this.emit("rule-added", { rule: { ...rule } });

    return { ...rule };
  }

  updateRule(id, changes = {}) {
    const current = this.rules.get(String(id));
    if (!current) return null;

    const updated = this.normalizeRule({
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now(),
    });

    this.rules.set(updated.id, updated);
    this.persist();
    this.emit("rule-updated", { rule: { ...updated } });

    return { ...updated };
  }

  removeRule(id) {
    const key = String(id);
    const rule = this.rules.get(key);

    if (!rule) return false;

    this.rules.delete(key);
    this.cooldowns.delete(key);
    this.persist();
    this.emit("rule-removed", { rule: { ...rule } });

    return true;
  }

  enableRule(id, enabled = true) {
    return this.updateRule(id, { enabled: enabled === true });
  }

  getRule(id) {
    const rule = this.rules.get(String(id));
    return rule ? { ...rule, conditions: rule.conditions.map((item) => ({ ...item })) } : null;
  }

  getRules({ enabled = null, search = null } = {}) {
    let rules = [...this.rules.values()];

    if (enabled !== null) {
      rules = rules.filter((rule) => rule.enabled === (enabled === true));
    }

    if (search) {
      const query = String(search).toLowerCase();

      rules = rules.filter((rule) =>
        [rule.name, rule.description, rule.message].some((value) =>
          value.toLowerCase().includes(query)
        )
      );
    }

    return rules.map((rule) => ({
      ...rule,
      eventTypes: [...rule.eventTypes],
      conditions: rule.conditions.map((condition) => ({ ...condition })),
      metadata: { ...rule.metadata },
    }));
  }

  getPath(object, path) {
    if (!path) return undefined;

    return String(path)
      .split(".")
      .reduce((value, key) => {
        if (value === null || value === undefined) return undefined;
        return value[key];
      }, object);
  }

  compare(actual, expected, operator, caseSensitive = false) {
    const op = String(operator ?? "equals").toLowerCase();

    const normalize = (value) => {
      if (typeof value !== "string" || caseSensitive) return value;
      return value.toLowerCase();
    };

    const left = normalize(actual);
    const right = normalize(expected);

    switch (op) {
      case "equals":
      case "eq":
        return left === right;

      case "not_equals":
      case "neq":
        return left !== right;

      case "contains":
        if (typeof left === "string") {
          return left.includes(String(right ?? ""));
        }
        if (Array.isArray(left)) {
          return left.includes(right);
        }
        return false;

      case "not_contains":
        if (typeof left === "string") {
          return !left.includes(String(right ?? ""));
        }
        if (Array.isArray(left)) {
          return !left.includes(right);
        }
        return true;

      case "starts_with":
        return (
          typeof left === "string" &&
          left.startsWith(String(right ?? ""))
        );

      case "ends_with":
        return (
          typeof left === "string" &&
          left.endsWith(String(right ?? ""))
        );

      case "gt":
      case "greater_than":
        return Number(left) > Number(right);

      case "gte":
      case "greater_than_or_equal":
        return Number(left) >= Number(right);

      case "lt":
      case "less_than":
        return Number(left) < Number(right);

      case "lte":
      case "less_than_or_equal":
        return Number(left) <= Number(right);

      case "in":
        return Array.isArray(right) && right.includes(left);

      case "not_in":
        return Array.isArray(right) && !right.includes(left);

      case "exists":
        return actual !== undefined && actual !== null;

      case "not_exists":
        return actual === undefined || actual === null;

      case "is_true":
        return actual === true;

      case "is_false":
        return actual === false;

      case "matches": {
        if (typeof actual !== "string") return false;

        try {
          const flags = caseSensitive ? "" : "i";
          return new RegExp(String(expected), flags).test(actual);
        } catch {
          return false;
        }
      }

      default:
        return false;
    }
  }

  matchesCondition(condition, context) {
    const actual = this.getPath(context, condition.field);

    return this.compare(
      actual,
      condition.value,
      condition.operator,
      condition.caseSensitive
    );
  }

  matchesRule(rule, event) {
    if (!rule.enabled) return false;

    const eventType = String(event?.type ?? "unknown");

    if (
      !rule.eventTypes.includes("*") &&
      !rule.eventTypes.includes(eventType)
    ) {
      return false;
    }

    if (rule.conditions.length === 0) {
      return true;
    }

    const results = rule.conditions.map((condition) =>
      this.matchesCondition(condition, event)
    );

    return rule.conditionMode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  }

  isCoolingDown(rule) {
    const lastTriggered = this.cooldowns.get(rule.id);

    if (lastTriggered === undefined) return false;

    return this.now() - lastTriggered < rule.cooldownMs;
  }

  recordMatch(rule, event) {
    const record = {
      id: this.createId(),
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      severity: rule.severity,
      message: rule.message,
      eventType: String(event?.type ?? "unknown"),
      timestamp: this.now(),
      context: this.safeClone(event),
    };

    this.history.push(record);

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    this.emit("rule-matched", {
      rule: { ...rule },
      match: record,
    });

    return record;
  }

  safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return {
        type: typeof value,
        unavailable: true,
      };
    }
  }

  executeAction(rule, event, match) {
    switch (rule.action) {
      case "alert":
        if (this.alerts?.raise) {
          return this.alerts.raise({
            component: "diagnostics-rules",
            code: `RULE_${rule.id}`,
            severity: rule.severity,
            message: rule.message,
            metadata: {
              ruleId: rule.id,
              ruleName: rule.name,
              matchedEvent: event?.type ?? "unknown",
              matchId: match.id,
              ...rule.metadata,
            },
          });
        }

        return match;

      case "callback":
        try {
          this.onMatch?.({
            rule: { ...rule },
            event,
            match,
          });
        } catch (error) {
          this.reportError(error, "onMatch");
        }

        return match;

      case "log":
      default:
        return match;
    }
  }

  evaluate(event) {
    if (this.destroyed || !event || typeof event !== "object") {
      return [];
    }

    const matches = [];

    for (const rule of this.rules.values()) {
      try {
        if (!this.matchesRule(rule, event)) continue;
        if (this.isCoolingDown(rule)) continue;

        this.cooldowns.set(rule.id, this.now());

        const match = this.recordMatch(rule, event);
        const actionResult = this.executeAction(rule, event, match);

        matches.push({
          rule: { ...rule },
          match,
          actionResult,
        });

        if (rule.stopProcessing) break;
      } catch (error) {
        this.reportError(error, `evaluate:${rule.id}`);
      }
    }

    return matches;
  }

  handleAlertEvent(event) {
    if (!event || typeof event !== "object") return;

    this.evaluate({
      type: `alert.${event.type ?? "unknown"}`,
      alert: event.alert ?? null,
      details: event.details ?? {},
      timestamp: event.timestamp ?? this.now(),
    });
  }

  handleDiagnosticEvent(event) {
    if (!event || typeof event !== "object") return;

    this.evaluate({
      type: `diagnostic.${event.type ?? "unknown"}`,
      report: event.report ?? event.result ?? event.diagnostic ?? null,
      details: event.details ?? {},
      issues: event.issues ?? [],
      timestamp: event.timestamp ?? this.now(),
    });
  }

  handleAnalyticsEvent(event) {
    if (!event || typeof event !== "object") return;

    this.evaluate({
      type: `analytics.${event.type ?? "unknown"}`,
      score: event.score ?? event.healthScore ?? null,
      metrics: event.metrics ?? event.details ?? {},
      timestamp: event.timestamp ?? this.now(),
    });
  }

  getHistory({ ruleId = null, eventType = null, limit = null } = {}) {
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

    records.reverse();

    if (limit !== null) {
      records = records.slice(0, Math.max(0, Number(limit) || 0));
    }

    return records.map((record) => this.safeClone(record));
  }

  clearHistory() {
    const removed = this.history.length;
    this.history = [];

    this.emit("history-cleared", { removed });

    return removed;
  }

  importRules(input, { replace = false } = {}) {
    let parsed = input;

    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        this.reportError(error, "import");
        return { imported: 0, errors: ["Invalid JSON input."] };
      }
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rules)
        ? parsed.rules
        : null;

    if (!records) {
      return {
        imported: 0,
        errors: ["Input must contain a rules array."],
      };
    }

    const errors = [];
    let imported = 0;

    if (replace) {
      this.rules.clear();
      this.cooldowns.clear();
    }

    for (const record of records) {
      try {
        const rule = this.normalizeRule(record);

        if (this.rules.has(rule.id)) {
          errors.push(`Duplicate rule ID: ${rule.id}`);
          continue;
        }

        this.rules.set(rule.id, rule);
        imported += 1;
      } catch (error) {
        errors.push(String(error?.message ?? error));
      }
    }

    this.persist();
    this.emit("rules-imported", { imported, errors });

    return { imported, errors };
  }

  exportRules() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: this.now(),
        rules: this.getRules(),
      },
      null,
      2
    );
  }

  getSummary() {
    const rules = [...this.rules.values()];

    return {
      totalRules: rules.length,
      enabledRules: rules.filter((rule) => rule.enabled).length,
      disabledRules: rules.filter((rule) => !rule.enabled).length,
      totalMatches: this.history.length,
      matchesByRule: this.history.reduce((summary, record) => {
        summary[record.ruleId] = (summary[record.ruleId] ?? 0) + 1;
        return summary;
      }, {}),
      lastMatchAt: this.history.reduce(
        (latest, record) => Math.max(latest, record.timestamp),
        0
      ) || null,
    };
  }

  destroy() {
    if (this.destroyed) return;

    this.unsubscribeAlerts?.();
    this.unsubscribeDiagnostics?.();
    this.unsubscribeAnalytics?.();

    this.unsubscribeAlerts = null;
    this.unsubscribeDiagnostics = null;
    this.unsubscribeAnalytics = null;

    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRules;