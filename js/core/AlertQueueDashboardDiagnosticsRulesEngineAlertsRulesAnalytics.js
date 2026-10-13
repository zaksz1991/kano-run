const DEFAULT_CONFIG = Object.freeze({
  storageKey: "kanoRun.alertDashboard.alertRulesAnalytics",
  maxHistory: 2000,
  maxTimelineBuckets: 120,
  defaultTimelineIntervalMs: 60_000,
});

const EVENT_TYPES = new Set([
  "created",
  "updated",
  "removed",
  "enabled",
  "disabled",
  "evaluated",
  "matched",
  "imported",
  "error",
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
      // Fall back for non-cloneable values.
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

  return `rule-analytics-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
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

const normalizeEventType = (value) => {
  const type = String(value ?? "")
    .toLowerCase()
    .replace(/^rule:/, "");

  return EVENT_TYPES.has(type) ? type : "updated";
};

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesAnalytics {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(isObject(options.config) ? options.config : {}),
    };

    this.clock = options.clock;
    this.storage = options.storage ?? this.getDefaultStorage();

    this.storageKey = String(
      options.storageKey ?? this.config.storageKey,
    );

    this.onError = typeof options.onError === "function"
      ? options.onError
      : null;

    this.rules = options.rules ?? options.rulesStore ?? null;

    this.history = [];
    this.listeners = new Set();
    this.destroyed = false;
    this.unsubscribeRules = null;

    this.statistics = this.createEmptyStatistics();

    this.load();

    if (options.autoSubscribe !== false) {
      this.connectRules();
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

  createEmptyStatistics() {
    return {
      totalEvents: 0,
      created: 0,
      updated: 0,
      removed: 0,
      enabled: 0,
      disabled: 0,
      evaluated: 0,
      matched: 0,
      imported: 0,
      errors: 0,
      firstEventAt: null,
      lastEventAt: null,
    };
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Rules analytics has been destroyed.");
    }
  }

  reportError(error, operation = "unknown") {
    if (this.onError) {
      try {
        this.onError(error, {
          operation,
          timestamp: getTimestamp(this.clock),
        });
      } catch {
        // Error handlers must not interrupt analytics.
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
      timestamp: Number.isFinite(Number(event?.timestamp))
        ? Number(event.timestamp)
        : getTimestamp(this.clock),
    };

    for (const listener of this.listeners) {
      try {
        listener(clone(payload));
      } catch (error) {
        this.reportError(error, "subscriber");
      }
    }
  }

  connectRules() {
    if (
      !this.rules ||
      typeof this.rules.subscribe !== "function" ||
      this.unsubscribeRules
    ) {
      return false;
    }

    try {
      this.unsubscribeRules = this.rules.subscribe((event) => {
        if (!event || this.destroyed) return;

        this.recordEvent(event, {
          source: "rules-store",
          persist: true,
        });
      });

      return true;
    } catch (error) {
      this.reportError(error, "connect-rules");
      return false;
    }
  }

  recordEvent(event = {}, options = {}) {
    this.assertActive();

    if (!isObject(event)) {
      throw new TypeError("Analytics events must be objects.");
    }

    const timestamp = Number.isFinite(Number(event.timestamp))
      ? Number(event.timestamp)
      : getTimestamp(this.clock);

    const rawType = event.type ?? event.action ?? event.eventType;
    const type = normalizeEventType(rawType);

    const rule = isObject(event.rule)
      ? event.rule
      : isObject(event.data)
        ? event.data
        : {};

    const entry = {
      id: makeId(),
      type,
      source: String(options.source ?? event.source ?? "manual"),
      ruleId: event.ruleId ?? rule.id ?? event.id ?? null,
      ruleName: rule.name ?? event.ruleName ?? null,
      severity: String(rule.severity ?? event.severity ?? "warning")
        .toLowerCase(),
      enabled: typeof rule.enabled === "boolean" ? rule.enabled : null,
      matched: typeof event.matched === "boolean"
        ? event.matched
        : typeof event.result?.matched === "boolean"
          ? event.result.matched
          : type === "matched",
      reason: event.reason ?? event.result?.reason ?? null,
      evaluationCount: Number(rule.evaluationCount) || 0,
      matchCount: Number(rule.matchCount) || 0,
      details: this.sanitizeDetails(
        event.details ?? event.result ?? {},
      ),
      timestamp,
    };

    this.history.push(entry);

    if (this.history.length > this.config.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.config.maxHistory,
      );
    }

    this.statistics.totalEvents += 1;
    this.statistics[type] = (this.statistics[type] || 0) + 1;

    if (this.statistics.firstEventAt === null) {
      this.statistics.firstEventAt = timestamp;
    }

    this.statistics.lastEventAt = timestamp;

    if (options.persist !== false) {
      this.persist();
    }

    this.emit({
      type: "analytics:event",
      event: clone(entry),
      statistics: this.getStatistics(),
    });

    return clone(entry);
  }

  sanitizeDetails(value) {
    if (!isObject(value)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return value;
      }

      return {};
    }

    const result = {};

    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (typeof item === "function" || typeof item === "symbol") {
        continue;
      }

      if (item === undefined) continue;

      if (item === null || [
        "string",
        "number",
        "boolean",
      ].includes(typeof item)) {
        result[key] = typeof item === "string"
          ? item.slice(0, 1000)
          : item;
      } else if (Array.isArray(item)) {
        result[key] = clone(item.slice(0, 50));
      } else if (isObject(item)) {
        result[key] = Object.fromEntries(
          Object.entries(item)
            .slice(0, 30)
            .filter(([, nested]) =>
              nested === null ||
              ["string", "number", "boolean"].includes(typeof nested),
            )
            .map(([nestedKey, nested]) => [
              nestedKey,
              typeof nested === "string"
                ? nested.slice(0, 500)
                : nested,
            ]),
        );
      }
    }

    return result;
  }

  recordCreated(rule, options = {}) {
    return this.recordEvent({
      type: "created",
      rule,
    }, options);
  }

  recordUpdated(rule, options = {}) {
    return this.recordEvent({
      type: "updated",
      rule,
    }, options);
  }

  recordRemoved(rule, options = {}) {
    return this.recordEvent({
      type: "removed",
      rule,
    }, options);
  }

  recordEnabled(rule, options = {}) {
    return this.recordEvent({
      type: "enabled",
      rule,
    }, options);
  }

  recordDisabled(rule, options = {}) {
    return this.recordEvent({
      type: "disabled",
      rule,
    }, options);
  }

  recordEvaluation(rule, result = {}, options = {}) {
    return this.recordEvent({
      type: "evaluated",
      rule,
      matched: Boolean(result.matched),
      result,
    }, options);
  }

  recordMatch(rule, details = {}, options = {}) {
    return this.recordEvent({
      type: "matched",
      rule,
      matched: true,
      details,
    }, options);
  }

  recordError(error, details = {}, options = {}) {
    return this.recordEvent({
      type: "error",
      details: {
        message: error instanceof Error
          ? error.message
          : String(error),
        ...details,
      },
    }, options);
  }

  getHistory(options = {}) {
    let entries = [...this.history];

    if (options.type) {
      const type = normalizeEventType(options.type);

      entries = entries.filter((entry) => entry.type === type);
    }

    if (options.ruleId) {
      entries = entries.filter(
        (entry) => String(entry.ruleId) === String(options.ruleId),
      );
    }

    if (options.severity) {
      entries = entries.filter(
        (entry) => entry.severity === String(options.severity).toLowerCase(),
      );
    }

    if (options.source) {
      entries = entries.filter(
        (entry) => entry.source === String(options.source),
      );
    }

    if (Number.isFinite(Number(options.since))) {
      entries = entries.filter(
        (entry) => entry.timestamp >= Number(options.since),
      );
    }

    if (Number.isFinite(Number(options.until))) {
      entries = entries.filter(
        (entry) => entry.timestamp <= Number(options.until),
      );
    }

    if (options.order === "asc") {
      entries.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      entries.sort((a, b) => b.timestamp - a.timestamp);
    }

    if (Number.isFinite(Number(options.limit))) {
      const limit = Math.max(0, Math.floor(Number(options.limit)));
      entries = entries.slice(0, limit);
    }

    return entries.map(clone);
  }

  getRuleBreakdown(options = {}) {
    const counts = new Map();

    for (const entry of this.getHistory(options)) {
      const key = String(entry.ruleId ?? "unknown");

      if (!counts.has(key)) {
        counts.set(key, {
          ruleId: entry.ruleId,
          ruleName: entry.ruleName ?? "Unknown rule",
          totalEvents: 0,
          created: 0,
          updated: 0,
          removed: 0,
          enabled: 0,
          disabled: 0,
          evaluated: 0,
          matched: 0,
          errors: 0,
          lastEventAt: null,
        });
      }

      const item = counts.get(key);

      item.totalEvents += 1;
      item[entry.type] = (item[entry.type] || 0) + 1;

      if (
        item.lastEventAt === null ||
        entry.timestamp > item.lastEventAt
      ) {
        item.lastEventAt = entry.timestamp;
      }
    }

    return [...counts.values()].sort(
      (a, b) => b.totalEvents - a.totalEvents,
    );
  }

  getSeverityBreakdown(options = {}) {
    const counts = new Map();

    for (const entry of this.getHistory(options)) {
      const severity = entry.severity || "warning";

      if (!counts.has(severity)) {
        counts.set(severity, {
          severity,
          totalEvents: 0,
          matches: 0,
          errors: 0,
          evaluations: 0,
        });
      }

      const item = counts.get(severity);

      item.totalEvents += 1;

      if (entry.type === "matched") item.matches += 1;
      if (entry.type === "error") item.errors += 1;
      if (entry.type === "evaluated") item.evaluations += 1;
    }

    return [...counts.values()].sort(
      (a, b) => b.totalEvents - a.totalEvents,
    );
  }

  getEventTypeBreakdown(options = {}) {
    const counts = new Map();

    for (const entry of this.getHistory(options)) {
      const type = entry.type;

      if (!counts.has(type)) {
        counts.set(type, {
          type,
          count: 0,
          lastEventAt: null,
        });
      }

      const item = counts.get(type);

      item.count += 1;

      if (
        item.lastEventAt === null ||
        entry.timestamp > item.lastEventAt
      ) {
        item.lastEventAt = entry.timestamp;
      }
    }

    return [...counts.values()].sort(
      (a, b) => b.count - a.count,
    );
  }

  getTimeline(options = {}) {
    const intervalMs = Math.max(
      1,
      Math.floor(
        Number(options.intervalMs) ||
        this.config.defaultTimelineIntervalMs,
      ),
    );

    const history = this.getHistory({
      since: options.since,
      until: options.until,
      order: "asc",
    });

    const buckets = new Map();

    for (const entry of history) {
      const bucketTime =
        Math.floor(entry.timestamp / intervalMs) * intervalMs;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, {
          timestamp: bucketTime,
          totalEvents: 0,
          created: 0,
          updated: 0,
          removed: 0,
          enabled: 0,
          disabled: 0,
          evaluated: 0,
          matched: 0,
          imported: 0,
          errors: 0,
        });
      }

      const bucket = buckets.get(bucketTime);

      bucket.totalEvents += 1;
      bucket[entry.type] = (bucket[entry.type] || 0) + 1;
    }

    const timeline = [...buckets.values()].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const maximum = Math.max(
      1,
      Math.floor(
        Number(options.limit) || this.config.maxTimelineBuckets,
      ),
    );

    return timeline.slice(-maximum).map(clone);
  }

  getMetrics(options = {}) {
    const history = this.getHistory(options);

    const count = (type) =>
      history.filter((entry) => entry.type === type).length;

    const evaluated = count("evaluated");
    const matched = count("matched");

    const matchRate = evaluated > 0
      ? (matched / evaluated) * 100
      : 0;

    const uniqueRuleIds = new Set(
      history
        .map((entry) => entry.ruleId)
        .filter((id) => id !== null && id !== undefined),
    );

    return {
      totalEvents: history.length,
      created: count("created"),
      updated: count("updated"),
      removed: count("removed"),
      enabled: count("enabled"),
      disabled: count("disabled"),
      evaluated,
      matched,
      imported: count("imported"),
      errors: count("error"),
      matchRate: Number(matchRate.toFixed(2)),
      uniqueRules: uniqueRuleIds.size,
      firstEventAt: history.length
        ? Math.min(...history.map((entry) => entry.timestamp))
        : null,
      lastEventAt: history.length
        ? Math.max(...history.map((entry) => entry.timestamp))
        : null,
    };
  }

  getStatistics() {
    return {
      ...this.statistics,
      historyEntries: this.history.length,
      uniqueRules: new Set(
        this.history
          .map((entry) => entry.ruleId)
          .filter((id) => id !== null && id !== undefined),
      ).size,
    };
  }

  getSummary(options = {}) {
    return {
      statistics: this.getStatistics(),
      metrics: this.getMetrics(options),
      rules: this.getRuleBreakdown(options),
      severities: this.getSeverityBreakdown(options),
      eventTypes: this.getEventTypeBreakdown(options),
      timeline: this.getTimeline(options),
      recentEvents: this.getHistory({
        ...options,
        limit: options.recentLimit ?? 10,
      }),
    };
  }

  clearHistory(options = {}) {
    this.assertActive();

    this.history = [];
    this.statistics = this.createEmptyStatistics();

    if (options.persist !== false) {
      this.persist();
    }

    this.emit({
      type: "analytics:cleared",
      statistics: this.getStatistics(),
    });

    return true;
  }

  resetStatistics(options = {}) {
    this.assertActive();

    this.statistics = this.createEmptyStatistics();

    if (options.clearHistory === true) {
      this.history = [];
    } else {
      for (const entry of this.history) {
        this.statistics.totalEvents += 1;
        this.statistics[entry.type] =
          (this.statistics[entry.type] || 0) + 1;

        if (this.statistics.firstEventAt === null) {
          this.statistics.firstEventAt = entry.timestamp;
        }

        this.statistics.lastEventAt = entry.timestamp;
      }
    }

    if (options.persist !== false) {
      this.persist();
    }

    this.emit({
      type: "analytics:statistics-reset",
      statistics: this.getStatistics(),
    });

    return this.getStatistics();
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

      this.history = Array.isArray(data.history)
        ? data.history
            .filter((entry) => isObject(entry))
            .slice(-this.config.maxHistory)
            .map((entry) => ({
              id: String(entry.id ?? makeId()),
              type: normalizeEventType(entry.type),
              source: String(entry.source ?? "storage"),
              ruleId: entry.ruleId ?? null,
              ruleName: entry.ruleName ?? null,
              severity: String(entry.severity ?? "warning"),
              enabled: typeof entry.enabled === "boolean"
                ? entry.enabled
                : null,
              matched: Boolean(entry.matched),
              reason: entry.reason ?? null,
              evaluationCount: Number(entry.evaluationCount) || 0,
              matchCount: Number(entry.matchCount) || 0,
              details: this.sanitizeDetails(entry.details),
              timestamp: Number.isFinite(Number(entry.timestamp))
                ? Number(entry.timestamp)
                : getTimestamp(this.clock),
            }))
        : [];

      this.rebuildStatistics();

      return true;
    } catch (error) {
      this.reportError(error, "load");
      return false;
    }
  }

  rebuildStatistics() {
    this.statistics = this.createEmptyStatistics();

    for (const entry of this.history) {
      this.statistics.totalEvents += 1;
      this.statistics[entry.type] =
        (this.statistics[entry.type] || 0) + 1;

      if (this.statistics.firstEventAt === null) {
        this.statistics.firstEventAt = entry.timestamp;
      } else {
        this.statistics.firstEventAt = Math.min(
          this.statistics.firstEventAt,
          entry.timestamp,
        );
      }

      if (this.statistics.lastEventAt === null) {
        this.statistics.lastEventAt = entry.timestamp;
      } else {
        this.statistics.lastEventAt = Math.max(
          this.statistics.lastEventAt,
          entry.timestamp,
        );
      }
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
          savedAt: getTimestamp(this.clock),
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

  exportJSON(options = {}) {
    return JSON.stringify({
      version: 1,
      exportedAt: getTimestamp(this.clock),
      statistics: this.getStatistics(),
      history: this.getHistory(options),
      metrics: this.getMetrics(options),
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
      : parsed?.history;

    if (!Array.isArray(incoming)) {
      throw new TypeError("Import data must contain a history array.");
    }

    const normalized = incoming
      .filter(isObject)
      .map((entry) => ({
        id: String(entry.id ?? makeId()),
        type: normalizeEventType(entry.type),
        source: String(entry.source ?? "import"),
        ruleId: entry.ruleId ?? null,
        ruleName: entry.ruleName ?? null,
        severity: String(entry.severity ?? "warning"),
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : null,
        matched: Boolean(entry.matched),
        reason: entry.reason ?? null,
        evaluationCount: Number(entry.evaluationCount) || 0,
        matchCount: Number(entry.matchCount) || 0,
        details: this.sanitizeDetails(entry.details),
        timestamp: Number.isFinite(Number(entry.timestamp))
          ? Number(entry.timestamp)
          : getTimestamp(this.clock),
      }));

    if (normalized.length > this.config.maxHistory) {
      throw new RangeError("Import exceeds the maximum history size.");
    }

    const replace = options.replace === true;

    this.history = replace
      ? normalized
      : [...this.history, ...normalized].slice(-this.config.maxHistory);

    this.rebuildStatistics();

    if (options.persist !== false) {
      this.persist();
    }

    this.emit({
      type: "analytics:imported",
      count: normalized.length,
      replace,
      statistics: this.getStatistics(),
    });

    return {
      imported: normalized.length,
      totalEvents: this.history.length,
    };
  }

  refresh() {
    this.assertActive();

    const loaded = this.load();

    this.emit({
      type: "analytics:refreshed",
      loaded,
      statistics: this.getStatistics(),
    });

    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) return;

    if (typeof this.unsubscribeRules === "function") {
      try {
        this.unsubscribeRules();
      } catch (error) {
        this.reportError(error, "unsubscribe-rules");
      }
    }

    this.unsubscribeRules = null;
    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesAnalytics;