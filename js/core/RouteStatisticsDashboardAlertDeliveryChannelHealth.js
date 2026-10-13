const DEFAULT_OPTIONS = Object.freeze({
  historyLimit: 200,
  minimumSamples: 5,
  degradedFailureRate: 0.1,
  unhealthyFailureRate: 0.35,
  degradedLatencyMs: 3000,
  unhealthyLatencyMs: 10000,
  staleAfterMs: 5 * 60 * 1000,
});

const HEALTH_STATES = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
  UNKNOWN: "unknown",
  DISABLED: "disabled",
});

function normalizeChannel(channel) {
  if (typeof channel !== "string" || !channel.trim()) {
    throw new TypeError("A channel name is required.");
  }

  return channel.trim().toLowerCase();
}

function toTimestamp(value) {
  if (value === null || value === undefined) return null;

  const timestamp =
    typeof value === "number" ? value : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class RouteStatisticsDashboardAlertDeliveryChannelHealth {
  constructor(options = {}) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });

    this.channels = new Map();
    this.disposed = false;

    this.validateOptions();
  }

  validateOptions() {
    const positiveIntegers = [
      "historyLimit",
      "minimumSamples",
      "staleAfterMs",
    ];

    for (const key of positiveIntegers) {
      if (
        !Number.isInteger(this.options[key]) ||
        this.options[key] < 1
      ) {
        throw new RangeError(`${key} must be a positive integer.`);
      }
    }

    for (const key of [
      "degradedFailureRate",
      "unhealthyFailureRate",
    ]) {
      if (
        !Number.isFinite(this.options[key]) ||
        this.options[key] < 0 ||
        this.options[key] > 1
      ) {
        throw new RangeError(`${key} must be between 0 and 1.`);
      }
    }

    if (
      this.options.unhealthyFailureRate <
      this.options.degradedFailureRate
    ) {
      throw new RangeError(
        "unhealthyFailureRate must be at least degradedFailureRate.",
      );
    }
  }

  registerChannel(channel, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const existing = this.channels.get(name);

    this.channels.set(name, {
      name,
      enabled: options.enabled !== false,
      createdAt: existing?.createdAt ?? Date.now(),
      lastAttemptAt: existing?.lastAttemptAt ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lastFailureAt: existing?.lastFailureAt ?? null,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      totalAttempts: existing?.totalAttempts ?? 0,
      totalSuccesses: existing?.totalSuccesses ?? 0,
      totalFailures: existing?.totalFailures ?? 0,
      latencies: existing?.latencies ?? [],
      history: existing?.history ?? [],
    });

    return this.getHealth(name);
  }

  unregisterChannel(channel) {
    this.assertActive();
    return this.channels.delete(normalizeChannel(channel));
  }

  setEnabled(channel, enabled) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name);

    if (!state) {
      this.registerChannel(name, { enabled });
    } else {
      state.enabled = Boolean(enabled);
    }

    return this.getHealth(name);
  }

  recordAttempt(channel, result = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name) || (
      this.registerChannel(name),
      this.channels.get(name)
    );

    const timestamp =
      toTimestamp(result.timestamp ?? result.deliveredAt) ?? Date.now();

    const success =
      result.success === true ||
      result.status === "delivered" ||
      result.status === "success";

    const latency = Number(result.latencyMs);

    state.totalAttempts += 1;
    state.lastAttemptAt = timestamp;

    if (success) {
      state.totalSuccesses += 1;
      state.lastSuccessAt = timestamp;
      state.consecutiveFailures = 0;
    } else {
      state.totalFailures += 1;
      state.lastFailureAt = timestamp;
      state.consecutiveFailures += 1;
    }

    if (Number.isFinite(latency) && latency >= 0) {
      state.latencies.push({
        timestamp,
        value: latency,
      });

      if (state.latencies.length > this.options.historyLimit) {
        state.latencies.splice(
          0,
          state.latencies.length - this.options.historyLimit,
        );
      }
    }

    state.history.push({
      timestamp,
      success,
      latencyMs:
        Number.isFinite(latency) && latency >= 0
          ? latency
          : null,
      error: success
        ? null
        : String(result.error || "Delivery failed").slice(0, 500),
    });

    if (state.history.length > this.options.historyLimit) {
      state.history.splice(
        0,
        state.history.length - this.options.historyLimit,
      );
    }

    return this.getHealth(name);
  }

  getHealth(channel) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name);

    if (!state) {
      return this.createUnknownResult(name, "Channel is not registered.");
    }

    if (!state.enabled) {
      return this.buildResult(state, HEALTH_STATES.DISABLED, [
        "Channel is disabled.",
      ]);
    }

    if (state.totalAttempts === 0) {
      return this.buildResult(state, HEALTH_STATES.UNKNOWN, [
        "No delivery attempts have been recorded.",
      ]);
    }

    const now = Date.now();
    const recent = state.history.filter(
      (item) => now - item.timestamp <= this.options.staleAfterMs,
    );

    const sample = recent.length > 0 ? recent : state.history;
    const failures = sample.filter((item) => !item.success).length;
    const failureRate = sample.length ? failures / sample.length : 0;

    const latencyValues = sample
      .map((item) => item.latencyMs)
      .filter((value) => Number.isFinite(value));

    const averageLatencyMs = latencyValues.length
      ? latencyValues.reduce((sum, value) => sum + value, 0) /
        latencyValues.length
      : null;

    const reasons = [];

    if (state.consecutiveFailures >= 3) {
      reasons.push(
        `${state.consecutiveFailures} consecutive delivery failures.`,
      );
    }

    if (sample.length >= this.options.minimumSamples) {
      if (failureRate >= this.options.unhealthyFailureRate) {
        reasons.push("Recent delivery failure rate is critically high.");
      } else if (failureRate >= this.options.degradedFailureRate) {
        reasons.push("Recent delivery failure rate is elevated.");
      }
    }

    if (
      averageLatencyMs !== null &&
      averageLatencyMs >= this.options.unhealthyLatencyMs
    ) {
      reasons.push("Average delivery latency is critically high.");
    } else if (
      averageLatencyMs !== null &&
      averageLatencyMs >= this.options.degradedLatencyMs
    ) {
      reasons.push("Average delivery latency is elevated.");
    }

    let status = HEALTH_STATES.HEALTHY;

    if (
      reasons.some((reason) =>
        /critically high|consecutive delivery failures/.test(reason),
      )
    ) {
      status = HEALTH_STATES.UNHEALTHY;
    } else if (reasons.length > 0) {
      status = HEALTH_STATES.DEGRADED;
    }

    if (
      state.lastAttemptAt !== null &&
      now - state.lastAttemptAt > this.options.staleAfterMs
    ) {
      reasons.push("No recent delivery activity.");
    }

    return this.buildResult(state, status, reasons, {
      sampleSize: sample.length,
      recentFailureRate: clamp(failureRate, 0, 1),
      averageLatencyMs,
      lastAttemptAgeMs:
        state.lastAttemptAt === null
          ? null
          : Math.max(0, now - state.lastAttemptAt),
    });
  }

  getAllHealth() {
    this.assertActive();

    return Array.from(this.channels.keys()).map((name) =>
      this.getHealth(name),
    );
  }

  getSummary() {
    this.assertActive();

    const channels = this.getAllHealth();
    const counts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
      disabled: 0,
    };

    for (const channel of channels) {
      counts[channel.status] += 1;
    }

    const totalAttempts = channels.reduce(
      (sum, channel) => sum + channel.totalAttempts,
      0,
    );

    const totalSuccesses = channels.reduce(
      (sum, channel) => sum + channel.totalSuccesses,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      channelCount: channels.length,
      counts,
      totalAttempts,
      totalSuccesses,
      totalFailures: totalAttempts - totalSuccesses,
      successRate:
        totalAttempts > 0 ? totalSuccesses / totalAttempts : null,
    };
  }

  getHistory(channel, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const state = this.channels.get(name);

    if (!state) return [];

    const limit = options.limit ?? 50;

    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("limit must be a non-negative integer.");
    }

    const history = [...state.history].reverse();

    return limit === 0 ? [] : history.slice(0, limit).map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp).toISOString(),
    }));
  }

  buildResult(state, status, reasons, extra = {}) {
    return Object.freeze({
      channel: state.name,
      status,
      healthy: status === HEALTH_STATES.HEALTHY,
      enabled: state.enabled,
      reasons: [...reasons],
      totalAttempts: state.totalAttempts,
      totalSuccesses: state.totalSuccesses,
      totalFailures: state.totalFailures,
      consecutiveFailures: state.consecutiveFailures,
      lastAttemptAt: state.lastAttemptAt === null
        ? null
        : new Date(state.lastAttemptAt).toISOString(),
      lastSuccessAt: state.lastSuccessAt === null
        ? null
        : new Date(state.lastSuccessAt).toISOString(),
      lastFailureAt: state.lastFailureAt === null
        ? null
        : new Date(state.lastFailureAt).toISOString(),
      ...extra,
    });
  }

  createUnknownResult(channel, reason) {
    return Object.freeze({
      channel,
      status: HEALTH_STATES.UNKNOWN,
      healthy: false,
      enabled: false,
      reasons: [reason],
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    });
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      channels: Array.from(this.channels.values()).map((state) => ({
        ...state,
        latencies: state.latencies.map((item) => ({ ...item })),
        history: state.history.map((item) => ({ ...item })),
      })),
    };
  }

  importData(data) {
    this.assertActive();

    if (!data || !Array.isArray(data.channels)) {
      throw new TypeError("Invalid channel health data.");
    }

    const imported = new Map();

    for (const item of data.channels) {
      const name = normalizeChannel(item.name);

      if (imported.has(name)) {
        throw new Error(`Duplicate channel health record "${name}".`);
      }

      const validHistory = Array.isArray(item.history)
        ? item.history
            .filter((record) =>
              record &&
              Number.isFinite(record.timestamp) &&
              typeof record.success === "boolean",
            )
            .slice(-this.options.historyLimit)
            .map((record) => ({
              timestamp: record.timestamp,
              success: record.success,
              latencyMs: Number.isFinite(record.latencyMs)
                ? record.latencyMs
                : null,
              error: record.error ? String(record.error).slice(0, 500) : null,
            }))
        : [];

      const validLatencies = Array.isArray(item.latencies)
        ? item.latencies
            .filter((record) =>
              record &&
              Number.isFinite(record.timestamp) &&
              Number.isFinite(record.value) &&
              record.value >= 0,
            )
            .slice(-this.options.historyLimit)
            .map((record) => ({
              timestamp: record.timestamp,
              value: record.value,
            }))
        : [];

      imported.set(name, {
        name,
        enabled: item.enabled !== false,
        createdAt: toTimestamp(item.createdAt) ?? Date.now(),
        lastAttemptAt: toTimestamp(item.lastAttemptAt),
        lastSuccessAt: toTimestamp(item.lastSuccessAt),
        lastFailureAt: toTimestamp(item.lastFailureAt),
        consecutiveFailures: Math.max(
          0,
          Math.floor(Number(item.consecutiveFailures) || 0),
        ),
        totalAttempts: Math.max(0, Math.floor(Number(item.totalAttempts) || 0)),
        totalSuccesses: Math.max(0, Math.floor(Number(item.totalSuccesses) || 0)),
        totalFailures: Math.max(0, Math.floor(Number(item.totalFailures) || 0)),
        latencies: validLatencies,
        history: validHistory,
      });
    }

    this.channels = imported;

    return this.getAllHealth();
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Channel health monitor has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.channels.clear();
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelHealth;