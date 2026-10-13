const DEFAULT_OPTIONS = Object.freeze({
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30_000,
  halfOpenMaxCalls: 2,
  historyLimit: 200,
});

const STATES = Object.freeze({
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
});

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON cloning.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker {
  constructor(options = {}) {
    this.options = {
      failureThreshold: toPositiveInteger(
        options.failureThreshold,
        DEFAULT_OPTIONS.failureThreshold,
      ),
      successThreshold: toPositiveInteger(
        options.successThreshold,
        DEFAULT_OPTIONS.successThreshold,
      ),
      openDurationMs: toPositiveInteger(
        options.openDurationMs,
        DEFAULT_OPTIONS.openDurationMs,
      ),
      halfOpenMaxCalls: toPositiveInteger(
        options.halfOpenMaxCalls,
        DEFAULT_OPTIONS.halfOpenMaxCalls,
      ),
      historyLimit: toPositiveInteger(
        options.historyLimit,
        DEFAULT_OPTIONS.historyLimit,
      ),
    };

    this.channels = new Map();
    this.history = [];
    this.disposed = false;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Circuit breaker has been disposed.");
    }
  }

  normalizeChannel(channel) {
    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("A valid channel name is required.");
    }

    return channel.trim().toLowerCase();
  }

  createState(channel) {
    return {
      channel,
      state: STATES.CLOSED,
      failures: 0,
      successes: 0,
      halfOpenCalls: 0,
      openedAt: null,
      nextAttemptAt: null,
      lastFailureAt: null,
      lastSuccessAt: null,
      lastError: null,
      transitions: 0,
      updatedAt: Date.now(),
    };
  }

  getOrCreate(channel) {
    const key = this.normalizeChannel(channel);

    if (!this.channels.has(key)) {
      this.channels.set(key, this.createState(key));
    }

    return this.channels.get(key);
  }

  recordHistory(channel, from, to, reason, details = {}) {
    this.history.push({
      channel,
      from,
      to,
      reason,
      timestamp: Date.now(),
      details: clone(details),
    });

    if (this.history.length > this.options.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.options.historyLimit,
      );
    }
  }

  transition(entry, nextState, reason, details = {}) {
    if (entry.state === nextState) {
      entry.updatedAt = Date.now();
      return false;
    }

    const previousState = entry.state;

    entry.state = nextState;
    entry.transitions += 1;
    entry.updatedAt = Date.now();

    this.recordHistory(
      entry.channel,
      previousState,
      nextState,
      reason,
      details,
    );

    return true;
  }

  open(entry, reason, error = null) {
    const now = Date.now();

    entry.openedAt = now;
    entry.nextAttemptAt = now + this.options.openDurationMs;
    entry.halfOpenCalls = 0;
    entry.successes = 0;
    entry.lastError = error
      ? String(error.message || error).slice(0, 500)
      : null;

    this.transition(entry, STATES.OPEN, reason, {
      failures: entry.failures,
      nextAttemptAt: entry.nextAttemptAt,
      error: entry.lastError,
    });
  }

  refreshState(entry, now = Date.now()) {
    if (
      entry.state === STATES.OPEN &&
      entry.nextAttemptAt !== null &&
      now >= entry.nextAttemptAt
    ) {
      entry.halfOpenCalls = 0;
      entry.successes = 0;

      this.transition(
        entry,
        STATES.HALF_OPEN,
        "open_timeout_elapsed",
        { now },
      );
    }

    return entry;
  }

  canExecute(channel) {
    this.assertActive();

    const entry = this.refreshState(this.getOrCreate(channel));

    if (entry.state === STATES.CLOSED) {
      return true;
    }

    if (entry.state === STATES.OPEN) {
      return false;
    }

    return entry.halfOpenCalls < this.options.halfOpenMaxCalls;
  }

  acquire(channel) {
    this.assertActive();

    const entry = this.refreshState(this.getOrCreate(channel));

    if (entry.state === STATES.OPEN) {
      return {
        allowed: false,
        channel: entry.channel,
        state: entry.state,
        retryAt: entry.nextAttemptAt,
        reason: "circuit_open",
      };
    }

    if (
      entry.state === STATES.HALF_OPEN &&
      entry.halfOpenCalls >= this.options.halfOpenMaxCalls
    ) {
      return {
        allowed: false,
        channel: entry.channel,
        state: entry.state,
        retryAt: null,
        reason: "half_open_probe_limit_reached",
      };
    }

    if (entry.state === STATES.HALF_OPEN) {
      entry.halfOpenCalls += 1;
      entry.updatedAt = Date.now();
    }

    return {
      allowed: true,
      channel: entry.channel,
      state: entry.state,
      retryAt: null,
      probe: entry.state === STATES.HALF_OPEN,
    };
  }

  recordSuccess(channel) {
    this.assertActive();

    const entry = this.getOrCreate(channel);
    const wasHalfOpen = entry.state === STATES.HALF_OPEN;

    entry.lastSuccessAt = Date.now();
    entry.lastError = null;
    entry.failures = 0;
    entry.updatedAt = Date.now();

    if (wasHalfOpen) {
      entry.successes += 1;

      if (entry.successes >= this.options.successThreshold) {
        entry.nextAttemptAt = null;
        entry.openedAt = null;
        entry.halfOpenCalls = 0;
        entry.successes = 0;

        this.transition(
          entry,
          STATES.CLOSED,
          "half_open_success_threshold_reached",
        );
      }

      return this.getState(entry.channel);
    }

    if (entry.state === STATES.CLOSED) {
      entry.successes += 1;
    }

    return this.getState(entry.channel);
  }

  recordFailure(channel, error = null) {
    this.assertActive();

    const entry = this.getOrCreate(channel);
    const wasHalfOpen = entry.state === STATES.HALF_OPEN;

    entry.lastFailureAt = Date.now();
    entry.lastError = error
      ? String(error.message || error).slice(0, 500)
      : null;
    entry.failures += 1;
    entry.successes = 0;
    entry.updatedAt = Date.now();

    if (wasHalfOpen) {
      this.open(entry, "half_open_probe_failed", error);
    } else if (
      entry.state === STATES.CLOSED &&
      entry.failures >= this.options.failureThreshold
    ) {
      this.open(entry, "failure_threshold_reached", error);
    }

    return this.getState(entry.channel);
  }

  async execute(channel, operation, ...args) {
    this.assertActive();

    if (typeof operation !== "function") {
      throw new TypeError("Circuit breaker operation must be a function.");
    }

    const permit = this.acquire(channel);

    if (!permit.allowed) {
      const error = new Error(
        `Circuit is ${permit.state} for channel "${permit.channel}".`,
      );

      error.name = "CircuitBreakerOpenError";
      error.code = "CIRCUIT_BREAKER_OPEN";
      error.channel = permit.channel;
      error.retryAt = permit.retryAt;
      error.circuitState = permit.state;

      throw error;
    }

    try {
      const result = await operation(...args);
      this.recordSuccess(permit.channel);
      return result;
    } catch (error) {
      this.recordFailure(permit.channel, error);
      throw error;
    }
  }

  reset(channel, reason = "manual_reset") {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const entry = this.getOrCreate(key);

    entry.failures = 0;
    entry.successes = 0;
    entry.halfOpenCalls = 0;
    entry.openedAt = null;
    entry.nextAttemptAt = null;
    entry.lastError = null;
    entry.updatedAt = Date.now();

    this.transition(entry, STATES.CLOSED, reason);

    return this.getState(key);
  }

  resetAll(reason = "manual_reset_all") {
    this.assertActive();

    for (const channel of this.channels.keys()) {
      this.reset(channel, reason);
    }

    return this.getAllStates();
  }

  getState(channel) {
    this.assertActive();

    const entry = this.refreshState(this.getOrCreate(channel));

    return {
      ...entry,
      isOpen: entry.state === STATES.OPEN,
      isHalfOpen: entry.state === STATES.HALF_OPEN,
      isClosed: entry.state === STATES.CLOSED,
      canExecute:
        entry.state === STATES.CLOSED ||
        (entry.state === STATES.HALF_OPEN &&
          entry.halfOpenCalls < this.options.halfOpenMaxCalls),
      remainingOpenMs:
        entry.state === STATES.OPEN && entry.nextAttemptAt !== null
          ? Math.max(0, entry.nextAttemptAt - Date.now())
          : 0,
    };
  }

  getAllStates() {
    this.assertActive();

    return Array.from(this.channels.keys(), (channel) =>
      this.getState(channel),
    );
  }

  getHistory({ channel, limit = 50 } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.min(Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 50, this.options.historyLimit),
    );

    let entries = this.history;

    if (channel) {
      const key = this.normalizeChannel(channel);
      entries = entries.filter((item) => item.channel === key);
    }

    if (safeLimit === 0) {
      return [];
    }

    return entries.slice(-safeLimit).reverse().map((item) => clone(item));
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      exportedAt: Date.now(),
      options: { ...this.options },
      channels: Array.from(this.channels.values(), (entry) => ({
        ...entry,
      })),
      history: this.history.map((item) => clone(item)),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || typeof data !== "object" || !Array.isArray(data.channels)) {
      throw new TypeError("Invalid circuit breaker import data.");
    }

    if (replace) {
      this.channels.clear();
      this.history = [];
    }

    for (const source of data.channels) {
      if (
        !source ||
        typeof source.channel !== "string" ||
        !Object.values(STATES).includes(source.state)
      ) {
        continue;
      }

      const channel = this.normalizeChannel(source.channel);
      const entry = {
        ...this.createState(channel),
        ...source,
        channel,
        updatedAt: Number(source.updatedAt) || Date.now(),
      };

      entry.failures = Math.max(0, Number(entry.failures) || 0);
      entry.successes = Math.max(0, Number(entry.successes) || 0);
      entry.halfOpenCalls = Math.max(0, Number(entry.halfOpenCalls) || 0);

      this.channels.set(channel, entry);
    }

    if (Array.isArray(data.history)) {
      const validHistory = data.history
        .filter(
          (item) =>
            item &&
            typeof item.channel === "string" &&
            typeof item.reason === "string",
        )
        .map((item) => clone(item));

      this.history.push(...validHistory);

      if (this.history.length > this.options.historyLimit) {
        this.history = this.history.slice(-this.options.historyLimit);
      }
    }

    return this.getAllStates();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.channels.clear();
    this.history = [];
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS, STATES };