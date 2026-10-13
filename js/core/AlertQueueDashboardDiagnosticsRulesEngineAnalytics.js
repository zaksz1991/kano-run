export class AlertQueueDashboardDiagnosticsRulesEngineAnalytics {
  constructor({
    engine = null,
    store = null,
    storage = globalThis.localStorage,
    storageKey = "aqd-rules-engine-analytics",
    maxHistory = 2000,
    clock = () => Date.now(),
    onError = null,
  } = {}) {
    this.engine = engine;
    this.store = store;
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxHistory = Math.max(1, Number(maxHistory) || 2000);
    this.clock = clock;
    this.onError = onError;

    this.history = [];
    this.listeners = new Set();
    this.unsubscribeEngine = null;
    this.unsubscribeStore = null;
    this.destroyed = false;

    this.metrics = {
      totalEvaluations: 0,
      totalMatches: 0,
      totalErrors: 0,
      totalSkipped: 0,
      firstRecordedAt: null,
      lastRecordedAt: null,
    };

    this.load();

    if (this.engine && typeof this.engine.subscribe === "function") {
      try {
        this.unsubscribeEngine = this.engine.subscribe((event) => {
          this.handleEngineEvent(event);
        });
      } catch (error) {
        this.handleError(error, "subscribe-engine");
      }
    }

    if (this.store && typeof this.store.subscribe === "function") {
      try {
        this.unsubscribeStore = this.store.subscribe((event) => {
          this.handleStoreEvent(event);
        });
      } catch (error) {
        this.handleError(error, "subscribe-store");
      }
    }
  }

  recordEvaluation(result = {}) {
    this.assertActive();

    const timestamp = this.now();
    const matches = Array.isArray(result.matches)
      ? result.matches
      : [];

    const errors = Array.isArray(result.errors)
      ? result.errors
      : [];

    const entry = {
      id: this.createId("evaluation"),
      type: "evaluation",
      timestamp,
      evaluated: result.evaluated !== false,
      rulesChecked: this.toNonNegativeInteger(result.rulesChecked),
      matchCount: matches.length,
      errorCount: errors.length,
      durationMs: this.toNonNegativeNumber(result.durationMs),
      reason: result.reason || null,
      eventType: this.getEventType(result.event),
    };

    this.append(entry);

    if (entry.evaluated) {
      this.metrics.totalEvaluations += 1;
    } else {
      this.metrics.totalSkipped += 1;
    }

    this.metrics.totalMatches += entry.matchCount;
    this.metrics.totalErrors += entry.errorCount;

    this.updateTimestamps(timestamp);
    this.persist();

    this.emit("evaluation-recorded", entry);

    return this.clone(entry);
  }

  recordMatch(match = {}) {
    this.assertActive();

    const timestamp = this.normalizeTimestamp(match.timestamp);

    const entry = {
      id: this.createId("match"),
      type: "match",
      timestamp,
      ruleId: match.ruleId == null ? null : String(match.ruleId),
      ruleName: String(match.ruleName || "Unnamed rule"),
      severity: this.normalizeSeverity(match.severity),
      message: String(match.message || ""),
      reason: match.reason || null,
      evaluationId: match.evaluationId || null,
    };

    this.append(entry);
    this.metrics.totalMatches += 1;
    this.updateTimestamps(timestamp);
    this.persist();

    this.emit("match-recorded", entry);

    return this.clone(entry);
  }

  recordError(error, context = {}) {
    this.assertActive();

    const timestamp = this.now();

    const entry = {
      id: this.createId("error"),
      type: "error",
      timestamp,
      message: this.getErrorMessage(error),
      operation: context.operation || null,
      ruleId: context.ruleId == null ? null : String(context.ruleId),
      code: context.code || null,
    };

    this.append(entry);
    this.metrics.totalErrors += 1;
    this.updateTimestamps(timestamp);
    this.persist();

    this.emit("error-recorded", entry);

    return this.clone(entry);
  }

  recordSkipped(reason, context = {}) {
    this.assertActive();

    const timestamp = this.now();

    const entry = {
      id: this.createId("skipped"),
      type: "skipped",
      timestamp,
      reason: String(reason || "unspecified"),
      ruleId: context.ruleId == null ? null : String(context.ruleId),
    };

    this.append(entry);
    this.metrics.totalSkipped += 1;
    this.updateTimestamps(timestamp);
    this.persist();

    this.emit("evaluation-skipped", entry);

    return this.clone(entry);
  }

  handleEngineEvent(event) {
    if (this.destroyed || !event || typeof event !== "object") {
      return;
    }

    const detail = event.detail || {};

    switch (event.type) {
      case "evaluation-complete":
        this.recordEvaluation(detail);
        break;

      case "rule-matched":
        if (detail.match) {
          this.recordMatch(detail.match);
        }
        break;

      case "evaluation-error":
        this.recordError(detail.error || detail.message, detail);
        break;

      case "evaluation-skipped":
        this.recordSkipped(detail.reason, detail);
        break;

      default:
        break;
    }
  }

  handleStoreEvent(event) {
    if (this.destroyed || !event || typeof event !== "object") {
      return;
    }

    if (event.type === "match-recorded" && event.detail?.match) {
      const match = event.detail.match;

      const alreadyRecorded = this.history.some(
        (entry) =>
          entry.type === "match" &&
          entry.ruleId === String(match.ruleId ?? "") &&
          entry.timestamp === this.normalizeTimestamp(match.timestamp)
      );

      if (!alreadyRecorded) {
        this.recordMatch(match);
      }
    }
  }

  append(entry) {
    this.history.push(entry);

    if (this.history.length > this.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.maxHistory
      );
    }
  }

  getHistory({
    limit = 100,
    type = "all",
    severity = null,
    ruleId = null,
    search = "",
    since = null,
    until = null,
    order = "desc",
  } = {}) {
    let entries = this.history.slice();

    if (type !== "all") {
      entries = entries.filter((entry) => entry.type === type);
    }

    if (severity !== null) {
      const expected = this.normalizeSeverity(severity);

      entries = entries.filter(
        (entry) => entry.severity === expected
      );
    }

    if (ruleId !== null) {
      entries = entries.filter(
        (entry) => entry.ruleId === String(ruleId)
      );
    }

    if (since !== null) {
      const lowerBound = Number(since);

      entries = entries.filter(
        (entry) => entry.timestamp >= lowerBound
      );
    }

    if (until !== null) {
      const upperBound = Number(until);

      entries = entries.filter(
        (entry) => entry.timestamp <= upperBound
      );
    }

    const query = String(search).trim().toLowerCase();

    if (query) {
      entries = entries.filter((entry) => {
        const searchable = [
          entry.type,
          entry.ruleId,
          entry.ruleName,
          entry.message,
          entry.reason,
          entry.operation,
          entry.eventType,
          entry.severity,
        ]
          .filter((value) => value != null)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      });
    }

    entries.sort((a, b) =>
      order === "asc"
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    return entries
      .slice(0, Math.max(0, this.toNonNegativeInteger(limit)))
      .map((entry) => this.clone(entry));
  }

  getMetrics({ since = null, until = null } = {}) {
    if (since === null && until === null) {
      return {
        ...this.metrics,
        historyCount: this.history.length,
        matchRate: this.calculateMatchRate(
          this.metrics.totalMatches,
          this.metrics.totalEvaluations
        ),
        errorRate: this.calculateErrorRate(
          this.metrics.totalErrors,
          this.metrics.totalEvaluations
        ),
      };
    }

    const entries = this.history.filter((entry) => {
      if (since !== null && entry.timestamp < Number(since)) {
        return false;
      }

      if (until !== null && entry.timestamp > Number(until)) {
        return false;
      }

      return true;
    });

    const evaluations = entries.filter(
      (entry) => entry.type === "evaluation"
    );

    const matches = entries.filter(
      (entry) => entry.type === "match"
    );

    const errors = entries.filter(
      (entry) => entry.type === "error"
    );

    const skipped = entries.filter(
      (entry) => entry.type === "skipped"
    );

    const evaluationCount = evaluations.filter(
      (entry) => entry.evaluated
    ).length;

    return {
      totalEvaluations: evaluationCount,
      totalMatches: matches.length,
      totalErrors: errors.length,
      totalSkipped: skipped.length,
      historyCount: entries.length,
      matchRate: this.calculateMatchRate(
        matches.length,
        evaluationCount
      ),
      errorRate: this.calculateErrorRate(
        errors.length,
        evaluationCount
      ),
      firstRecordedAt: entries.length
        ? Math.min(...entries.map((entry) => entry.timestamp))
        : null,
      lastRecordedAt: entries.length
        ? Math.max(...entries.map((entry) => entry.timestamp))
        : null,
    };
  }

  getRuleBreakdown({ limit = 100 } = {}) {
    const breakdown = new Map();

    for (const entry of this.history) {
      if (!entry.ruleId) {
        continue;
      }

      if (!breakdown.has(entry.ruleId)) {
        breakdown.set(entry.ruleId, {
          ruleId: entry.ruleId,
          ruleName: entry.ruleName || entry.ruleId,
          matches: 0,
          errors: 0,
          lastTriggeredAt: null,
          severityCounts: {},
        });
      }

      const item = breakdown.get(entry.ruleId);

      if (entry.type === "match") {
        item.matches += 1;
        item.lastTriggeredAt = Math.max(
          item.lastTriggeredAt || 0,
          entry.timestamp
        );

        const severity = this.normalizeSeverity(entry.severity);

        item.severityCounts[severity] =
          (item.severityCounts[severity] || 0) + 1;
      }

      if (entry.type === "error") {
        item.errors += 1;
      }
    }

    return Array.from(breakdown.values())
      .sort((a, b) => b.matches - a.matches)
      .slice(0, Math.max(0, this.toNonNegativeInteger(limit)))
      .map((item) => this.clone(item));
  }

  getSeverityBreakdown() {
    const breakdown = {};

    for (const entry of this.history) {
      if (entry.type !== "match") {
        continue;
      }

      const severity = this.normalizeSeverity(entry.severity);
      breakdown[severity] = (breakdown[severity] || 0) + 1;
    }

    return breakdown;
  }

  getTimeline({ intervalMs = 60_000, since = null, until = null } = {}) {
    const interval = Math.max(1, Number(intervalMs) || 60_000);
    const entries = this.history.filter((entry) => {
      if (since !== null && entry.timestamp < Number(since)) {
        return false;
      }

      if (until !== null && entry.timestamp > Number(until)) {
        return false;
      }

      return true;
    });

    const buckets = new Map();

    for (const entry of entries) {
      const bucketStart =
        Math.floor(entry.timestamp / interval) * interval;

      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, {
          timestamp: bucketStart,
          evaluations: 0,
          matches: 0,
          errors: 0,
          skipped: 0,
        });
      }

      const bucket = buckets.get(bucketStart);

      if (entry.type === "evaluation" && entry.evaluated) {
        bucket.evaluations += 1;
      } else if (entry.type === "match") {
        bucket.matches += 1;
      } else if (entry.type === "error") {
        bucket.errors += 1;
      } else if (entry.type === "skipped") {
        bucket.skipped += 1;
      }
    }

    return Array.from(buckets.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }

  getSummary() {
    return {
      ...this.getMetrics(),
      ruleBreakdown: this.getRuleBreakdown(),
      severityBreakdown: this.getSeverityBreakdown(),
      lastEvent: this.history.length
        ? this.clone(this.history[this.history.length - 1])
        : null,
      destroyed: this.destroyed,
    };
  }

  clearHistory({ resetMetrics = true } = {}) {
    this.assertActive();

    const removedCount = this.history.length;
    this.history = [];

    if (resetMetrics) {
      this.metrics = {
        totalEvaluations: 0,
        totalMatches: 0,
        totalErrors: 0,
        totalSkipped: 0,
        firstRecordedAt: null,
        lastRecordedAt: null,
      };
    }

    this.persist();

    this.emit("history-cleared", {
      removedCount,
      resetMetrics,
    });

    return removedCount;
  }

  exportJSON({ includeHistory = true } = {}) {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: this.now(),
        metrics: this.metrics,
        history: includeHistory ? this.history : [],
      },
      null,
      2
    );
  }

  importJSON(input, { replace = true } = {}) {
    this.assertActive();

    const parsed = typeof input === "string"
      ? JSON.parse(input)
      : input;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Analytics import must be a JSON object.");
    }

    const imported = Array.isArray(parsed.history)
      ? parsed.history
          .filter(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              Number.isFinite(Number(entry.timestamp))
          )
          .map((entry) => ({
            ...entry,
            timestamp: Number(entry.timestamp),
          }))
      : [];

    this.history = replace
      ? imported.slice(-this.maxHistory)
      : [...this.history, ...imported].slice(-this.maxHistory);

    if (replace && parsed.metrics && typeof parsed.metrics === "object") {
      this.metrics = {
        totalEvaluations: this.toNonNegativeInteger(
          parsed.metrics.totalEvaluations
        ),
        totalMatches: this.toNonNegativeInteger(
          parsed.metrics.totalMatches
        ),
        totalErrors: this.toNonNegativeInteger(
          parsed.metrics.totalErrors
        ),
        totalSkipped: this.toNonNegativeInteger(
          parsed.metrics.totalSkipped
        ),
        firstRecordedAt: parsed.metrics.firstRecordedAt ?? null,
        lastRecordedAt: parsed.metrics.lastRecordedAt ?? null,
      };
    } else {
      this.recalculateMetrics();
    }

    this.persist();

    this.emit("analytics-imported", {
      importedCount: imported.length,
      replace,
    });

    return {
      importedCount: imported.length,
      totalCount: this.history.length,
    };
  }

  recalculateMetrics() {
    const evaluations = this.history.filter(
      (entry) => entry.type === "evaluation" && entry.evaluated
    );

    const matches = this.history.filter(
      (entry) => entry.type === "match"
    );

    const errors = this.history.filter(
      (entry) => entry.type === "error"
    );

    const skipped = this.history.filter(
      (entry) => entry.type === "skipped"
    );

    const timestamps = this.history.map((entry) => entry.timestamp);

    this.metrics = {
      totalEvaluations: evaluations.length,
      totalMatches: matches.length,
      totalErrors: errors.length,
      totalSkipped: skipped.length,
      firstRecordedAt: timestamps.length
        ? Math.min(...timestamps)
        : null,
      lastRecordedAt: timestamps.length
        ? Math.max(...timestamps)
        : null,
    };
  }

  load() {
    if (!this.storage) {
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

      this.history = Array.isArray(parsed.history)
        ? parsed.history
            .filter(
              (entry) =>
                entry &&
                typeof entry === "object" &&
                Number.isFinite(Number(entry.timestamp))
            )
            .slice(-this.maxHistory)
        : [];

      if (parsed.metrics && typeof parsed.metrics === "object") {
        this.metrics = {
          totalEvaluations: this.toNonNegativeInteger(
            parsed.metrics.totalEvaluations
          ),
          totalMatches: this.toNonNegativeInteger(
            parsed.metrics.totalMatches
          ),
          totalErrors: this.toNonNegativeInteger(
            parsed.metrics.totalErrors
          ),
          totalSkipped: this.toNonNegativeInteger(
            parsed.metrics.totalSkipped
          ),
          firstRecordedAt: parsed.metrics.firstRecordedAt ?? null,
          lastRecordedAt: parsed.metrics.lastRecordedAt ?? null,
        };
      } else {
        this.recalculateMetrics();
      }

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
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          metrics: this.metrics,
          history: this.history.slice(-this.maxHistory),
        })
      );

      return true;
    } catch (error) {
      this.handleError(error, "persist");
      return false;
    }
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
    if (this.destroyed) {
      return;
    }

    const event = {
      type,
      timestamp: this.now(),
      detail: this.clone(detail),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.handleError(error, "listener", { type });
      }
    }
  }

  updateTimestamps(timestamp) {
    this.metrics.firstRecordedAt =
      this.metrics.firstRecordedAt === null
        ? timestamp
        : Math.min(this.metrics.firstRecordedAt, timestamp);

    this.metrics.lastRecordedAt =
      this.metrics.lastRecordedAt === null
        ? timestamp
        : Math.max(this.metrics.lastRecordedAt, timestamp);
  }

  calculateMatchRate(matches, evaluations) {
    return evaluations > 0
      ? Number((matches / evaluations).toFixed(4))
      : 0;
  }

  calculateErrorRate(errors, evaluations) {
    return evaluations > 0
      ? Number((errors / evaluations).toFixed(4))
      : 0;
  }

  getEventType(event) {
    if (!event || typeof event !== "object") {
      return null;
    }

    return event.type || event.name || event.eventType || null;
  }

  normalizeSeverity(value) {
    const severity = String(value || "info").toLowerCase();

    return [
      "critical",
      "error",
      "warning",
      "info",
      "debug",
    ].includes(severity)
      ? severity
      : "info";
  }

  normalizeTimestamp(value) {
    if (value === null || value === undefined) {
      return this.now();
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? parsed : this.now();
  }

  toNonNegativeInteger(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, Math.floor(number))
      : 0;
  }

  toNonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, number)
      : 0;
  }

  createId(prefix) {
    return `${prefix}-${this.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  clone(value) {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  getErrorMessage(error) {
    return error instanceof Error
      ? error.message
      : String(error ?? "Unknown error");
  }

  now() {
    try {
      const value = Number(this.clock());

      return Number.isFinite(value) ? value : Date.now();
    } catch {
      return Date.now();
    }
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Rules engine analytics has been destroyed.");
    }
  }

  handleError(error, operation, context = {}) {
    if (typeof this.onError !== "function") {
      return;
    }

    try {
      this.onError(
        {
          operation,
          message: this.getErrorMessage(error),
          context,
          timestamp: this.now(),
        },
        error
      );
    } catch {
      // Analytics error handlers must not interrupt application execution.
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (typeof this.unsubscribeEngine === "function") {
      try {
        this.unsubscribeEngine();
      } catch (error) {
        this.handleError(error, "unsubscribe-engine");
      }
    }

    if (typeof this.unsubscribeStore === "function") {
      try {
        this.unsubscribeStore();
      } catch (error) {
        this.handleError(error, "unsubscribe-store");
      }
    }

    this.persist();
    this.destroyed = true;

    this.unsubscribeEngine = null;
    this.unsubscribeStore = null;
    this.listeners.clear();
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAnalytics;