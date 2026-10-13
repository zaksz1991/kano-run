const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class RouteStatisticsDashboardAlertDeliveryMetrics {
  constructor({
    clock = () => Date.now(),
    windowMs = DEFAULT_WINDOW_MS,
    maxRecords = 10000,
  } = {}) {
    this.clock = clock;
    this.windowMs = Math.max(1000, Number(windowMs) || DEFAULT_WINDOW_MS);
    this.maxRecords = Math.max(100, Number(maxRecords) || 10000);

    this.records = [];
    this.deliveryStates = new Map();
    this.disposed = false;
  }

  recordAttempt({
    deliveryId,
    alertId = null,
    channel = "unknown",
    attemptedAt = this.clock(),
    success = false,
    durationMs = null,
    error = null,
    attemptNumber = 1,
  } = {}) {
    this.assertActive();

    if (deliveryId == null || String(deliveryId).trim() === "") {
      throw new TypeError("A deliveryId is required.");
    }

    const timestamp = this.normalizeTimestamp(attemptedAt);
    const id = String(deliveryId);
    const normalizedChannel = String(channel || "unknown");
    const normalizedAttempt = {
      id: this.createId(id, timestamp),
      deliveryId: id,
      alertId: alertId == null ? null : String(alertId),
      channel: normalizedChannel,
      timestamp,
      success: Boolean(success),
      durationMs: this.normalizeDuration(durationMs),
      error: this.normalizeError(error),
      attemptNumber: Math.max(1, Math.floor(Number(attemptNumber) || 1)),
    };

    this.records.push(normalizedAttempt);
    this.trimRecords();

    const state = this.deliveryStates.get(id) || {
      deliveryId: id,
      alertId: normalizedAttempt.alertId,
      channel: normalizedChannel,
      attempts: 0,
      successes: 0,
      failures: 0,
      firstAttemptAt: timestamp,
      lastAttemptAt: timestamp,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      totalDurationMs: 0,
      measuredDurations: 0,
    };

    state.alertId = normalizedAttempt.alertId ?? state.alertId;
    state.channel = normalizedChannel;
    state.attempts += 1;
    state.lastAttemptAt = timestamp;

    if (state.firstAttemptAt == null || timestamp < state.firstAttemptAt) {
      state.firstAttemptAt = timestamp;
    }

    if (normalizedAttempt.success) {
      state.successes += 1;
      state.lastSuccessAt = timestamp;
      state.lastError = null;
    } else {
      state.failures += 1;
      state.lastFailureAt = timestamp;
      state.lastError = normalizedAttempt.error;
    }

    if (normalizedAttempt.durationMs != null) {
      state.totalDurationMs += normalizedAttempt.durationMs;
      state.measuredDurations += 1;
    }

    this.deliveryStates.set(id, state);

    return this.clone(normalizedAttempt);
  }

  recordSuccess(options = {}) {
    return this.recordAttempt({
      ...options,
      success: true,
      error: null,
    });
  }

  recordFailure(options = {}) {
    return this.recordAttempt({
      ...options,
      success: false,
    });
  }

  getDeliveryMetrics(deliveryId) {
    const state = this.deliveryStates.get(String(deliveryId));

    if (!state) return null;

    return this.clone({
      ...state,
      successRate: this.rate(state.successes, state.attempts),
      failureRate: this.rate(state.failures, state.attempts),
      averageDurationMs: state.measuredDurations
        ? state.totalDurationMs / state.measuredDurations
        : null,
    });
  }

  getSummary({
    since = this.clock() - this.windowMs,
    until = this.clock(),
    channel,
  } = {}) {
    this.assertActive();

    const start = this.normalizeTimestamp(since);
    const end = this.normalizeTimestamp(until);

    const records = this.records.filter((record) => {
      if (record.timestamp < start || record.timestamp > end) return false;
      if (channel != null && record.channel !== String(channel)) return false;
      return true;
    });

    const summary = {
      period: {
        since: start,
        until: end,
      },
      totalAttempts: records.length,
      successes: 0,
      failures: 0,
      uniqueDeliveries: new Set(),
      uniqueAlerts: new Set(),
      channels: {},
      averageDurationMs: null,
      p95DurationMs: null,
      successRate: 0,
      failureRate: 0,
      attemptsPerMinute: 0,
    };

    const durations = [];

    for (const record of records) {
      summary.uniqueDeliveries.add(record.deliveryId);

      if (record.alertId != null) {
        summary.uniqueAlerts.add(record.alertId);
      }

      const channelStats =
        summary.channels[record.channel] ||
        (summary.channels[record.channel] = {
          attempts: 0,
          successes: 0,
          failures: 0,
          durations: [],
        });

      channelStats.attempts += 1;

      if (record.success) {
        summary.successes += 1;
        channelStats.successes += 1;
      } else {
        summary.failures += 1;
        channelStats.failures += 1;
      }

      if (record.durationMs != null) {
        durations.push(record.durationMs);
        channelStats.durations.push(record.durationMs);
      }
    }

    summary.uniqueDeliveries = summary.uniqueDeliveries.size;
    summary.uniqueAlerts = summary.uniqueAlerts.size;
    summary.successRate = this.rate(
      summary.successes,
      summary.totalAttempts
    );
    summary.failureRate = this.rate(
      summary.failures,
      summary.totalAttempts
    );

    const elapsedMinutes = Math.max(1 / 60, (end - start) / 60000);
    summary.attemptsPerMinute = summary.totalAttempts / elapsedMinutes;
    summary.averageDurationMs = this.average(durations);
    summary.p95DurationMs = this.percentile(durations, 95);

    for (const stats of Object.values(summary.channels)) {
      const channelDurations = stats.durations;

      stats.successRate = this.rate(stats.successes, stats.attempts);
      stats.failureRate = this.rate(stats.failures, stats.attempts);
      stats.averageDurationMs = this.average(channelDurations);
      stats.p95DurationMs = this.percentile(channelDurations, 95);

      delete stats.durations;
    }

    return summary;
  }

  getFailureBreakdown({
    since = this.clock() - this.windowMs,
    until = this.clock(),
    channel,
  } = {}) {
    const start = this.normalizeTimestamp(since);
    const end = this.normalizeTimestamp(until);
    const failures = this.records.filter((record) => {
      if (record.success) return false;
      if (record.timestamp < start || record.timestamp > end) return false;
      if (channel != null && record.channel !== String(channel)) return false;
      return true;
    });

    const counts = new Map();

    for (const record of failures) {
      const message = record.error?.message || "Unknown error";
      const key = `${record.channel}:${message}`;

      const entry = counts.get(key) || {
        channel: record.channel,
        message,
        count: 0,
        firstSeenAt: record.timestamp,
        lastSeenAt: record.timestamp,
      };

      entry.count += 1;
      entry.firstSeenAt = Math.min(entry.firstSeenAt, record.timestamp);
      entry.lastSeenAt = Math.max(entry.lastSeenAt, record.timestamp);

      counts.set(key, entry);
    }

    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count
    );
  }

  getChannelMetrics(channel, options = {}) {
    const summary = this.getSummary({
      ...options,
      channel,
    });

    return {
      channel: String(channel),
      ...summary,
    };
  }

  getRecentAttempts({
    limit = 100,
    since = this.clock() - this.windowMs,
    channel,
    success,
  } = {}) {
    const start = this.normalizeTimestamp(since);

    let records = this.records.filter((record) => {
      if (record.timestamp < start) return false;
      if (channel != null && record.channel !== String(channel)) return false;
      if (success !== undefined && record.success !== Boolean(success)) {
        return false;
      }

      return true;
    });

    records = records
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, Number(limit) || 0));

    return records.map((record) => this.clone(record));
  }

  getHealth({
    since = this.clock() - this.windowMs,
    until = this.clock(),
    minimumAttempts = 10,
    healthySuccessRate = 0.98,
    degradedSuccessRate = 0.9,
  } = {}) {
    const summary = this.getSummary({ since, until });
    let status = "healthy";

    if (summary.totalAttempts < minimumAttempts) {
      status = "insufficient_data";
    } else if (summary.successRate < degradedSuccessRate) {
      status = "unhealthy";
    } else if (summary.successRate < healthySuccessRate) {
      status = "degraded";
    }

    return {
      status,
      successRate: summary.successRate,
      failureRate: summary.failureRate,
      totalAttempts: summary.totalAttempts,
      minimumAttempts,
      checkedAt: this.clock(),
    };
  }

  reset({ clearStates = true } = {}) {
    this.records = [];

    if (clearStates) {
      this.deliveryStates.clear();
    }
  }

  exportData() {
    return {
      version: 1,
      exportedAt: this.clock(),
      records: this.records.map((record) => this.clone(record)),
      deliveryStates: Array.from(this.deliveryStates.values()).map(
        (state) => this.clone(state)
      ),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.records)) {
      throw new TypeError("Invalid delivery metrics import data.");
    }

    if (replace) {
      this.records = [];
      this.deliveryStates.clear();
    }

    for (const record of data.records) {
      if (!record || record.deliveryId == null) continue;

      const normalized = {
        ...this.clone(record),
        deliveryId: String(record.deliveryId),
        channel: String(record.channel || "unknown"),
        timestamp: this.normalizeTimestamp(record.timestamp),
        success: Boolean(record.success),
      };

      this.records.push(normalized);
    }

    this.trimRecords();
    this.rebuildDeliveryStates();

    return this.records.length;
  }

  rebuildDeliveryStates() {
    const previousStates = this.deliveryStates;
    this.deliveryStates = new Map();

    for (const record of this.records) {
      const existing = this.deliveryStates.get(record.deliveryId);

      if (!existing) {
        this.deliveryStates.set(record.deliveryId, {
          deliveryId: record.deliveryId,
          alertId: record.alertId ?? null,
          channel: record.channel,
          attempts: 0,
          successes: 0,
          failures: 0,
          firstAttemptAt: record.timestamp,
          lastAttemptAt: record.timestamp,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastError: null,
          totalDurationMs: 0,
          measuredDurations: 0,
        });
      }

      const state = this.deliveryStates.get(record.deliveryId);

      state.attempts += 1;
      state.lastAttemptAt = Math.max(state.lastAttemptAt, record.timestamp);
      state.firstAttemptAt = Math.min(
        state.firstAttemptAt,
        record.timestamp
      );

      if (record.success) {
        state.successes += 1;
        state.lastSuccessAt = Math.max(
          state.lastSuccessAt || 0,
          record.timestamp
        );
      } else {
        state.failures += 1;
        state.lastFailureAt = Math.max(
          state.lastFailureAt || 0,
          record.timestamp
        );
        state.lastError = record.error || null;
      }

      if (record.durationMs != null) {
        state.totalDurationMs += record.durationMs;
        state.measuredDurations += 1;
      }
    }

    for (const [id, state] of previousStates) {
      if (!this.deliveryStates.has(id) && !this.records.length) {
        this.deliveryStates.set(id, state);
      }
    }
  }

  trimRecords() {
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
      this.rebuildDeliveryStates();
    }
  }

  normalizeTimestamp(value) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);

      if (Number.isFinite(parsed)) return parsed;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : this.clock();
  }

  normalizeDuration(value) {
    if (value == null) return null;

    const duration = Number(value);

    if (!Number.isFinite(duration) || duration < 0) {
      return null;
    }

    return duration;
  }

  normalizeError(error) {
    if (!error) return null;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    if (typeof error === "object") {
      return {
        name: String(error.name || "Error"),
        message: String(error.message || "Unknown error"),
      };
    }

    return {
      name: "Error",
      message: String(error),
    };
  }

  createId(deliveryId, timestamp) {
    return `${deliveryId}:${timestamp}:${this.records.length + 1}`;
  }

  rate(part, total) {
    return total > 0 ? part / total : 0;
  }

  average(values) {
    if (!values.length) return null;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  percentile(values, percentile) {
    if (!values.length) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
    const index = Math.max(0, Math.min(sorted.length - 1, rank));

    return sorted[index];
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Use JSON cloning for serializable records.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Delivery metrics manager has been disposed.");
    }
  }

  dispose() {
    this.records = [];
    this.deliveryStates.clear();
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertDeliveryMetrics;