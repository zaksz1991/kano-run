export class AlertQueueDashboardDiagnosticsRulesEngine {
  constructor({
    rulesStore = null,
    rules = null,
    alerts = null,
    diagnostics = null,
    analytics = null,
    clock = () => Date.now(),
    onMatch = null,
    onAlert = null,
    onError = null,
    maxEvaluations = 1000,
    cooldownMs = 0,
  } = {}) {
    this.rulesStore = rulesStore;
    this.rules = rules;
    this.alerts = alerts;
    this.diagnostics = diagnostics;
    this.analytics = analytics;
    this.clock = clock;
    this.onMatch = onMatch;
    this.onAlert = onAlert;
    this.onError = onError;
    this.maxEvaluations = Math.max(1, Number(maxEvaluations) || 1000);
    this.cooldownMs = Math.max(0, Number(cooldownMs) || 0);

    this.running = false;
    this.destroyed = false;
    this.evaluationCount = 0;
    this.matchCount = 0;
    this.errorCount = 0;
    this.lastEvaluationAt = null;
    this.lastMatchAt = null;

    this.cooldowns = new Map();
    this.history = [];
    this.listeners = new Set();
    this.unsubscribeStore = null;

    this.boundStoreChange = () => {
      this.emit("rules-changed", {
        ruleCount: this.getRules().length,
      });
    };

    if (this.rulesStore && typeof this.rulesStore.subscribe === "function") {
      try {
        const unsubscribe = this.rulesStore.subscribe(this.boundStoreChange);

        if (typeof unsubscribe === "function") {
          this.unsubscribeStore = unsubscribe;
        }
      } catch (error) {
        this.handleError(error, "subscribe");
      }
    }
  }

  evaluate(event = {}) {
    if (this.destroyed || this.running) {
      return {
        evaluated: false,
        reason: this.destroyed ? "destroyed" : "already-running",
        matches: [],
      };
    }

    this.running = true;
    this.evaluationCount += 1;
    this.lastEvaluationAt = this.now();

    const matches = [];
    const errors = [];

    try {
      const rules = this.getRules();

      for (const rule of rules) {
        if (matches.length >= this.maxEvaluations) {
          break;
        }

        try {
          if (!this.isRuleEnabled(rule)) {
            continue;
          }

          if (this.isCoolingDown(rule)) {
            continue;
          }

          const result = this.evaluateRule(rule, event);

          if (!result.matched) {
            continue;
          }

          const match = this.createMatch(rule, event, result);

          this.recordMatch(match);
          this.startCooldown(rule);
          matches.push(match);
          this.matchCount += 1;
          this.lastMatchAt = match.timestamp;

          this.dispatchMatch(match, rule, event);
        } catch (error) {
          this.errorCount += 1;
          errors.push({
            ruleId: this.getRuleId(rule),
            message: this.getErrorMessage(error),
          });

          this.handleError(error, "evaluate-rule", {
            ruleId: this.getRuleId(rule),
          });
        }
      }

      const result = {
        evaluated: true,
        timestamp: this.lastEvaluationAt,
        event,
        rulesChecked: rules.length,
        matchCount: matches.length,
        matches,
        errors,
      };

      this.emit("evaluation-complete", result);

      return result;
    } finally {
      this.running = false;
    }
  }

  evaluateRule(rule, event = {}) {
    if (!rule || typeof rule !== "object") {
      return { matched: false, reason: "invalid-rule" };
    }

    const conditions = this.getConditions(rule);

    if (conditions.length === 0) {
      return {
        matched: rule.matchAllEvents === true,
        reason: "no-conditions",
      };
    }

    const mode = String(
      rule.conditionMode || rule.matchMode || "all"
    ).toLowerCase();

    const results = conditions.map((condition) =>
      this.evaluateCondition(condition, event)
    );

    const matched =
      mode === "any" || mode === "or"
        ? results.some(Boolean)
        : results.every(Boolean);

    return {
      matched,
      conditionResults: results,
      reason: matched ? "conditions-matched" : "conditions-not-matched",
    };
  }

  evaluateCondition(condition, event) {
    if (!condition || typeof condition !== "object") {
      return false;
    }

    const field = condition.field || condition.path || condition.key;

    if (!field) {
      return false;
    }

    const actual = this.getPath(event, field);
    const expected = condition.value;
    const operator = String(
      condition.operator || condition.op || "equals"
    ).toLowerCase();

    switch (operator) {
      case "exists":
        return actual !== undefined && actual !== null;

      case "not_exists":
      case "missing":
        return actual === undefined || actual === null;

      case "equals":
      case "eq":
      case "==":
        return this.equal(actual, expected);

      case "not_equals":
      case "neq":
      case "!=":
        return !this.equal(actual, expected);

      case "strict_equals":
      case "===":
        return actual === expected;

      case "greater_than":
      case "gt":
      case ">":
        return Number(actual) > Number(expected);

      case "greater_than_or_equal":
      case "gte":
      case ">=":
        return Number(actual) >= Number(expected);

      case "less_than":
      case "lt":
      case "<":
        return Number(actual) < Number(expected);

      case "less_than_or_equal":
      case "lte":
      case "<=":
        return Number(actual) <= Number(expected);

      case "contains":
        return this.contains(actual, expected);

      case "not_contains":
        return !this.contains(actual, expected);

      case "starts_with":
        return this.toComparableString(actual)
          .startsWith(this.toComparableString(expected));

      case "ends_with":
        return this.toComparableString(actual)
          .endsWith(this.toComparableString(expected));

      case "matches":
      case "regex":
        return this.matchesPattern(actual, expected, condition.flags);

      case "in":
        return Array.isArray(expected) &&
          expected.some((item) => this.equal(actual, item));

      case "not_in":
        return Array.isArray(expected) &&
          !expected.some((item) => this.equal(actual, item));

      case "between": {
        if (!Array.isArray(expected) || expected.length < 2) {
          return false;
        }

        const value = Number(actual);
        const minimum = Number(expected[0]);
        const maximum = Number(expected[1]);

        return (
          Number.isFinite(value) &&
          Number.isFinite(minimum) &&
          Number.isFinite(maximum) &&
          value >= minimum &&
          value <= maximum
        );
      }

      case "truthy":
        return Boolean(actual);

      case "falsy":
        return !actual;

      default:
        return false;
    }
  }

  getRules() {
    try {
      if (this.rulesStore && typeof this.rulesStore.getRules === "function") {
        const storedRules = this.rulesStore.getRules();
        return Array.isArray(storedRules) ? storedRules : [];
      }

      if (Array.isArray(this.rules)) {
        return this.rules;
      }

      if (this.rules && typeof this.rules.getRules === "function") {
        const configuredRules = this.rules.getRules();
        return Array.isArray(configuredRules) ? configuredRules : [];
      }

      return [];
    } catch (error) {
      this.handleError(error, "get-rules");
      return [];
    }
  }

  getConditions(rule) {
    if (Array.isArray(rule.conditions)) {
      return rule.conditions;
    }

    if (rule.condition && typeof rule.condition === "object") {
      return [rule.condition];
    }

    if (rule.field || rule.path || rule.key) {
      return [rule];
    }

    return [];
  }

  isRuleEnabled(rule) {
    if (rule.enabled === false || rule.disabled === true) {
      return false;
    }

    if (
      rule.status &&
      ["disabled", "inactive", "archived"].includes(
        String(rule.status).toLowerCase()
      )
    ) {
      return false;
    }

    return true;
  }

  isCoolingDown(rule) {
    const id = this.getRuleId(rule);

    if (!id) {
      return false;
    }

    const lastTriggered = this.cooldowns.get(id);

    if (lastTriggered === undefined) {
      return false;
    }

    const ruleCooldown = Number(
      rule.cooldownMs ?? rule.cooldown ?? this.cooldownMs
    );

    const cooldown = Math.max(
      0,
      Number.isFinite(ruleCooldown) ? ruleCooldown : this.cooldownMs
    );

    return this.now() - lastTriggered < cooldown;
  }

  startCooldown(rule) {
    const id = this.getRuleId(rule);

    if (id) {
      this.cooldowns.set(id, this.now());
    }
  }

  createMatch(rule, event, result) {
    const timestamp = this.now();
    const ruleId = this.getRuleId(rule);

    return {
      id: this.createId(),
      ruleId,
      ruleName: rule.name || rule.title || ruleId || "Unnamed rule",
      severity: rule.severity || "info",
      message: this.buildMessage(rule, event),
      timestamp,
      event,
      conditionResults: result.conditionResults || [],
      reason: result.reason,
    };
  }

  buildMessage(rule, event) {
    const template = rule.message || rule.description;

    if (!template) {
      return `Rule matched: ${rule.name || rule.title || this.getRuleId(rule)}`;
    }

    return String(template).replace(
      /\{\{\s*([^{}]+?)\s*\}\}/g,
      (placeholder, path) => {
        const value = this.getPath(event, path.trim());

        return value === undefined || value === null
          ? ""
          : String(value);
      }
    );
  }

  recordMatch(match) {
    this.history.push(match);

    if (this.history.length > 500) {
      this.history.splice(0, this.history.length - 500);
    }

    if (this.rulesStore && typeof this.rulesStore.recordMatch === "function") {
      try {
        this.rulesStore.recordMatch(match);
      } catch (error) {
        this.handleError(error, "record-match", {
          matchId: match.id,
        });
      }
    }
  }

  dispatchMatch(match, rule, event) {
    this.invokeCallback(this.onMatch, match, rule, event, "on-match");

    if (rule.createAlert !== false) {
      this.sendAlert(match, rule, event);
    }

    this.emit("rule-matched", {
      match,
      rule,
      event,
    });
  }

  sendAlert(match, rule, event) {
    if (typeof this.onAlert === "function") {
      this.invokeCallback(
        this.onAlert,
        match,
        rule,
        event,
        "on-alert"
      );
      return;
    }

    if (!this.alerts) {
      return;
    }

    try {
      if (typeof this.alerts.create === "function") {
        this.alerts.create(match);
      } else if (typeof this.alerts.add === "function") {
        this.alerts.add(match);
      } else if (typeof this.alerts.push === "function") {
        this.alerts.push(match);
      } else if (typeof this.alerts.enqueue === "function") {
        this.alerts.enqueue(match);
      }
    } catch (error) {
      this.handleError(error, "send-alert", {
        matchId: match.id,
      });
    }
  }

  invokeCallback(callback, ...args) {
    const operation = args.pop();

    if (typeof callback !== "function") {
      return;
    }

    try {
      callback(...args);
    } catch (error) {
      this.handleError(error, operation);
    }
  }

  getHistory({ limit = 100, ruleId = null } = {}) {
    let history = this.history;

    if (ruleId !== null) {
      history = history.filter(
        (entry) => entry.ruleId === String(ruleId)
      );
    }

    const safeLimit = Math.max(0, Number(limit) || 0);

    return history.slice(-safeLimit).reverse();
  }

  getSummary() {
    const rules = this.getRules();
    const enabledRules = rules.filter((rule) =>
      this.isRuleEnabled(rule)
    );

    return {
      running: this.running,
      destroyed: this.destroyed,
      ruleCount: rules.length,
      enabledRuleCount: enabledRules.length,
      disabledRuleCount: rules.length - enabledRules.length,
      evaluationCount: this.evaluationCount,
      matchCount: this.matchCount,
      errorCount: this.errorCount,
      historyCount: this.history.length,
      lastEvaluationAt: this.lastEvaluationAt,
      lastMatchAt: this.lastMatchAt,
    };
  }

  clearHistory() {
    this.history = [];
    this.emit("history-cleared", {
      timestamp: this.now(),
    });
  }

  clearCooldowns() {
    this.cooldowns.clear();

    this.emit("cooldowns-cleared", {
      timestamp: this.now(),
    });
  }

  resetStatistics() {
    this.evaluationCount = 0;
    this.matchCount = 0;
    this.errorCount = 0;
    this.lastEvaluationAt = null;
    this.lastMatchAt = null;

    this.emit("statistics-reset", this.getSummary());
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

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: this.now(),
      detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.handleError(error, "listener", { type });
      }
    }
  }

  getPath(object, path) {
    if (object === null || object === undefined || !path) {
      return undefined;
    }

    const parts = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(\d+)\]/g, ".$1")
          .split(".")
          .filter(Boolean);

    let current = object;

    for (const part of parts) {
      if (
        current === null ||
        current === undefined ||
        !Object.prototype.hasOwnProperty.call(current, part)
      ) {
        return undefined;
      }

      current = current[part];
    }

    return current;
  }

  equal(actual, expected) {
    if (actual === expected) {
      return true;
    }

    if (actual === null || expected === null) {
      return false;
    }

    if (actual === undefined || expected === undefined) {
      return false;
    }

    if (
      typeof actual === "number" &&
      typeof expected === "number"
    ) {
      return Number.isFinite(actual) &&
        Number.isFinite(expected) &&
        actual === expected;
    }

    return String(actual).toLowerCase() ===
      String(expected).toLowerCase();
  }

  contains(actual, expected) {
    if (Array.isArray(actual)) {
      return actual.some((item) => this.equal(item, expected));
    }

    if (typeof actual === "string") {
      return actual.toLowerCase().includes(
        this.toComparableString(expected).toLowerCase()
      );
    }

    if (
      actual &&
      typeof actual === "object" &&
      typeof expected === "string"
    ) {
      return Object.prototype.hasOwnProperty.call(actual, expected);
    }

    return false;
  }

  matchesPattern(actual, pattern, flags = "") {
    if (actual === undefined || actual === null || pattern === undefined) {
      return false;
    }

    try {
      const safeFlags = String(flags)
        .split("")
        .filter((flag, index, all) =>
          "dgimsuvy".includes(flag) && all.indexOf(flag) === index
        )
        .join("")
        .replace(/[gy]/g, "");

      return new RegExp(String(pattern), safeFlags).test(String(actual));
    } catch (error) {
      this.handleError(error, "regex-condition");
      return false;
    }
  }

  toComparableString(value) {
    if (value === undefined || value === null) {
      return "";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  getRuleId(rule) {
    if (!rule || typeof rule !== "object") {
      return null;
    }

    const id = rule.id ?? rule.ruleId ?? rule.key;

    return id === undefined || id === null ? null : String(id);
  }

  createId() {
    return `rule-match-${this.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  now() {
    try {
      const value = Number(this.clock());
      return Number.isFinite(value) ? value : Date.now();
    } catch {
      return Date.now();
    }
  }

  getErrorMessage(error) {
    return error instanceof Error
      ? error.message
      : String(error ?? "Unknown error");
  }

  handleError(error, operation, context = {}) {
    const payload = {
      operation,
      message: this.getErrorMessage(error),
      context,
      timestamp: this.now(),
    };

    if (typeof this.onError === "function") {
      try {
        this.onError(payload, error);
        return;
      } catch {
        // Fall through to diagnostics.
      }
    }

    if (this.diagnostics) {
      try {
        if (typeof this.diagnostics.recordError === "function") {
          this.diagnostics.recordError(payload);
          return;
        }

        if (typeof this.diagnostics.error === "function") {
          this.diagnostics.error(payload.message, payload);
          return;
        }
      } catch {
        // Diagnostics must not interrupt rule evaluation.
      }
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.running = false;

    if (typeof this.unsubscribeStore === "function") {
      try {
        this.unsubscribeStore();
      } catch (error) {
        this.handleError(error, "unsubscribe-store");
      }
    }

    this.unsubscribeStore = null;
    this.cooldowns.clear();
    this.listeners.clear();
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngine;