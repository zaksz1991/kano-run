import RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker, {
  DEFAULT_OPTIONS,
  STATES,
} from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker.js";

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRegistry {
  constructor(options = {}) {
    this.options = {
      defaultCircuitOptions: {
        ...DEFAULT_OPTIONS,
        ...(options.defaultCircuitOptions || {}),
      },
      maxChannels: this.toPositiveInteger(options.maxChannels, 100),
      historyLimit: this.toPositiveInteger(options.historyLimit, 500),
    };

    this.circuits = new Map();
    this.history = [];
    this.disposed = false;
  }

  toPositiveInteger(value, fallback) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
      ? number
      : fallback;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Circuit breaker registry has been disposed.");
    }
  }

  normalizeChannel(channel) {
    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("A valid channel name is required.");
    }

    return channel.trim().toLowerCase();
  }

  record(action, channel, details = {}) {
    this.history.push({
      action,
      channel,
      timestamp: Date.now(),
      details: { ...details },
    });

    if (this.history.length > this.options.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.options.historyLimit,
      );
    }
  }

  register(channel, options = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);

    if (this.circuits.has(key)) {
      return this.circuits.get(key);
    }

    if (this.circuits.size >= this.options.maxChannels) {
      throw new Error(
        `Circuit breaker registry limit reached (${this.options.maxChannels}).`,
      );
    }

    const circuit = new RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker({
      ...this.options.defaultCircuitOptions,
      ...options,
    });

    this.circuits.set(key, circuit);
    this.record("registered", key);

    return circuit;
  }

  get(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    return this.circuits.get(key) || null;
  }

  getOrRegister(channel, options = {}) {
    return this.get(channel) || this.register(channel, options);
  }

  has(channel) {
    this.assertActive();

    return this.circuits.has(this.normalizeChannel(channel));
  }

  unregister(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.circuits.get(key);

    if (!circuit) {
      return false;
    }

    circuit.dispose();
    this.circuits.delete(key);
    this.record("unregistered", key);

    return true;
  }

  canExecute(channel) {
    this.assertActive();

    const circuit = this.getOrRegister(channel);
    return circuit.canExecute(channel);
  }

  acquire(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.getOrRegister(key);
    const permit = circuit.acquire(key);

    this.record(
      permit.allowed ? "permit_granted" : "permit_rejected",
      key,
      {
        state: permit.state,
        reason: permit.reason || null,
        retryAt: permit.retryAt,
      },
    );

    return permit;
  }

  recordSuccess(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.getOrRegister(key);
    const state = circuit.recordSuccess(key);

    this.record("success", key, { state: state.state });

    return state;
  }

  recordFailure(channel, error = null) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.getOrRegister(key);
    const state = circuit.recordFailure(key, error);

    this.record("failure", key, {
      state: state.state,
      error: error ? String(error.message || error).slice(0, 500) : null,
    });

    return state;
  }

  async execute(channel, operation, ...args) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.getOrRegister(key);

    try {
      const result = await circuit.execute(key, operation, ...args);

      this.record("execution_succeeded", key);

      return result;
    } catch (error) {
      this.record("execution_failed", key, {
        code: error?.code || null,
        message: String(error?.message || error).slice(0, 500),
      });

      throw error;
    }
  }

  reset(channel, reason = "registry_reset") {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const circuit = this.get(key);

    if (!circuit) {
      return null;
    }

    const state = circuit.reset(key, reason);

    this.record("reset", key, { reason });

    return state;
  }

  resetAll(reason = "registry_reset_all") {
    this.assertActive();

    const results = [];

    for (const [channel, circuit] of this.circuits) {
      results.push(circuit.reset(channel, reason));
      this.record("reset", channel, { reason });
    }

    return results;
  }

  getState(channel) {
    this.assertActive();

    const circuit = this.get(channel);

    return circuit ? circuit.getState(channel) : null;
  }

  getAllStates() {
    this.assertActive();

    return Array.from(this.circuits.entries(), ([channel, circuit]) => ({
      channel,
      ...circuit.getState(channel),
    }));
  }

  getSummary() {
    this.assertActive();

    const states = this.getAllStates();

    return {
      total: states.length,
      closed: states.filter((item) => item.state === STATES.CLOSED).length,
      open: states.filter((item) => item.state === STATES.OPEN).length,
      halfOpen: states.filter((item) => item.state === STATES.HALF_OPEN).length,
      blocked: states.filter((item) => !item.canExecute).length,
      channels: states,
      timestamp: Date.now(),
    };
  }

  getHistory({ channel, limit = 100 } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    let entries = this.history;

    if (channel) {
      const key = this.normalizeChannel(channel);
      entries = entries.filter((entry) => entry.channel === key);
    }

    return entries.slice(-safeLimit).reverse().map((entry) => ({
      ...entry,
      details: { ...entry.details },
    }));
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      exportedAt: Date.now(),
      options: {
        ...this.options,
        defaultCircuitOptions: {
          ...this.options.defaultCircuitOptions,
        },
      },
      circuits: Array.from(this.circuits.entries(), ([channel, circuit]) => ({
        channel,
        data: circuit.exportData(),
      })),
      history: this.history.map((entry) => ({
        ...entry,
        details: { ...entry.details },
      })),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || typeof data !== "object" || !Array.isArray(data.circuits)) {
      throw new TypeError("Invalid circuit breaker registry import data.");
    }

    if (replace) {
      for (const circuit of this.circuits.values()) {
        circuit.dispose();
      }

      this.circuits.clear();
      this.history = [];
    }

    for (const item of data.circuits) {
      if (
        !item ||
        typeof item.channel !== "string" ||
        !item.data ||
        !Array.isArray(item.data.channels)
      ) {
        continue;
      }

      const key = this.normalizeChannel(item.channel);

      if (!this.circuits.has(key) && this.circuits.size >= this.options.maxChannels) {
        break;
      }

      const circuit = this.getOrRegister(key);
      circuit.importData(item.data, { replace: true });
    }

    if (Array.isArray(data.history)) {
      const validHistory = data.history
        .filter(
          (entry) =>
            entry &&
            typeof entry.action === "string" &&
            typeof entry.channel === "string",
        )
        .map((entry) => ({
          action: entry.action,
          channel: this.normalizeChannel(entry.channel),
          timestamp: Number(entry.timestamp) || Date.now(),
          details:
            entry.details && typeof entry.details === "object"
              ? { ...entry.details }
              : {},
        }));

      this.history.push(...validHistory);

      if (this.history.length > this.options.historyLimit) {
        this.history = this.history.slice(-this.options.historyLimit);
      }
    }

    this.record("imported", "*", {
      channels: this.circuits.size,
    });

    return this.getSummary();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    for (const circuit of this.circuits.values()) {
      circuit.dispose();
    }

    this.circuits.clear();
    this.history = [];
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS, STATES };