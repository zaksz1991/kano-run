import { STATES } from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker.js";

const DEFAULT_OPTIONS = Object.freeze({
  recoveryIntervalMs: 5000,
  maxRecoveryAttempts: 5,
  successThreshold: 2,
  cooldownMs: 15000,
  historyLimit: 200,
});

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecovery {
  constructor(registry, options = {}) {
    if (!registry) {
      throw new TypeError("A circuit breaker registry is required.");
    }

    this.registry = registry;

    this.options = {
      recoveryIntervalMs: this.toPositiveInteger(
        options.recoveryIntervalMs,
        DEFAULT_OPTIONS.recoveryIntervalMs,
      ),
      maxRecoveryAttempts: this.toPositiveInteger(
        options.maxRecoveryAttempts,
        DEFAULT_OPTIONS.maxRecoveryAttempts,
      ),
      successThreshold: this.toPositiveInteger(
        options.successThreshold,
        DEFAULT_OPTIONS.successThreshold,
      ),
      cooldownMs: this.toPositiveInteger(
        options.cooldownMs,
        DEFAULT_OPTIONS.cooldownMs,
      ),
      historyLimit: this.toPositiveInteger(
        options.historyLimit,
        DEFAULT_OPTIONS.historyLimit,
      ),
    };

    this.channels = new Map();
    this.history = [];
    this.listeners = new Map();
    this.timer = null;
    this.running = false;
    this.disposed = false;
    this.processing = false;
    this.lastRunAt = null;
  }

  toPositiveInteger(value, fallback) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
      ? number
      : fallback;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Circuit breaker recovery has been disposed.");
    }
  }

  normalizeChannel(channel) {
    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("A valid channel name is required.");
    }

    return channel.trim().toLowerCase();
  }

  subscribe(event, listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    const key = String(event);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const listeners = this.listeners.get(key);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  on(event, listener) {
    return this.subscribe(event, listener);
  }

  emit(event, payload) {
    const listeners = [
      ...(this.listeners.get(event) || []),
      ...(this.listeners.get("*") || []),
    ];

    for (const listener of listeners) {
      try {
        listener(payload, event);
      } catch {
        // One listener must not interrupt recovery.
      }
    }
  }

  record(type, channel, details = {}) {
    const entry = {
      type,
      channel: channel || null,
      timestamp: Date.now(),
      details: { ...details },
    };

    this.history.push(entry);

    if (this.history.length > this.options.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.options.historyLimit,
      );
    }

    this.emit("history", { ...entry, details: { ...entry.details } });

    return entry;
  }

  getChannelRecord(channel) {
    const key = this.normalizeChannel(channel);

    if (!this.channels.has(key)) {
      this.channels.set(key, {
        channel: key,
        attempts: 0,
        consecutiveSuccesses: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        nextAttemptAt: 0,
        recovering: false,
        lastError: null,
      });
    }

    return this.channels.get(key);
  }

  register(channel, options = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const entry = this.getChannelRecord(key);

    if (Number.isFinite(options.nextAttemptAt)) {
      entry.nextAttemptAt = Math.max(0, options.nextAttemptAt);
    }

    if (Number.isInteger(options.attempts)) {
      entry.attempts = Math.max(0, options.attempts);
    }

    this.record("channel_registered", key);

    return this.getChannelState(key);
  }

  remove(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const removed = this.channels.delete(key);

    if (removed) {
      this.record("channel_removed", key);
    }

    return removed;
  }

  async recoverChannel(channel, recoveryCheck) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const entry = this.getChannelRecord(key);

    if (typeof recoveryCheck !== "function") {
      throw new TypeError("A recovery check function is required.");
    }

    if (entry.recovering) {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: "recovery_already_in_progress",
      };
    }

    const now = Date.now();

    if (now < entry.nextAttemptAt) {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: "cooldown_active",
        retryAt: entry.nextAttemptAt,
      };
    }

    const circuit = this.registry.get(key);

    if (!circuit) {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: "circuit_not_registered",
      };
    }

    const circuitState = circuit.getState(key);

    if (circuitState.state === STATES.CLOSED) {
      entry.attempts = 0;
      entry.consecutiveSuccesses = 0;
      entry.lastError = null;

      return {
        channel: key,
        recovered: true,
        skipped: true,
        reason: "circuit_already_closed",
      };
    }

    entry.recovering = true;
    entry.lastAttemptAt = now;

    this.record("recovery_started", key, {
      attempt: entry.attempts + 1,
      circuitState: circuitState.state,
    });

    this.emit("recovery_started", {
      channel: key,
      attempt: entry.attempts + 1,
      timestamp: now,
    });

    try {
      const result = await recoveryCheck({
        channel: key,
        circuitState,
        attempt: entry.attempts + 1,
      });

      if (result === false || result?.healthy === false) {
        throw new Error(
          result?.message || "Recovery health check failed.",
        );
      }

      entry.attempts += 1;
      entry.consecutiveSuccesses += 1;
      entry.lastSuccessAt = Date.now();
      entry.lastError = null;

      this.record("recovery_check_succeeded", key, {
        attempt: entry.attempts,
        consecutiveSuccesses: entry.consecutiveSuccesses,
      });

      if (
        entry.consecutiveSuccesses >= this.options.successThreshold
      ) {
        this.registry.reset(key, "recovery_health_checks_passed");

        entry.attempts = 0;
        entry.consecutiveSuccesses = 0;
        entry.nextAttemptAt = 0;

        this.record("recovery_completed", key);

        this.emit("recovered", {
          channel: key,
          timestamp: Date.now(),
        });

        return {
          channel: key,
          recovered: true,
          skipped: false,
          reason: "success_threshold_reached",
        };
      }

      entry.nextAttemptAt =
        Date.now() + this.options.recoveryIntervalMs;

      return {
        channel: key,
        recovered: false,
        skipped: false,
        reason: "awaiting_additional_successes",
        consecutiveSuccesses: entry.consecutiveSuccesses,
        requiredSuccesses: this.options.successThreshold,
        retryAt: entry.nextAttemptAt,
      };
    } catch (error) {
      entry.attempts += 1;
      entry.consecutiveSuccesses = 0;
      entry.lastFailureAt = Date.now();
      entry.lastError = String(error?.message || error).slice(0, 500);

      const exhausted =
        entry.attempts >= this.options.maxRecoveryAttempts;

      entry.nextAttemptAt = exhausted
        ? Date.now() + this.options.cooldownMs
        : Date.now() + this.options.recoveryIntervalMs;

      this.record("recovery_check_failed", key, {
        attempt: entry.attempts,
        exhausted,
        error: entry.lastError,
        nextAttemptAt: entry.nextAttemptAt,
      });

      this.emit("recovery_failed", {
        channel: key,
        attempt: entry.attempts,
        exhausted,
        error: entry.lastError,
        timestamp: Date.now(),
      });

      if (exhausted) {
        this.emit("recovery_exhausted", {
          channel: key,
          attempts: entry.attempts,
          retryAt: entry.nextAttemptAt,
          timestamp: Date.now(),
        });

        entry.attempts = 0;
      }

      return {
        channel: key,
        recovered: false,
        skipped: false,
        reason: exhausted
          ? "recovery_attempts_exhausted"
          : "recovery_check_failed",
        retryAt: entry.nextAttemptAt,
        error: entry.lastError,
      };
    } finally {
      entry.recovering = false;
    }
  }

  async recoverAll(recoveryCheck) {
    this.assertActive();

    if (typeof recoveryCheck !== "function") {
      throw new TypeError("A recovery check function is required.");
    }

    const states = this.registry.getAllStates();
    const results = [];

    for (const state of states) {
      if (
        state.state !== STATES.OPEN &&
        state.state !== STATES.HALF_OPEN
      ) {
        continue;
      }

      const result = await this.recoverChannel(
        state.channel,
        recoveryCheck,
      );

      results.push(result);
    }

    this.lastRunAt = Date.now();

    const summary = {
      timestamp: this.lastRunAt,
      checked: results.length,
      recovered: results.filter((item) => item.recovered).length,
      failed: results.filter(
        (item) =>
          !item.recovered &&
          !item.skipped &&
          item.reason !== "awaiting_additional_successes",
      ).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };

    this.record("recovery_cycle_completed", null, {
      checked: summary.checked,
      recovered: summary.recovered,
      failed: summary.failed,
      skipped: summary.skipped,
    });

    this.emit("cycle_completed", summary);

    return summary;
  }

  start(recoveryCheck, { immediate = true } = {}) {
    this.assertActive();

    if (typeof recoveryCheck !== "function") {
      throw new TypeError("A recovery check function is required.");
    }

    if (this.running) {
      return false;
    }

    this.running = true;

    this.recoveryCheck = recoveryCheck;

    this.timer = setInterval(() => {
      this.runCycle().catch((error) => {
        this.record("recovery_cycle_error", null, {
          error: String(error?.message || error),
        });
      });
    }, this.options.recoveryIntervalMs);

    if (immediate) {
      this.runCycle().catch((error) => {
        this.record("recovery_cycle_error", null, {
          error: String(error?.message || error),
        });
      });
    }

    this.emit("started", {
      timestamp: Date.now(),
      intervalMs: this.options.recoveryIntervalMs,
    });

    return true;
  }

  async runCycle() {
    this.assertActive();

    if (!this.running || this.processing) {
      return null;
    }

    this.processing = true;

    try {
      return await this.recoverAll(this.recoveryCheck);
    } finally {
      this.processing = false;
    }
  }

  stop() {
    this.assertActive();

    if (!this.running) {
      return false;
    }

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.recoveryCheck = null;

    this.emit("stopped", {
      timestamp: Date.now(),
    });

    return true;
  }

  getChannelState(channel) {
    this.assertActive();

    const entry = this.getChannelRecord(channel);

    return {
      ...entry,
      cooldownRemainingMs: Math.max(
        0,
        entry.nextAttemptAt - Date.now(),
      ),
    };
  }

  getAllStates() {
    this.assertActive();

    return Array.from(this.channels.keys(), (channel) =>
      this.getChannelState(channel),
    );
  }

  getHistory({ channel, type, limit = 100 } = {}) {
    this.assertActive();

    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));

    if (safeLimit === 0) {
      return [];
    }

    let entries = this.history;

    if (channel) {
      const key = this.normalizeChannel(channel);
      entries = entries.filter((entry) => entry.channel === key);
    }

    if (type) {
      entries = entries.filter((entry) => entry.type === type);
    }

    return entries.slice(-safeLimit).reverse().map((entry) => ({
      ...entry,
      details: { ...entry.details },
    }));
  }

  getSummary() {
    this.assertActive();

    const states = this.getAllStates();

    return {
      totalChannels: states.length,
      recovering: states.filter((item) => item.recovering).length,
      pendingCooldown: states.filter(
        (item) => item.cooldownRemainingMs > 0,
      ).length,
      running: this.running,
      processing: this.processing,
      lastRunAt: this.lastRunAt,
      channels: states,
      timestamp: Date.now(),
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.recoveryCheck = null;
    this.channels.clear();
    this.history = [];
    this.listeners.clear();
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS };