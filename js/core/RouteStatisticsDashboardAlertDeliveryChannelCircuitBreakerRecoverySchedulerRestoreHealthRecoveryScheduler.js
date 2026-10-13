const DEFAULT_CONFIG = Object.freeze({
  intervalMs: 30_000,
  initialDelayMs: 5_000,
  maxAttempts: 5,
  backoffMultiplier: 2,
  maxBackoffMs: 300_000,
  jitterRatio: 0.15,
  taskTimeoutMs: 20_000,
  enabled: true,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryScheduler {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    this.tasks = new Map();
    this.timers = new Map();
    this.running = new Map();
    this.attempts = new Map();
    this.destroyed = false;

    this.onError =
      typeof options.onError === "function"
        ? options.onError
        : () => {};

    this.onRecovery =
      typeof options.onRecovery === "function"
        ? options.onRecovery
        : () => {};

    this.onStatus =
      typeof options.onStatus === "function"
        ? options.onStatus
        : () => {};
  }

  register(name, task, options = {}) {
    this.#assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("A non-empty task name is required.");
    }

    if (typeof task !== "function") {
      throw new TypeError("Recovery task must be a function.");
    }

    if (this.tasks.has(name)) {
      throw new Error(`Recovery task "${name}" is already registered.`);
    }

    const definition = {
      name,
      task,
      intervalMs: this.#positiveNumber(
        options.intervalMs,
        this.config.intervalMs
      ),
      initialDelayMs: this.#positiveNumber(
        options.initialDelayMs,
        this.config.initialDelayMs
      ),
      maxAttempts: this.#positiveInteger(
        options.maxAttempts,
        this.config.maxAttempts
      ),
      enabled: options.enabled ?? this.config.enabled,
      runImmediately: options.runImmediately ?? false,
      metadata: options.metadata ?? {},
      status: "registered",
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      nextRunAt: null,
      totalRuns: 0,
      totalFailures: 0,
    };

    this.tasks.set(name, definition);
    this.attempts.set(name, 0);

    this.#emitStatus(definition);

    if (definition.enabled) {
      if (definition.runImmediately) {
        void this.run(name);
      } else {
        this.#schedule(name, definition.initialDelayMs);
      }
    }

    return this.#publicState(definition);
  }

  async run(name, context = {}) {
    this.#assertActive();

    const definition = this.tasks.get(name);

    if (!definition) {
      throw new Error(`Unknown recovery task "${name}".`);
    }

    if (!definition.enabled) {
      return {
        name,
        status: "disabled",
        recovered: false,
      };
    }

    if (this.running.has(name)) {
      return this.running.get(name);
    }

    this.#clearTimer(name);

    const execution = this.#execute(definition, context);
    this.running.set(name, execution);

    try {
      return await execution;
    } finally {
      this.running.delete(name);

      if (!this.destroyed && definition.enabled) {
        const attempt = this.attempts.get(name) ?? 0;

        if (attempt === 0) {
          this.#schedule(name, definition.intervalMs);
        }
      }
    }
  }

  async #execute(definition, context) {
    const { name } = definition;

    definition.status = "running";
    definition.lastRunAt = Date.now();
    definition.totalRuns += 1;

    this.#emitStatus(definition);

    const controller = new AbortController();
    const timeoutMs = this.#positiveNumber(
      context.timeoutMs,
      this.config.taskTimeoutMs
    );

    let timeout;

    try {
      const taskContext = {
        ...context,
        signal: controller.signal,
        attempt: (this.attempts.get(name) ?? 0) + 1,
        metadata: definition.metadata,
      };

      const result = await Promise.race([
        Promise.resolve().then(() => definition.task(taskContext)),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();

            const error = new Error(
              `Recovery task "${name}" timed out after ${timeoutMs}ms.`
            );

            error.name = "TimeoutError";
            reject(error);
          }, timeoutMs);
        }),
      ]);

      this.attempts.set(name, 0);
      definition.status = "healthy";
      definition.lastSuccessAt = Date.now();
      definition.lastError = null;
      definition.nextRunAt = null;

      this.onRecovery({
        name,
        result,
        timestamp: definition.lastSuccessAt,
      });

      this.#emitStatus(definition);

      return {
        name,
        status: "healthy",
        recovered: true,
        result,
      };
    } catch (error) {
      const attempt = (this.attempts.get(name) ?? 0) + 1;

      this.attempts.set(name, attempt);
      definition.totalFailures += 1;
      definition.lastError = this.#serializeError(error);

      const exhausted = attempt >= definition.maxAttempts;

      definition.status = exhausted ? "exhausted" : "recovering";

      this.onError({
        name,
        attempt,
        exhausted,
        error: definition.lastError,
        timestamp: Date.now(),
      });

      this.#emitStatus(definition);

      if (!exhausted && definition.enabled && !this.destroyed) {
        this.#schedule(name, this.#backoff(attempt));
      }

      return {
        name,
        status: definition.status,
        recovered: false,
        attempt,
        error: definition.lastError,
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  retry(name) {
    this.#assertActive();

    const definition = this.tasks.get(name);

    if (!definition) {
      throw new Error(`Unknown recovery task "${name}".`);
    }

    this.#clearTimer(name);
    this.attempts.set(name, 0);
    definition.status = "registered";
    definition.lastError = null;
    definition.nextRunAt = null;

    this.#emitStatus(definition);

    return this.run(name, {
      retryRequested: true,
    });
  }

  pause(name) {
    const definition = this.tasks.get(name);

    if (!definition) {
      return false;
    }

    definition.enabled = false;
    definition.status = "paused";
    definition.nextRunAt = null;

    this.#clearTimer(name);
    this.#emitStatus(definition);

    return true;
  }

  resume(name, options = {}) {
    this.#assertActive();

    const definition = this.tasks.get(name);

    if (!definition) {
      throw new Error(`Unknown recovery task "${name}".`);
    }

    definition.enabled = true;

    if (options.resetAttempts !== false) {
      this.attempts.set(name, 0);
    }

    definition.status = "registered";
    definition.lastError = null;

    this.#emitStatus(definition);

    if (options.runImmediately) {
      return this.run(name, {
        resumed: true,
      });
    }

    this.#schedule(
      name,
      this.#positiveNumber(
        options.delayMs,
        definition.initialDelayMs
      )
    );

    return Promise.resolve(this.#publicState(definition));
  }

  unregister(name) {
    this.#clearTimer(name);

    const removed = this.tasks.delete(name);
    this.attempts.delete(name);

    return removed;
  }

  getStatus(name) {
    const definition = this.tasks.get(name);

    return definition ? this.#publicState(definition) : null;
  }

  getAllStatuses() {
    return Array.from(this.tasks.values()).map((definition) =>
      this.#publicState(definition)
    );
  }

  async runAll(context = {}) {
    this.#assertActive();

    const names = Array.from(this.tasks.keys());

    return Promise.all(
      names.map((name) =>
        this.run(name, context).catch((error) => ({
          name,
          status: "error",
          recovered: false,
          error: this.#serializeError(error),
        }))
      )
    );
  }

  start() {
    this.#assertActive();

    for (const definition of this.tasks.values()) {
      if (
        definition.enabled &&
        !this.timers.has(definition.name) &&
        !this.running.has(definition.name)
      ) {
        this.#schedule(
          definition.name,
          definition.initialDelayMs
        );
      }
    }

    return this.getAllStatuses();
  }

  stop() {
    for (const name of this.timers.keys()) {
      this.#clearTimer(name);
    }

    for (const definition of this.tasks.values()) {
      definition.nextRunAt = null;

      if (definition.enabled) {
        definition.status = "stopped";
        this.#emitStatus(definition);
      }
    }
  }

  destroy() {
    this.stop();
    this.destroyed = true;
    this.tasks.clear();
    this.attempts.clear();
    this.running.clear();
  }

  #schedule(name, delayMs) {
    if (this.destroyed || this.timers.has(name)) {
      return;
    }

    const definition = this.tasks.get(name);

    if (!definition || !definition.enabled) {
      return;
    }

    const delay = Math.max(0, delayMs);

    definition.nextRunAt = Date.now() + delay;

    const timer = setTimeout(async () => {
      this.timers.delete(name);
      definition.nextRunAt = null;

      if (this.destroyed || !definition.enabled) {
        return;
      }

      await this.run(name);
    }, delay);

    this.timers.set(name, timer);
    this.#emitStatus(definition);
  }

  #clearTimer(name) {
    const timer = this.timers.get(name);

    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  #backoff(attempt) {
    const exponential = Math.min(
      this.config.maxBackoffMs,
      this.config.intervalMs *
        this.config.backoffMultiplier ** Math.max(0, attempt - 1)
    );

    const jitter = exponential * this.config.jitterRatio;
    const randomized = exponential + (Math.random() * 2 - 1) * jitter;

    return Math.max(0, Math.round(randomized));
  }

  #publicState(definition) {
    return {
      name: definition.name,
      status: definition.status,
      enabled: definition.enabled,
      lastRunAt: definition.lastRunAt,
      lastSuccessAt: definition.lastSuccessAt,
      lastError: definition.lastError,
      nextRunAt: definition.nextRunAt,
      totalRuns: definition.totalRuns,
      totalFailures: definition.totalFailures,
      attempts: this.attempts.get(definition.name) ?? 0,
      metadata: definition.metadata,
    };
  }

  #emitStatus(definition) {
    try {
      this.onStatus(this.#publicState(definition));
    } catch {
      // Status observers must not interrupt recovery scheduling.
    }
  }

  #serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      timestamp: Date.now(),
    };
  }

  #positiveNumber(value, fallback) {
    return Number.isFinite(value) && value >= 0
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
      throw new Error("Recovery scheduler has been destroyed.");
    }
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryScheduler;