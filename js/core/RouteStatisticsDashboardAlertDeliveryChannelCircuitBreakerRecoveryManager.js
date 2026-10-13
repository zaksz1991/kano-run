import RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecovery from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecovery.js";
import RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryPolicy from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryPolicy.js";

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryManager {
  constructor(registry, options = {}) {
    if (!registry) {
      throw new TypeError("A circuit breaker registry is required.");
    }

    this.registry = registry;
    this.options = {
      recovery: { ...(options.recovery || {}) },
      policy: { ...(options.policy || {}) },
      historyLimit: this.toPositiveInteger(options.historyLimit, 300),
    };

    this.policy =
      options.policyManager ||
      new RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryPolicy(
        this.options.policy,
      );

    this.recovery =
      options.recoveryManager ||
      new RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecovery(
        registry,
        this.options.recovery,
      );

    this.history = [];
    this.listeners = new Map();
    this.running = false;
    this.disposed = false;
    this.activeChecks = new Map();
    this.lastCycleAt = null;
    this.lastCycleSummary = null;
  }

  toPositiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Circuit breaker recovery manager has been disposed.");
    }
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
        // Listener errors must not interrupt recovery operations.
      }
    }
  }

  record(action, channel = null, details = {}) {
    const entry = {
      action,
      channel,
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

    this.emit("history", {
      ...entry,
      details: { ...entry.details },
    });

    return entry;
  }

  normalizeChannel(channel) {
    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("A valid channel name is required.");
    }

    return channel.trim().toLowerCase();
  }

  registerChannel(channel, options = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);

    if (typeof this.registry.has === "function" && !this.registry.has(key)) {
      this.registry.register(key, options.circuit || {});
    }

    this.policy.setPolicy(key, options.policy || {});

    const result = {
      channel: key,
      circuit: this.registry.getState(key),
      policy: this.policy.getPolicy(key),
    };

    this.record("channel_registered", key);

    return result;
  }

  setPolicy(channel, options = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const result = this.policy.setPolicy(key, options);

    this.record("policy_updated", key);

    return result;
  }

  getChannelState(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);

    return {
      channel: key,
      circuit: this.registry.getState(key),
      policy: this.policy.getPolicy(key),
      recovery: this.recovery.getChannelState(key),
    };
  }

  getAllChannelStates() {
    this.assertActive();

    return this.registry.getAllStates().map((state) =>
      this.getChannelState(state.channel),
    );
  }

  async checkChannel(channel, healthCheck, options = {}) {
    this.assertActive();

    if (typeof healthCheck !== "function") {
      throw new TypeError("A channel health-check function is required.");
    }

    const key = this.normalizeChannel(channel);

    if (this.activeChecks.has(key)) {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: "health_check_already_running",
      };
    }

    const state = this.registry.getState(key);

    if (!state) {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: "circuit_not_registered",
      };
    }

    const decision = this.policy.evaluate(key, state, {
      now: options.now || Date.now(),
    });

    this.record("recovery_decision", key, {
      action: decision.action,
      reason: decision.reason,
    });

    if (decision.action === "allow") {
      return {
        channel: key,
        recovered: state.state === "closed",
        skipped: true,
        reason: decision.reason,
      };
    }

    if (decision.action === "wait" || decision.action === "block") {
      return {
        channel: key,
        recovered: false,
        skipped: true,
        reason: decision.reason,
        retryAt: decision.retryAt || null,
      };
    }

    const checkPromise = this.recovery.recoverChannel(
      key,
      async (context) => {
        const result = await healthCheck({
          ...context,
          channel: key,
          policy: this.policy.getPolicy(key),
        });

        if (result === false || result?.healthy === false) {
          throw new Error(
            result?.message || "Channel health check failed.",
          );
        }

        return result;
      },
    );

    this.activeChecks.set(key, checkPromise);

    try {
      const result = await checkPromise;

      this.policy.recordRecoveryAttempt(key, {
        success: result.recovered === true,
        error: result.error || null,
      });

      this.record(
        result.recovered ? "channel_recovered" : "recovery_attempt_finished",
        key,
        {
          reason: result.reason,
          skipped: result.skipped,
        },
      );

      this.emit("channel_recovery_result", result);

      return result;
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);

      this.policy.recordRecoveryAttempt(key, {
        success: false,
        error,
      });

      this.record("recovery_check_error", key, { error: message });

      const result = {
        channel: key,
        recovered: false,
        skipped: false,
        reason: "recovery_check_error",
        error: message,
      };

      this.emit("channel_recovery_result", result);

      return result;
    } finally {
      this.activeChecks.delete(key);
    }
  }

  async runCycle(healthCheck) {
    this.assertActive();

    if (typeof healthCheck !== "function") {
      throw new TypeError("A channel health-check function is required.");
    }

    if (this.running) {
      return {
        skipped: true,
        reason: "recovery_cycle_already_running",
        timestamp: Date.now(),
      };
    }

    this.running = true;

    try {
      const states = this.registry.getAllStates();
      const results = [];

      for (const state of states) {
        if (this.disposed) {
          break;
        }

        if (state.state === "closed") {
          continue;
        }

        const result = await this.checkChannel(
          state.channel,
          healthCheck,
        );

        results.push(result);
      }

      const summary = {
        timestamp: Date.now(),
        checked: results.length,
        recovered: results.filter((item) => item.recovered).length,
        failed: results.filter(
          (item) =>
            !item.recovered &&
            !item.skipped &&
            Boolean(item.error),
        ).length,
        skipped: results.filter((item) => item.skipped).length,
        results,
      };

      this.lastCycleAt = summary.timestamp;
      this.lastCycleSummary = summary;

      this.record("recovery_cycle_completed", null, {
        checked: summary.checked,
        recovered: summary.recovered,
        failed: summary.failed,
        skipped: summary.skipped,
      });

      this.emit("cycle_completed", summary);

      return summary;
    } finally {
      this.running = false;
    }
  }

  start(healthCheck, options = {}) {
    this.assertActive();

    if (typeof healthCheck !== "function") {
      throw new TypeError("A channel health-check function is required.");
    }

    if (this.recoveryLoop) {
      return false;
    }

    const intervalMs = this.toPositiveInteger(
      options.intervalMs,
      5000,
    );

    this.recoveryLoop = setInterval(() => {
      this.runCycle(healthCheck).catch((error) => {
        this.record("recovery_cycle_error", null, {
          error: String(error?.message || error),
        });
      });
    }, intervalMs);

    if (options.immediate !== false) {
      this.runCycle(healthCheck).catch((error) => {
        this.record("recovery_cycle_error", null, {
          error: String(error?.message || error),
        });
      });
    }

    this.record("manager_started", null, { intervalMs });

    this.emit("started", {
      timestamp: Date.now(),
      intervalMs,
    });

    return true;
  }

  stop() {
    this.assertActive();

    if (!this.recoveryLoop) {
      return false;
    }

    clearInterval(this.recoveryLoop);
    this.recoveryLoop = null;

    this.record("manager_stopped");

    this.emit("stopped", {
      timestamp: Date.now(),
    });

    return true;
  }

  requestManualRecovery(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const authorization = this.policy.requestManualRecovery(key);

    this.record(
      authorization.allowed
        ? "manual_recovery_authorized"
        : "manual_recovery_denied",
      key,
      { reason: authorization.reason },
    );

    return authorization;
  }

  getSummary() {
    this.assertActive();

    const states = this.getAllChannelStates();

    return {
      totalChannels: states.length,
      openChannels: states.filter(
        (item) => item.circuit?.state === "open",
      ).length,
      halfOpenChannels: states.filter(
        (item) => item.circuit?.state === "half_open",
      ).length,
      closedChannels: states.filter(
        (item) => item.circuit?.state === "closed",
      ).length,
      activeHealthChecks: this.activeChecks.size,
      running: this.running,
      lastCycleAt: this.lastCycleAt,
      lastCycleSummary: this.lastCycleSummary,
      timestamp: Date.now(),
    };
  }

  getHistory({ channel, action, limit = 100 } = {}) {
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

    if (action) {
      entries = entries.filter((entry) => entry.action === action);
    }

    return entries.slice(-safeLimit).reverse().map((entry) => ({
      ...entry,
      details: { ...entry.details },
    }));
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.recoveryLoop) {
      clearInterval(this.recoveryLoop);
      this.recoveryLoop = null;
    }

    this.running = false;

    this.listeners.clear();
    this.history = [];
    this.activeChecks.clear();

    if (typeof this.recovery.dispose === "function") {
      this.recovery.dispose();
    }

    if (typeof this.policy.dispose === "function") {
      this.policy.dispose();
    }

    this.disposed = true;
  }
}