const DEFAULT_OPTIONS = Object.freeze({
  historyLimit: 1000,
  latencyBuckets: [100, 250, 500, 1000, 3000, 5000, 10000],
});

function normalizeChannel(channel) {
  if (typeof channel !== "string" || !channel.trim()) {
    throw new TypeError("A channel name is required.");
  }

  return channel.trim().toLowerCase();
}

function toTimestamp(value) {
  if (value === undefined || value === null) return Date.now();

  const timestamp =
    typeof value === "number" ? value : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Timestamp must be a valid date or number.");
  }

  return timestamp;
}

function percentile(values, fraction) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(fraction * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

export class RouteStatisticsDashboardAlertDeliveryChannelMetrics {
  constructor(options = {}) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
      latencyBuckets: [
        ...(options.latencyBuckets ?? DEFAULT_OPTIONS.latencyBuckets),
      ].sort((a, b) => a - b),
    });

    if (
      !Number.isInteger(this.options.historyLimit) ||
      this.options.historyLimit < 1
    ) {
      throw new RangeError("historyLimit must be a positive integer.");
    }

    if (
      this.options.latencyBuckets.some(
        (bucket) => !Number.isFinite(bucket) || bucket < 0,
      )
    ) {
      throw new RangeError("Latency buckets must be non-negative numbers.");
    }

    this.channels = new Map();
    this.disposed = false;
  }

  createChannelState(name) {
    return {
      name,
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      totalLatencyMs: 0,
      latencySamples: [],
      firstAttemptAt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      maximumConsecutiveFailures: 0,
      history: [],
      errorCounts: new Map(),
    };
  }

  getOrCreateChannel(channel) {
    const name = normalizeChannel(channel);

    if (!this.channels.has(name)) {
      this.channels.set(name, this.createChannelState(name));
    }

    return this.channels.get(name);
  }

  record(channel, event = {}) {
    this.assertActive();

    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new TypeError("Metric event must be an object.");
    }

    const state = this.getOrCreateChannel(channel);
    const timestamp = toTimestamp(event.timestamp);
    const success =
      event.success === true ||
      event.status === "delivered" ||
      event.status === "success";

    const latencyMs =
      event.latencyMs === undefined || event.latencyMs === null
        ? null
        : Number(event.latencyMs);

    if (
      latencyMs !== null &&
      (!Number.isFinite(latencyMs) || latencyMs < 0)
    ) {
      throw new RangeError("latencyMs must be a non-negative number.");
    }

    state.attempts += 1;
    state.firstAttemptAt ??= timestamp;
    state.lastAttemptAt = timestamp;

    if (event.retry === true || event.isRetry === true) {
      state.retries += 1;
    }

    if (success) {
      state.successes += 1;
      state.lastSuccessAt = timestamp;
      state.consecutiveFailures = 0;
    } else {
      state.failures += 1;
      state.lastFailureAt = timestamp;
      state.consecutiveFailures += 1;

      state.maximumConsecutiveFailures = Math.max(
        state.maximumConsecutiveFailures,
        state.consecutiveFailures,
      );

      const errorCode = String(
        event.errorCode || event.code || "UNKNOWN_ERROR",
      ).slice(0, 120);

      state.errorCounts.set(
        errorCode,
        (state.errorCounts.get(errorCode) || 0) + 1,
      );
    }

    if (latencyMs !== null) {
      state.totalLatencyMs += latencyMs;
      state.latencySamples.push(latencyMs);

      if (state.latencySamples.length > this.options.historyLimit) {
        const removed = state.latencySamples.shift();
        state.totalLatencyMs -= removed;
      }
    }

    state.history.push({
      timestamp,
      success,
      latencyMs,
      retry: event.retry === true || event.isRetry === true,
      errorCode: success
        ? null
        : String(event.errorCode || event.code || "UNKNOWN_ERROR").slice(
            0,
            120,
          ),
    });

    if (state.history.length > this.options.historyLimit) {
      state.history.shift();
    }

    return this.getChannelMetrics(channel);
  }

  recordSuccess(channel, details = {}) {
    return this.record(channel, {
      ...details,
      success: true,
    });
  }

  recordFailure(channel, details = {}) {
    return this.record(channel, {
      ...details,
      success: false,
    });
  }

  getChannelMetrics(channel, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name);

    if (!state) {
      return this.createEmptyMetrics(name);
    }

    const windowMs = options.windowMs;
    let history = state.history;

    if (windowMs !== undefined) {
      if (!Number.isFinite(windowMs) || windowMs < 0) {
        throw new RangeError("windowMs must be a non-negative number.");
      }

      const cutoff = Date.now() - windowMs;

      history = history.filter((event) => event.timestamp >= cutoff);
    }

    const attempts = history.length;
    const successes = history.filter((event) => event.success).length;
    const failures = attempts - successes;
    const latencies = history
      .map((event) => event.latencyMs)
      .filter((value) => Number.isFinite(value));

    const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
    const errorCounts = {};

    for (const event of history) {
      if (event.errorCode) {
        errorCounts[event.errorCode] =
          (errorCounts[event.errorCode] || 0) + 1;
      }
    }

    const retryCount = history.filter((event) => event.retry).length;

    return {
      channel: name,
      attempts,
      successes,
      failures,
      retries: retryCount,
      successRate: attempts ? successes / attempts : null,
      failureRate: attempts ? failures / attempts : null,
      averageLatencyMs: latencies.length
        ? totalLatency / latencies.length
        : null,
      medianLatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      minimumLatencyMs: latencies.length ? Math.min(...latencies) : null,
      maximumLatencyMs: latencies.length ? Math.max(...latencies) : null,
      latencyDistribution: this.getLatencyDistribution(latencies),
      errorCounts,
      lastAttemptAt: state.lastAttemptAt === null
        ? null
        : new Date(state.lastAttemptAt).toISOString(),
      lastSuccessAt: state.lastSuccessAt === null
        ? null
        : new Date(state.lastSuccessAt).toISOString(),
      lastFailureAt: state.lastFailureAt === null
        ? null
        : new Date(state.lastFailureAt).toISOString(),
      consecutiveFailures: state.consecutiveFailures,
      maximumConsecutiveFailures: state.maximumConsecutiveFailures,
      windowMs: windowMs ?? null,
    };
  }

  getLatencyDistribution(latencies) {
    const distribution = {};
    let lowerBound = 0;

    for (const upperBound of this.options.latencyBuckets) {
      const key = `${lowerBound}-${upperBound}ms`;

      distribution[key] = latencies.filter(
        (value) => value >= lowerBound && value < upperBound,
      ).length;

      lowerBound = upperBound;
    }

    distribution[`${lowerBound}ms+`] = latencies.filter(
      (value) => value >= lowerBound,
    ).length;

    return distribution;
  }

  getSummary(options = {}) {
    this.assertActive();

    const channels = Array.from(this.channels.keys()).map((channel) =>
      this.getChannelMetrics(channel, options),
    );

    const attempts = channels.reduce(
      (sum, metrics) => sum + metrics.attempts,
      0,
    );

    const successes = channels.reduce(
      (sum, metrics) => sum + metrics.successes,
      0,
    );

    const failures = channels.reduce(
      (sum, metrics) => sum + metrics.failures,
      0,
    );

    const retries = channels.reduce(
      (sum, metrics) => sum + metrics.retries,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      channelCount: channels.length,
      attempts,
      successes,
      failures,
      retries,
      successRate: attempts ? successes / attempts : null,
      failureRate: attempts ? failures / attempts : null,
      channels,
    };
  }

  getHistory(channel, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name);

    if (!state) return [];

    const limit = options.limit ?? 100;

    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("limit must be a non-negative integer.");
    }

    let history = [...state.history];

    if (options.since !== undefined) {
      const since = toTimestamp(options.since);
      history = history.filter((event) => event.timestamp >= since);
    }

    if (options.until !== undefined) {
      const until = toTimestamp(options.until);
      history = history.filter((event) => event.timestamp <= until);
    }

    history.reverse();

    return limit === 0
      ? []
      : history.slice(0, limit).map((event) => ({
          ...event,
          timestamp: new Date(event.timestamp).toISOString(),
        }));
  }

  createEmptyMetrics(channel) {
    return {
      channel,
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      successRate: null,
      failureRate: null,
      averageLatencyMs: null,
      medianLatencyMs: null,
      p95LatencyMs: null,
      minimumLatencyMs: null,
      maximumLatencyMs: null,
      latencyDistribution: this.getLatencyDistribution([]),
      errorCounts: {},
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      maximumConsecutiveFailures: 0,
      windowMs: null,
    };
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      channels: Array.from(this.channels.values()).map((state) => ({
        ...state,
        latencySamples: [...state.latencySamples],
        history: state.history.map((event) => ({ ...event })),
        errorCounts: Object.fromEntries(state.errorCounts),
      })),
    };
  }

  importData(data) {
    this.assertActive();

    if (!data || !Array.isArray(data.channels)) {
      throw new TypeError("Invalid channel metrics data.");
    }

    const imported = new Map();

    for (const item of data.channels) {
      const name = normalizeChannel(item.name);

      if (imported.has(name)) {
        throw new Error(`Duplicate metrics entry for "${name}".`);
      }

      const history = Array.isArray(item.history)
        ? item.history
            .filter(
              (event) =>
                event &&
                Number.isFinite(event.timestamp) &&
                typeof event.success === "boolean",
            )
            .slice(-this.options.historyLimit)
            .map((event) => ({
              timestamp: event.timestamp,
              success: event.success,
              latencyMs:
                Number.isFinite(event.latencyMs) && event.latencyMs >= 0
                  ? event.latencyMs
                  : null,
              retry: event.retry === true,
              errorCode: event.errorCode
                ? String(event.errorCode).slice(0, 120)
                : null,
            }))
        : [];

      const latencySamples = history
        .map((event) => event.latencyMs)
        .filter((value) => Number.isFinite(value));

      const errorCounts = new Map();

      for (const event of history) {
        if (!event.success && event.errorCode) {
          errorCounts.set(
            event.errorCode,
            (errorCounts.get(event.errorCode) || 0) + 1,
          );
        }
      }

      const successes = history.filter((event) => event.success).length;
      const failures = history.length - successes;

      imported.set(name, {
        ...this.createChannelState(name),
        attempts: history.length,
        successes,
        failures,
        retries: history.filter((event) => event.retry).length,
        totalLatencyMs: latencySamples.reduce(
          (sum, value) => sum + value,
          0,
        ),
        latencySamples,
        firstAttemptAt: history[0]?.timestamp ?? null,
        lastAttemptAt: history.at(-1)?.timestamp ?? null,
        lastSuccessAt:
          [...history].reverse().find((event) => event.success)?.timestamp ??
          null,
        lastFailureAt:
          [...history].reverse().find((event) => !event.success)?.timestamp ??
          null,
        consecutiveFailures: this.countTrailingFailures(history),
        maximumConsecutiveFailures: Number.isInteger(
          item.maximumConsecutiveFailures,
        )
          ? Math.max(0, item.maximumConsecutiveFailures)
          : this.calculateMaximumFailures(history),
        history,
        errorCounts,
      });
    }

    this.channels = imported;

    return this.getSummary();
  }

  countTrailingFailures(history) {
    let count = 0;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].success) break;
      count += 1;
    }

    return count;
  }

  calculateMaximumFailures(history) {
    let current = 0;
    let maximum = 0;

    for (const event of history) {
      current = event.success ? 0 : current + 1;
      maximum = Math.max(maximum, current);
    }

    return maximum;
  }

  reset(channel) {
    this.assertActive();

    if (channel === undefined) {
      this.channels.clear();
      return true;
    }

    return this.channels.delete(normalizeChannel(channel));
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Channel metrics collector has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.channels.clear();
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelMetrics;