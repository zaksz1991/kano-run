const DEFAULT_CONFIG = Object.freeze({
  maxRecoveryAttempts: 5,
  initialBackoffMs: 1_000,
  maxBackoffMs: 60_000,
  backoffMultiplier: 2,
  jitterRatio: 0.15,
  recoveryTimeoutMs: 30_000,
  cooldownMs: 10_000,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecovery {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    this.strategies = new Map();
    this.activeRecoveries = new Map();
    this.cooldowns = new Map();
    this.destroyed = false;

    this.handlers = {
      onStart: options.onStart ?? (() => {}),
      onSuccess: options.onSuccess ?? (() => {}),
      onFailure: options.onFailure ?? (() => {}),
      onRetry: options.onRetry ?? (() => {}),
      onStatus: options.onStatus ?? (() => {}),
    };

    this.stats = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      retries: 0,
      skippedCooldown: 0,
    };
  }

  registerStrategy(name, handler, options = {}) {
    this.#assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("A non-empty recovery strategy name is required.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Recovery strategy must be a function.");
    }

    if (this.strategies.has(name)) {
      throw new Error(`Recovery strategy "${name}" already exists.`);
    }

    this.strategies.set(name, {
      name,
      handler,
      maxAttempts: this.#positiveInteger(
        options.maxAttempts,
        this.config.maxRecoveryAttempts
      ),
      timeoutMs: this.#positiveNumber(
        options.timeoutMs,
        this.config.recoveryTimeoutMs
      ),
      cooldownMs: this.#positiveNumber(
        options.cooldownMs,
        this.config.cooldownMs
      ),
      metadata: options.metadata ?? {},
    });

    return this.getStrategy(name);
  }

  unregisterStrategy(name) {
    if (this.activeRecoveries.has(name)) {
      return false;
    }

    this.cooldowns.delete(name);
    return this.strategies.delete(name);
  }

  async recover(name, context = {}, options = {}) {
    this.#assertActive();

    const strategy = this.strategies.get(name);

    if (!strategy) {
      throw new Error(`Unknown recovery strategy "${name}".`);
    }

    if (this.activeRecoveries.has(name)) {
      return this.activeRecoveries.get(name);
    }

    const cooldownUntil = this.cooldowns.get(name) ?? 0;

    if (!options.ignoreCooldown && Date.now() < cooldownUntil) {
      this.stats.skippedCooldown += 1;

      return {
        name,
        status: "cooldown",
        recovered: false,
        retryAt: cooldownUntil,
      };
    }

    const operation = this.#executeRecovery(strategy, context);
    this.activeRecoveries.set(name, operation);

    try {
      return await operation;
    } finally {
      this.activeRecoveries.delete(name);
    }
  }

  async #executeRecovery(strategy, context) {
    const startedAt = Date.now();
    const controller = new AbortController();

    this.stats.totalRecoveries += 1;

    this.#emit("onStart", {
      name: strategy.name,
      startedAt,
      metadata: strategy.metadata,
    });

    let lastError = null;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt += 1) {
      if (this.destroyed) {
        return {
          name: strategy.name,
          status: "cancelled",
          recovered: false,
          attempts: attempt - 1,
        };
      }

      try {
        const result = await this.#runWithTimeout(
          strategy,
          {
            ...context,
            attempt,
            signal: controller.signal,
            metadata: strategy.metadata,
          },
          controller
        );

        this.stats.successfulRecoveries += 1;
        this.cooldowns.set(
          strategy.name,
          Date.now() + strategy.cooldownMs
        );

        const response = {
          name: strategy.name,
          status: "recovered",
          recovered: true,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          result,
        };

        this.#emit("onSuccess", response);
        this.#emitStatus();

        return response;
      } catch (error) {
        lastError = this.#serializeError(error);

        if (attempt >= strategy.maxAttempts) {
          break;
        }

        this.stats.retries += 1;

        const delayMs = this.#calculateBackoff(attempt);

        this.#emit("onRetry", {
          name: strategy.name,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error: lastError,
        });

        await this.#delay(delayMs);
      }
    }

    this.stats.failedRecoveries += 1;

    this.cooldowns.set(
      strategy.name,
      Date.now() + strategy.cooldownMs
    );

    const failure = {
      name: strategy.name,
      status: "failed",
      recovered: false,
      attempts: strategy.maxAttempts,
      durationMs: Date.now() - startedAt,
      error: lastError,
    };

    this.#emit("onFailure", failure);
    this.#emitStatus();

    return failure;
  }

  async #runWithTimeout(strategy, context, controller) {
    let timeout;

    try {
      return await Promise.race([
        Promise.resolve().then(() => strategy.handler(context)),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();

            const error = new Error(
              `Recovery strategy "${strategy.name}" timed out.`
            );

            error.name = "TimeoutError";
            reject(error);
          }, strategy.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async #delay(milliseconds) {
    const delayMs = Math.max(0, milliseconds);

    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  #calculateBackoff(attempt) {
    const base = Math.min(
      this.config.maxBackoffMs,
      this.config.initialBackoffMs *
        this.config.backoffMultiplier ** Math.max(0, attempt - 1)
    );

    const jitter = base * this.config.jitterRatio;

    return Math.max(
      0,
      Math.round(base + (Math.random() * 2 - 1) * jitter)
    );
  }

  async recoverAll(context = {}, options = {}) {
    this.#assertActive();

    const names = Array.from(this.strategies.keys());

    const results = await Promise.all(
      names.map((name) =>
        this.recover(name, context, options).catch((error) => ({
          name,
          status: "error",
          recovered: false,
          error: this.#serializeError(error),
        }))
      )
    );

    return {
      total: results.length,
      recovered: results.filter((item) => item.recovered).length,
      failed: results.filter(
        (item) => item.status === "failed" || item.status === "error"
      ).length,
      skipped: results.filter((item) => item.status === "cooldown").length,
      results,
    };
  }

  clearCooldown(name) {
    if (name) {
      return this.cooldowns.delete(name);
    }

    this.cooldowns.clear();
    return true;
  }

  getStrategy(name) {
    const strategy = this.strategies.get(name);

    if (!strategy) {
      return null;
    }

    return {
      name: strategy.name,
      maxAttempts: strategy.maxAttempts,
      timeoutMs: strategy.timeoutMs,
      cooldownMs: strategy.cooldownMs,
      metadata: strategy.metadata,
      active: this.activeRecoveries.has(name),
      cooldownUntil: this.cooldowns.get(name) ?? null,
    };
  }

  getStrategies() {
    return Array.from(this.strategies.keys()).map((name) =>
      this.getStrategy(name)
    );
  }

  getStats() {
    return {
      ...this.stats,
      registeredStrategies: this.strategies.size,
      activeRecoveries: this.activeRecoveries.size,
      activeCooldowns: Array.from(this.cooldowns.values()).filter(
        (time) => time > Date.now()
      ).length,
    };
  }

  #emit(event, payload) {
    try {
      this.handlers[event]?.(payload);
    } catch {
      // Observer errors must not interrupt recovery execution.
    }
  }

  #emitStatus() {
    this.#emit("onStatus", this.getStats());
  }

  #serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      timestamp: Date.now(),
    };
  }

  #positiveNumber(value, fallback) {
    return Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  #positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery manager has been destroyed.");
    }
  }

  destroy() {
    this.destroyed = true;
    this.strategies.clear();
    this.cooldowns.clear();
    this.activeRecoveries.clear();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecovery;