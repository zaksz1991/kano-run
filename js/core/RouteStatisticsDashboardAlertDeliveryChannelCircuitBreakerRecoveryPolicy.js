import { STATES } from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker.js";

const DEFAULT_OPTIONS = Object.freeze({
  failureThreshold: 5,
  successThreshold: 2,
  recoveryIntervalMs: 5000,
  cooldownMs: 30000,
  maxRecoveryAttempts: 5,
  halfOpenMaxCalls: 2,
  allowManualRecovery: true,
  allowAutomaticRecovery: true,
});

const ACTIONS = Object.freeze({
  ALLOW: "allow",
  WAIT: "wait",
  BLOCK: "block",
  RECOVER: "recover",
  RESET: "reset",
});

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryPolicy {
  constructor(options = {}) {
    this.options = {
      failureThreshold: this.toPositiveInteger(
        options.failureThreshold,
        DEFAULT_OPTIONS.failureThreshold,
      ),
      successThreshold: this.toPositiveInteger(
        options.successThreshold,
        DEFAULT_OPTIONS.successThreshold,
      ),
      recoveryIntervalMs: this.toPositiveInteger(
        options.recoveryIntervalMs,
        DEFAULT_OPTIONS.recoveryIntervalMs,
      ),
      cooldownMs: this.toPositiveInteger(
        options.cooldownMs,
        DEFAULT_OPTIONS.cooldownMs,
      ),
      maxRecoveryAttempts: this.toPositiveInteger(
        options.maxRecoveryAttempts,
        DEFAULT_OPTIONS.maxRecoveryAttempts,
      ),
      halfOpenMaxCalls: this.toPositiveInteger(
        options.halfOpenMaxCalls,
        DEFAULT_OPTIONS.halfOpenMaxCalls,
      ),
      allowManualRecovery: options.allowManualRecovery !== false,
      allowAutomaticRecovery: options.allowAutomaticRecovery !== false,
    };

    this.channelPolicies = new Map();
    this.channelHistory = new Map();
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
      throw new Error("Recovery policy has been disposed.");
    }
  }

  normalizeChannel(channel) {
    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("A valid channel name is required.");
    }

    return channel.trim().toLowerCase();
  }

  normalizeOptions(options = {}) {
    return {
      failureThreshold: this.toPositiveInteger(
        options.failureThreshold,
        this.options.failureThreshold,
      ),
      successThreshold: this.toPositiveInteger(
        options.successThreshold,
        this.options.successThreshold,
      ),
      recoveryIntervalMs: this.toPositiveInteger(
        options.recoveryIntervalMs,
        this.options.recoveryIntervalMs,
      ),
      cooldownMs: this.toPositiveInteger(
        options.cooldownMs,
        this.options.cooldownMs,
      ),
      maxRecoveryAttempts: this.toPositiveInteger(
        options.maxRecoveryAttempts,
        this.options.maxRecoveryAttempts,
      ),
      halfOpenMaxCalls: this.toPositiveInteger(
        options.halfOpenMaxCalls,
        this.options.halfOpenMaxCalls,
      ),
      allowManualRecovery:
        options.allowManualRecovery === undefined
          ? this.options.allowManualRecovery
          : options.allowManualRecovery === true,
      allowAutomaticRecovery:
        options.allowAutomaticRecovery === undefined
          ? this.options.allowAutomaticRecovery
          : options.allowAutomaticRecovery === true,
    };
  }

  record(action, channel, details = {}) {
    const entry = {
      action,
      channel: channel || null,
      timestamp: Date.now(),
      details: { ...details },
    };

    this.history.push(entry);

    if (this.history.length > 500) {
      this.history.splice(0, this.history.length - 500);
    }

    return entry;
  }

  setPolicy(channel, options = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const policy = this.normalizeOptions(options);

    this.channelPolicies.set(key, policy);

    this.record("policy_updated", key, {
      policy: { ...policy },
    });

    return this.getPolicy(key);
  }

  removePolicy(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const removed = this.channelPolicies.delete(key);

    if (removed) {
      this.record("policy_removed", key);
    }

    return removed;
  }

  getPolicy(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const policy = this.channelPolicies.get(key) || this.options;

    return {
      channel: key,
      ...policy,
    };
  }

  getOrCreateHistory(channel) {
    const key = this.normalizeChannel(channel);

    if (!this.channelHistory.has(key)) {
      this.channelHistory.set(key, {
        failures: 0,
        successes: 0,
        recoveryAttempts: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        lastRecoveryAt: null,
        cooldownUntil: null,
      });
    }

    return this.channelHistory.get(key);
  }

  evaluate(channel, circuitState, context = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const policy = this.getPolicy(key);
    const history = this.getOrCreateHistory(key);
    const now = Number(context.now) || Date.now();

    if (
      !circuitState ||
      !Object.values(STATES).includes(circuitState.state)
    ) {
      return this.decision(ACTIONS.BLOCK, key, "invalid_circuit_state", {
        policy,
      });
    }

    if (circuitState.state === STATES.CLOSED) {
      return this.decision(ACTIONS.ALLOW, key, "circuit_closed", {
        policy,
      });
    }

    if (circuitState.state === STATES.OPEN) {
      const retryAt = Number(circuitState.nextAttemptAt) || 0;

      if (retryAt > now) {
        return this.decision(ACTIONS.WAIT, key, "open_cooldown_active", {
          policy,
          retryAt,
          remainingMs: retryAt - now,
        });
      }

      if (!policy.allowAutomaticRecovery) {
        return this.decision(ACTIONS.BLOCK, key, "automatic_recovery_disabled", {
          policy,
        });
      }

      if (
        history.cooldownUntil !== null &&
        history.cooldownUntil > now
      ) {
        return this.decision(ACTIONS.WAIT, key, "recovery_cooldown_active", {
          policy,
          retryAt: history.cooldownUntil,
          remainingMs: history.cooldownUntil - now,
        });
      }

      if (history.recoveryAttempts >= policy.maxRecoveryAttempts) {
        return this.decision(ACTIONS.WAIT, key, "recovery_attempt_limit_reached", {
          policy,
          retryAt: history.cooldownUntil,
        });
      }

      return this.decision(ACTIONS.RECOVER, key, "open_timeout_elapsed", {
        policy,
        attempt: history.recoveryAttempts + 1,
      });
    }

    if (circuitState.state === STATES.HALF_OPEN) {
      const calls = Number(circuitState.halfOpenCalls) || 0;

      if (calls >= policy.halfOpenMaxCalls) {
        return this.decision(ACTIONS.WAIT, key, "half_open_probe_limit_reached", {
          policy,
        });
      }

      return this.decision(ACTIONS.ALLOW, key, "half_open_probe_allowed", {
        policy,
        probe: true,
      });
    }

    return this.decision(ACTIONS.BLOCK, key, "unhandled_circuit_state", {
      policy,
    });
  }

  decision(action, channel, reason, details = {}) {
    const result = {
      action,
      channel,
      reason,
      allowed: action === ACTIONS.ALLOW,
      timestamp: Date.now(),
      ...details,
    };

    this.record("decision", channel, {
      action,
      reason,
    });

    return result;
  }

  recordFailure(channel, error = null) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const history = this.getOrCreateHistory(key);
    const policy = this.getPolicy(key);

    history.failures += 1;
    history.successes = 0;
    history.lastFailureAt = Date.now();

    const shouldOpen = history.failures >= policy.failureThreshold;

    this.record("failure_recorded", key, {
      failures: history.failures,
      shouldOpen,
      error: error ? String(error.message || error).slice(0, 500) : null,
    });

    return {
      channel: key,
      failures: history.failures,
      threshold: policy.failureThreshold,
      shouldOpen,
    };
  }

  recordSuccess(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const history = this.getOrCreateHistory(key);
    const policy = this.getPolicy(key);

    history.successes += 1;
    history.failures = 0;
    history.lastSuccessAt = Date.now();

    const recovered = history.successes >= policy.successThreshold;

    if (recovered) {
      history.recoveryAttempts = 0;
      history.cooldownUntil = null;
    }

    this.record("success_recorded", key, {
      successes: history.successes,
      recovered,
    });

    return {
      channel: key,
      successes: history.successes,
      threshold: policy.successThreshold,
      recovered,
    };
  }

  recordRecoveryAttempt(channel, { success = false, error = null } = {}) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const history = this.getOrCreateHistory(key);
    const policy = this.getPolicy(key);

    history.lastRecoveryAt = Date.now();

    if (success) {
      history.successes += 1;
      history.failures = 0;

      if (history.successes >= policy.successThreshold) {
        history.recoveryAttempts = 0;
        history.cooldownUntil = null;
      }
    } else {
      history.recoveryAttempts += 1;
      history.successes = 0;
      history.failures += 1;

      if (history.recoveryAttempts >= policy.maxRecoveryAttempts) {
        history.cooldownUntil = Date.now() + policy.cooldownMs;
      }
    }

    this.record("recovery_attempt_recorded", key, {
      success,
      recoveryAttempts: history.recoveryAttempts,
      cooldownUntil: history.cooldownUntil,
      error: error ? String(error.message || error).slice(0, 500) : null,
    });

    return this.getChannelHistory(key);
  }

  requestManualRecovery(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);
    const policy = this.getPolicy(key);

    if (!policy.allowManualRecovery) {
      this.record("manual_recovery_denied", key, {
        reason: "manual_recovery_disabled",
      });

      return {
        allowed: false,
        channel: key,
        reason: "manual_recovery_disabled",
      };
    }

    const history = this.getOrCreateHistory(key);

    history.recoveryAttempts = 0;
    history.cooldownUntil = null;
    history.lastRecoveryAt = Date.now();

    this.record("manual_recovery_allowed", key);

    return {
      allowed: true,
      channel: key,
      reason: "manual_recovery_authorized",
      timestamp: Date.now(),
    };
  }

  getChannelHistory(channel) {
    this.assertActive();

    const key = this.normalizeChannel(channel);

    return {
      channel: key,
      ...this.getOrCreateHistory(key),
    };
  }

  getAllChannelHistory() {
    this.assertActive();

    return Array.from(this.channelHistory.keys(), (channel) =>
      this.getChannelHistory(channel),
    );
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

  exportData() {
    this.assertActive();

    return {
      version: 1,
      exportedAt: Date.now(),
      options: { ...this.options },
      policies: Array.from(this.channelPolicies.entries(), ([channel, policy]) => ({
        channel,
        policy: { ...policy },
      })),
      channelHistory: Array.from(
        this.channelHistory.entries(),
        ([channel, history]) => ({
          channel,
          history: { ...history },
        }),
      ),
      history: this.history.map((entry) => ({
        ...entry,
        details: { ...entry.details },
      })),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || typeof data !== "object") {
      throw new TypeError("Invalid recovery policy import data.");
    }

    if (replace) {
      this.channelPolicies.clear();
      this.channelHistory.clear();
      this.history = [];
    }

    if (Array.isArray(data.policies)) {
      for (const item of data.policies) {
        if (!item || typeof item.channel !== "string") {
          continue;
        }

        const channel = this.normalizeChannel(item.channel);
        this.channelPolicies.set(
          channel,
          this.normalizeOptions(item.policy || {}),
        );
      }
    }

    if (Array.isArray(data.channelHistory)) {
      for (const item of data.channelHistory) {
        if (!item || typeof item.channel !== "string") {
          continue;
        }

        const channel = this.normalizeChannel(item.channel);
        const source = item.history || {};

        this.channelHistory.set(channel, {
          failures: Math.max(0, Number(source.failures) || 0),
          successes: Math.max(0, Number(source.successes) || 0),
          recoveryAttempts: Math.max(
            0,
            Number(source.recoveryAttempts) || 0,
          ),
          lastFailureAt: source.lastFailureAt || null,
          lastSuccessAt: source.lastSuccessAt || null,
          lastRecoveryAt: source.lastRecoveryAt || null,
          cooldownUntil: source.cooldownUntil || null,
        });
      }
    }

    if (Array.isArray(data.history)) {
      this.history.push(
        ...data.history
          .filter((entry) => entry && typeof entry.action === "string")
          .map((entry) => ({
            action: entry.action,
            channel: entry.channel
              ? this.normalizeChannel(entry.channel)
              : null,
            timestamp: Number(entry.timestamp) || Date.now(),
            details:
              entry.details && typeof entry.details === "object"
                ? { ...entry.details }
                : {},
          })),
      );

      if (this.history.length > 500) {
        this.history = this.history.slice(-500);
      }
    }

    this.record("data_imported", null, {
      policies: this.channelPolicies.size,
      channels: this.channelHistory.size,
    });

    return {
      policies: this.channelPolicies.size,
      channels: this.channelHistory.size,
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.channelPolicies.clear();
    this.channelHistory.clear();
    this.history = [];
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS, ACTIONS };