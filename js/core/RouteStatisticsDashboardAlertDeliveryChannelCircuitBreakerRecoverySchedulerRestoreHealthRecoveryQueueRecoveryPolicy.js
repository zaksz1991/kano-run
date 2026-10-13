const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitterRatio: 0.15,
  cooldownMs: 10_000,
  timeoutMs: 30_000,
  retryableErrors: [],
  nonRetryableErrors: ["AbortError", "ValidationError", "PermissionError"],
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryPolicy {
  constructor(options = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...options,
      retryableErrors: Array.isArray(options.retryableErrors)
        ? [...options.retryableErrors]
        : [...DEFAULT_POLICY.retryableErrors],
      nonRetryableErrors: Array.isArray(options.nonRetryableErrors)
        ? [...options.nonRetryableErrors]
        : [...DEFAULT_POLICY.nonRetryableErrors],
    };

    this.overrides = new Map();
    this.history = [];
    this.destroyed = false;
    this.historyLimit = Number.isInteger(options.historyLimit)
      ? Math.max(1, options.historyLimit)
      : 200;

    this.onDecision =
      typeof options.onDecision === "function"
        ? options.onDecision
        : () => {};
  }

  evaluate(input = {}) {
    this.#assertActive();

    const name = this.#normalizeName(input.name);
    const policy = this.#getEffectivePolicy(name);
    const attempt = this.#positiveInteger(input.attempt, 1);
    const error = input.error ?? null;
    const now = Date.now();

    let retry = policy.enabled && attempt < policy.maxAttempts;
    let reason = retry ? "retry_allowed" : "attempt_limit_or_disabled";

    if (!policy.enabled) {
      retry = false;
      reason = "policy_disabled";
    } else if (attempt >= policy.maxAttempts) {
      retry = false;
      reason = "max_attempts_reached";
    }

    if (error) {
      const errorName = error.name ?? "Error";

      if (policy.nonRetryableErrors.includes(errorName)) {
        retry = false;
        reason = "non_retryable_error";
      } else if (
        policy.retryableErrors.length > 0 &&
        !policy.retryableErrors.includes(errorName)
      ) {
        retry = false;
        reason = "error_not_allowlisted";
      }
    }

    const delayMs = retry
      ? this.#calculateDelay(policy, attempt)
      : 0;

    const decision = {
      name,
      retry,
      reason,
      attempt,
      maxAttempts: policy.maxAttempts,
      delayMs,
      cooldownMs: policy.cooldownMs,
      timeoutMs: policy.timeoutMs,
      timestamp: now,
      error: error
        ? {
            name: error.name ?? "Error",
            message: error.message ?? String(error),
          }
        : null,
    };

    this.#record(decision);

    try {
      this.onDecision(decision);
    } catch {
      // Decision observers cannot alter policy evaluation.
    }

    return decision;
  }

  shouldRetry(input = {}) {
    return this.evaluate(input).retry;
  }

  getDelay(input = {}) {
    return this.evaluate(input).delayMs;
  }

  setPolicy(name, overrides = {}) {
    this.#assertActive();

    const normalizedName = this.#normalizeName(name);

    if (!normalizedName) {
      throw new TypeError("A policy name is required.");
    }

    const current = this.overrides.get(normalizedName) ?? {};

    this.overrides.set(normalizedName, {
      ...current,
      ...this.#sanitizeOverrides(overrides),
    });

    return this.getPolicy(normalizedName);
  }

  removePolicy(name) {
    return this.overrides.delete(this.#normalizeName(name));
  }

  getPolicy(name = "") {
    this.#assertActive();

    return {
      ...this.#getEffectivePolicy(this.#normalizeName(name)),
    };
  }

  getAllPolicies() {
    this.#assertActive();

    return Array.from(this.overrides.keys()).map((name) => ({
      name,
      policy: this.getPolicy(name),
    }));
  }

  enable(name = null) {
    this.#assertActive();

    if (name === null) {
      this.policy.enabled = true;
      return true;
    }

    return this.setPolicy(name, { enabled: true });
  }

  disable(name = null) {
    this.#assertActive();

    if (name === null) {
      this.policy.enabled = false;
      return true;
    }

    return this.setPolicy(name, { enabled: false });
  }

  getHistory(options = {}) {
    this.#assertActive();

    let records = this.history;

    if (options.name) {
      const name = this.#normalizeName(options.name);
      records = records.filter((item) => item.name === name);
    }

    if (options.retry !== undefined) {
      records = records.filter(
        (item) => item.retry === Boolean(options.retry)
      );
    }

    const limit = Number.isInteger(options.limit)
      ? Math.max(0, options.limit)
      : records.length;

    return records.slice(-limit).map((item) => ({ ...item }));
  }

  getStats() {
    this.#assertActive();

    const retriesAllowed = this.history.filter(
      (item) => item.retry
    ).length;

    return {
      evaluations: this.history.length,
      retriesAllowed,
      retriesDenied: this.history.length - retriesAllowed,
      policies: this.overrides.size,
      enabled: this.policy.enabled,
    };
  }

  resetHistory() {
    this.#assertActive();
    this.history = [];
  }

  #getEffectivePolicy(name) {
    const override = name ? this.overrides.get(name) : null;

    return {
      ...this.policy,
      ...override,
      retryableErrors: [
        ...(override?.retryableErrors ?? this.policy.retryableErrors),
      ],
      nonRetryableErrors: [
        ...(override?.nonRetryableErrors ??
          this.policy.nonRetryableErrors),
      ],
    };
  }

  #sanitizeOverrides(overrides) {
    const sanitized = {};

    if (typeof overrides.enabled === "boolean") {
      sanitized.enabled = overrides.enabled;
    }

    for (const key of [
      "maxAttempts",
      "baseDelayMs",
      "maxDelayMs",
      "cooldownMs",
      "timeoutMs",
    ]) {
      if (Number.isFinite(overrides[key]) && overrides[key] > 0) {
        sanitized[key] = overrides[key];
      }
    }

    if (
      Number.isFinite(overrides.backoffMultiplier) &&
      overrides.backoffMultiplier >= 1
    ) {
      sanitized.backoffMultiplier = overrides.backoffMultiplier;
    }

    if (
      Number.isFinite(overrides.jitterRatio) &&
      overrides.jitterRatio >= 0 &&
      overrides.jitterRatio <= 1
    ) {
      sanitized.jitterRatio = overrides.jitterRatio;
    }

    for (const key of ["retryableErrors", "nonRetryableErrors"]) {
      if (
        Array.isArray(overrides[key]) &&
        overrides[key].every((value) => typeof value === "string")
      ) {
        sanitized[key] = [...overrides[key]];
      }
    }

    return sanitized;
  }

  #calculateDelay(policy, attempt) {
    const exponential = Math.min(
      policy.maxDelayMs,
      policy.baseDelayMs *
        policy.backoffMultiplier ** Math.max(0, attempt - 1)
    );

    const jitter = exponential * policy.jitterRatio;

    return Math.max(
      0,
      Math.round(
        exponential + (Math.random() * 2 - 1) * jitter
      )
    );
  }

  #record(decision) {
    this.history.push(decision);

    if (this.history.length > this.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.historyLimit
      );
    }
  }

  #normalizeName(name) {
    return typeof name === "string" ? name.trim() : "";
  }

  #positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery policy has been destroyed.");
    }
  }

  destroy() {
    this.destroyed = true;
    this.overrides.clear();
    this.history = [];
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryPolicy;