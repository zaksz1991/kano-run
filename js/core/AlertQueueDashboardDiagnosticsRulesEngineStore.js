export class AlertQueueDashboardDiagnosticsRulesEngineStore {
  constructor({
    storage = globalThis.localStorage,
    storageKey = "aqd-diagnostics-rules-engine",
    maxHistory = 1000,
    version = 1,
    clock = () => Date.now(),
    onError = null,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || 1000);
    this.version = Math.max(1, Number(version) || 1);
    this.clock = clock;
    this.onError = onError;

    this.rules = [];
    this.history = [];
    this.statistics = {
      evaluations: 0,
      matches: 0,
      errors: 0,
    };

    this.revision = 0;
    this.listeners = new Set();
    this.destroyed = false;
    this.lastUpdatedAt = null;

    this.load();
  }

  load() {
    if (this.destroyed || !this.storage) {
      return false;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        return false;
      }

      this.rules = Array.isArray(parsed.rules)
        ? parsed.rules.filter(this.isValidRule)
        : [];

      this.history = Array.isArray(parsed.history)
        ? parsed.history
            .filter((item) => item && typeof item === "object")
            .slice(-this.maxHistory)
        : [];

      const statistics = parsed.statistics || {};

      this.statistics = {
        evaluations: this.toNonNegativeInteger(statistics.evaluations),
        matches: this.toNonNegativeInteger(statistics.matches),
        errors: this.toNonNegativeInteger(statistics.errors),
      };

      this.revision = this.toNonNegativeInteger(parsed.revision);
      this.lastUpdatedAt = parsed.lastUpdatedAt ?? null;

      return true;
    } catch (error) {
      this.handleError(error, "load");
      return false;
    }
  }

  persist() {
    if (this.destroyed || !this.storage) {
      return false;
    }

    try {
      const payload = {
        version: this.version,
        revision: this.revision,
        lastUpdatedAt: this.lastUpdatedAt,
        rules: this.rules,
        history: this.history.slice(-this.maxHistory),
        statistics: this.statistics,
      };

      this.storage.setItem(
        this.storageKey,
        JSON.stringify(payload)
      );

      return true;
    } catch (error) {
      this.handleError(error, "persist");
      return false;
    }
  }

  addRule(input = {}) {
    this.assertActive();

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Rule must be an object.");
    }

    const now = this.now();

    const rule = {
      ...input,
      id: this.normalizeId(input.id) || this.createId("rule"),
      name: String(input.name || input.title || "Unnamed rule").trim(),
      enabled: input.enabled !== false,
      conditions: Array.isArray(input.conditions)
        ? input.conditions.map((condition) => ({ ...condition }))
        : [],
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };

    if (this.rules.some((item) => item.id === rule.id)) {
      throw new Error(`Rule "${rule.id}" already exists.`);
    }

    this.rules.push(rule);
    this.commit("rule-added", { rule });

    return this.clone(rule);
  }

  updateRule(id, changes = {}) {
    this.assertActive();

    const index = this.findRuleIndex(id);

    if (index < 0) {
      return null;
    }

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Rule changes must be an object.");
    }

    const current = this.rules[index];
    const updated = {
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now(),
    };

    if (Array.isArray(changes.conditions)) {
      updated.conditions = changes.conditions.map((condition) => ({
        ...condition,
      }));
    }

    if (updated.name !== undefined) {
      updated.name = String(updated.name).trim() || "Unnamed rule";
    }

    this.rules[index] = updated;
    this.commit("rule-updated", { rule: updated });

    return this.clone(updated);
  }

  removeRule(id) {
    this.assertActive();

    const index = this.findRuleIndex(id);

    if (index < 0) {
      return false;
    }

    const [removed] = this.rules.splice(index, 1);

    this.commit("rule-removed", {
      ruleId: removed.id,
      rule: removed,
    });

    return true;
  }

  setRuleEnabled(id, enabled) {
    return this.updateRule(id, {
      enabled: Boolean(enabled),
    });
  }

  enableRule(id) {
    return this.setRuleEnabled(id, true);
  }

  disableRule(id) {
    return this.setRuleEnabled(id, false);
  }

  toggleRule(id) {
    const rule = this.getRule(id);

    if (!rule) {
      return null;
    }

    return this.setRuleEnabled(rule.id, !rule.enabled);
  }

  getRule(id) {
    const index = this.findRuleIndex(id);

    return index < 0 ? null : this.clone(this.rules[index]);
  }

  getRules({
    enabled = null,
    search = "",
    sort = "updatedAt",
    direction = "desc",
  } = {}) {
    let result = this.rules.slice();

    if (enabled !== null) {
      result = result.filter(
        (rule) => rule.enabled === Boolean(enabled)
      );
    }

    const query = String(search).trim().toLowerCase();

    if (query) {
      result = result.filter((rule) => {
        const searchable = [
          rule.id,
          rule.name,
          rule.description,
          rule.severity,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      });
    }

    const sortDirection = direction === "asc" ? 1 : -1;

    result.sort((a, b) => {
      const left = a[sort];
      const right = b[sort];

      if (left === right) {
        return 0;
      }

      if (left === undefined || left === null) {
        return 1;
      }

      if (right === undefined || right === null) {
        return -1;
      }

      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * sortDirection;
      }

      return String(left).localeCompare(String(right)) * sortDirection;
    });

    return result.map((rule) => this.clone(rule));
  }

  recordEvaluation(result = {}) {
    this.assertActive();

    this.statistics.evaluations += 1;

    if (Array.isArray(result.matches)) {
      this.statistics.matches += result.matches.length;
    } else if (Number.isFinite(Number(result.matchCount))) {
      this.statistics.matches += Math.max(
        0,
        Number(result.matchCount)
      );
    }

    if (Array.isArray(result.errors)) {
      this.statistics.errors += result.errors.length;
    }

    this.commit("evaluation-recorded", {
      evaluation: this.clone(result),
    });

    return this.getStatistics();
  }

  recordMatch(match = {}) {
    this.assertActive();

    if (!match || typeof match !== "object" || Array.isArray(match)) {
      throw new TypeError("Match must be an object.");
    }

    const entry = {
      ...match,
      id: this.normalizeId(match.id) || this.createId("match"),
      timestamp: match.timestamp ?? this.now(),
    };

    this.history.push(entry);

    if (this.history.length > this.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.maxHistory
      );
    }

    this.commit("match-recorded", {
      match: entry,
    });

    return this.clone(entry);
  }

  getHistory({
    limit = 100,
    ruleId = null,
    severity = null,
    search = "",
    since = null,
    until = null,
  } = {}) {
    let result = this.history.slice();

    if (ruleId !== null) {
      result = result.filter(
        (entry) => String(entry.ruleId) === String(ruleId)
      );
    }

    if (severity !== null) {
      const expected = String(severity).toLowerCase();

      result = result.filter(
        (entry) =>
          String(entry.severity || "info").toLowerCase() === expected
      );
    }

    if (since !== null) {
      result = result.filter(
        (entry) => Number(entry.timestamp) >= Number(since)
      );
    }

    if (until !== null) {
      result = result.filter(
        (entry) => Number(entry.timestamp) <= Number(until)
      );
    }

    const query = String(search).trim().toLowerCase();

    if (query) {
      result = result.filter((entry) => {
        const searchable = [
          entry.ruleId,
          entry.ruleName,
          entry.message,
          entry.severity,
          entry.reason,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      });
    }

    result.reverse();

    const safeLimit = Math.max(0, this.toNonNegativeInteger(limit));

    return result.slice(0, safeLimit).map((entry) => this.clone(entry));
  }

  clearHistory() {
    this.assertActive();

    const previousCount = this.history.length;
    this.history = [];

    this.commit("history-cleared", {
      previousCount,
    });

    return previousCount;
  }

  clearStatistics() {
    this.assertActive();

    this.statistics = {
      evaluations: 0,
      matches: 0,
      errors: 0,
    };

    this.commit("statistics-cleared");

    return this.getStatistics();
  }

  clear() {
    this.assertActive();

    const previous = {
      rules: this.rules.length,
      history: this.history.length,
    };

    this.rules = [];
    this.history = [];
    this.statistics = {
      evaluations: 0,
      matches: 0,
      errors: 0,
    };

    this.commit("store-cleared", previous);

    return previous;
  }

  getStatistics() {
    return {
      ...this.statistics,
      ruleCount: this.rules.length,
      enabledRuleCount: this.rules.filter(
        (rule) => rule.enabled
      ).length,
      disabledRuleCount: this.rules.filter(
        (rule) => !rule.enabled
      ).length,
      historyCount: this.history.length,
    };
  }

  getSummary() {
    return {
      ...this.getStatistics(),
      revision: this.revision,
      version: this.version,
      lastUpdatedAt: this.lastUpdatedAt,
      destroyed: this.destroyed,
    };
  }

  exportJSON({ includeHistory = true } = {}) {
    return JSON.stringify(
      {
        version: this.version,
        exportedAt: this.now(),
        rules: this.rules,
        history: includeHistory ? this.history : [],
        statistics: this.statistics,
      },
      null,
      2
    );
  }

  importJSON(input, { replace = true } = {}) {
    this.assertActive();

    let parsed;

    try {
      parsed = typeof input === "string"
        ? JSON.parse(input)
        : input;
    } catch (error) {
      throw new Error(`Invalid JSON import: ${error.message}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Import must contain a JSON object.");
    }

    if (!Array.isArray(parsed.rules)) {
      throw new TypeError("Import must contain a rules array.");
    }

    const importedRules = parsed.rules.map((rule, index) => {
      if (!this.isValidRule(rule)) {
        throw new TypeError(`Invalid rule at index ${index}.`);
      }

      return {
        ...rule,
        id: this.normalizeId(rule.id) || this.createId("rule"),
        name: String(rule.name || rule.title || "Unnamed rule"),
        enabled: rule.enabled !== false,
        conditions: Array.isArray(rule.conditions)
          ? rule.conditions.map((condition) => ({ ...condition }))
          : [],
        updatedAt: this.now(),
      };
    });

    const ids = new Set();

    for (const rule of importedRules) {
      if (ids.has(rule.id)) {
        throw new Error(`Duplicate imported rule ID: ${rule.id}`);
      }

      ids.add(rule.id);
    }

    const nextRules = replace
      ? importedRules
      : [...this.rules];

    if (!replace) {
      for (const rule of importedRules) {
        if (nextRules.some((existing) => existing.id === rule.id)) {
          throw new Error(`Rule "${rule.id}" already exists.`);
        }

        nextRules.push(rule);
      }
    }

    this.rules = nextRules;

    if (replace && Array.isArray(parsed.history)) {
      this.history = parsed.history
        .filter((entry) => entry && typeof entry === "object")
        .slice(-this.maxHistory);
    }

    if (replace && parsed.statistics && typeof parsed.statistics === "object") {
      this.statistics = {
        evaluations: this.toNonNegativeInteger(
          parsed.statistics.evaluations
        ),
        matches: this.toNonNegativeInteger(
          parsed.statistics.matches
        ),
        errors: this.toNonNegativeInteger(
          parsed.statistics.errors
        ),
      };
    }

    this.commit("store-imported", {
      importedRuleCount: importedRules.length,
      replace,
    });

    return {
      importedRuleCount: importedRules.length,
      totalRuleCount: this.rules.length,
    };
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

  refresh() {
    this.assertActive();

    const loaded = this.load();

    this.emit("store-refreshed", {
      loaded,
      summary: this.getSummary(),
    });

    return loaded;
  }

  commit(type, detail = {}) {
    this.revision += 1;
    this.lastUpdatedAt = this.now();

    this.persist();

    this.emit(type, {
      ...detail,
      revision: this.revision,
      lastUpdatedAt: this.lastUpdatedAt,
    });
  }

  emit(type, detail = {}) {
    if (this.destroyed) {
      return;
    }

    const event = {
      type,
      timestamp: this.now(),
      revision: this.revision,
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

  findRuleIndex(id) {
    const normalizedId = this.normalizeId(id);

    if (!normalizedId) {
      return -1;
    }

    return this.rules.findIndex(
      (rule) => rule.id === normalizedId
    );
  }

  isValidRule(rule) {
    return Boolean(
      rule &&
      typeof rule === "object" &&
      !Array.isArray(rule)
    );
  }

  normalizeId(id) {
    if (id === undefined || id === null) {
      return "";
    }

    return String(id).trim();
  }

  createId(prefix) {
    return `${prefix}-${this.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  clone(value) {
    if (value === undefined) {
      return undefined;
    }

    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  toNonNegativeInteger(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.max(0, Math.floor(number));
  }

  now() {
    try {
      const timestamp = Number(this.clock());

      return Number.isFinite(timestamp)
        ? timestamp
        : Date.now();
    } catch {
      return Date.now();
    }
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Rules engine store has been destroyed.");
    }
  }

  handleError(error, operation, context = {}) {
    const payload = {
      operation,
      message: error instanceof Error
        ? error.message
        : String(error),
      context,
      timestamp: this.now(),
    };

    if (typeof this.onError === "function") {
      try {
        this.onError(payload, error);
      } catch {
        // Error handlers must not interrupt store operations.
      }
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.persist();
    this.destroyed = true;
    this.listeners.clear();
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineStore;