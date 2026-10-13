const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  maxConcurrentRecoveries: 3,
  recoveryTimeoutMs: 30_000,
  cooldownMs: 10_000,
  historyLimit: 200,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryManager {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    this.strategies = new Map();
    this.active = new Map();
    this.pending = [];
    this.history = [];
    this.cooldowns = new Map();

    this.sequence = 0;
    this.paused = false;
    this.destroyed = false;

    this.handlers = {
      onStart: options.onStart ?? (() => {}),
      onSuccess: options.onSuccess ?? (() => {}),
      onFailure: options.onFailure ?? (() => {}),
      onStatus: options.onStatus ?? (() => {}),
    };

    this.stats = {
      submitted: 0,
      started: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      rejected: 0,
    };
  }

  register(name, handler, options = {}) {
    this.#assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("A non-empty recovery name is required.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Recovery handler must be a function.");
    }

    if (this.strategies.has(name)) {
      throw new Error(`Recovery strategy "${name}" already exists.`);
    }

    this.strategies.set(name, {
      name,
      handler,
      priority: this.#priority(options.priority),
      timeoutMs: this.#positiveNumber(
        options.timeoutMs,
        this.config.recoveryTimeoutMs
      ),
      cooldownMs: this.#positiveNumber(
        options.cooldownMs,
        this.config.cooldownMs
      ),
      metadata: options.metadata ?? {},
      enabled: options.enabled ?? true,
    });

    this.#emitStatus();

    return this.getStrategy(name);
  }

  unregister(name) {
    if (this.active.has(name)) {
      return false;
    }

    if (this.pending.some((job) => job.name === name)) {
      return false;
    }

    this.cooldowns.delete(name);

    const removed = this.strategies.delete(name);
    this.#emitStatus();

    return removed;
  }

  submit(name, context = {}, options = {}) {
    this.#assertActive();

    const strategy = this.strategies.get(name);

    if (!strategy) {
      return Promise.reject(
        new Error(`Unknown recovery strategy "${name}".`)
      );
    }

    if (!this.config.enabled || !strategy.enabled) {
      return Promise.resolve({
        name,
        status: "disabled",
        recovered: false,
      });
    }

    if (this.active.has(name)) {
      return this.active.get(name).promise;
    }

    const cooldownUntil = this.cooldowns.get(name) ?? 0;

    if (!options.ignoreCooldown && Date.now() < cooldownUntil) {
      return Promise.resolve({
        name,
        status: "cooldown",
        recovered: false,
        retryAt: cooldownUntil,
      });
    }

    const job = {
      id: `recovery-${Date.now()}-${this.sequence}`,
      sequence: this.sequence++,
      name,
      strategy,
      context,
      priority: this.#priority(options.priority ?? strategy.priority),
      timeoutMs: this.#positiveNumber(
        options.timeoutMs,
        strategy.timeoutMs
      ),
      resolve: null,
      reject: null,
      promise: null,
      status: "queued",
      submittedAt: Date.now(),
      signal: options.signal ?? null,
    };

    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });

    this.pending.push(job);
    this.stats.submitted += 1;

    this.#sortPending();
    this.#emitStatus();
    this.#drain();

    return job.promise;
  }

  async #drain() {
    if (this.destroyed || this.paused || !this.config.enabled) {
      return;
    }

    while (
      this.pending.length > 0 &&
      this.active.size < this.config.maxConcurrentRecoveries &&
      !this.paused &&
      !this.destroyed
    ) {
      const job = this.pending.shift();

      if (!job || job.status !== "queued") {
        continue;
      }

      if (job.signal?.aborted) {
        this.#cancelJob(job, "Recovery request was aborted.");
        continue;
      }

      void this.#execute(job);
    }

    this.#emitStatus();
  }

  async #execute(job) {
    const { name, strategy } = job;
    const startedAt = Date.now();
    const controller = new AbortController();

    job.status = "running";
    job.startedAt = startedAt;

    const activeRecord = {
      job,
      controller,
      promise: job.promise,
      timeout: null,
      abortHandler: null,
    };

    this.active.set(name, activeRecord);
    this.stats.started += 1;

    if (job.signal) {
      activeRecord.abortHandler = () => {
        controller.abort(job.signal.reason);
      };

      job.signal.addEventListener(
        "abort",
        activeRecord.abortHandler,
        { once: true }
      );
    }

    this.#emit("onStart", this.#snapshot(job));

    let timedOut = false;

    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          strategy.handler({
            ...job.context,
            name,
            recoveryId: job.id,
            signal: controller.signal,
            metadata: strategy.metadata,
          })
        ),
        new Promise((_, reject) => {
          activeRecord.timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();

            const error = new Error(
              `Recovery "${name}" timed out after ${job.timeoutMs}ms.`
            );

            error.name = "TimeoutError";
            reject(error);
          }, job.timeoutMs);
        }),
      ]);

      if (controller.signal.aborted) {
        throw new Error(`Recovery "${name}" was aborted.`);
      }

      job.status = "succeeded";
      job.completedAt = Date.now();

      this.stats.succeeded += 1;

      this.cooldowns.set(
        name,
        Date.now() + strategy.cooldownMs
      );

      const outcome = {
        name,
        recoveryId: job.id,
        status: "succeeded",
        recovered: true,
        durationMs: Date.now() - startedAt,
        result,
      };

      this.#record(outcome);
      this.#emit("onSuccess", outcome);
      job.resolve(outcome);
    } catch (error) {
      job.status = "failed";
      job.completedAt = Date.now();

      this.stats.failed += 1;

      this.cooldowns.set(
        name,
        Date.now() + strategy.cooldownMs
      );

      const outcome = {
        name,
        recoveryId: job.id,
        status: "failed",
        recovered: false,
        timedOut,
        durationMs: Date.now() - startedAt,
        error: this.#serializeError(error),
      };

      this.#record(outcome);
      this.#emit("onFailure", outcome);
      job.resolve(outcome);
    } finally {
      clearTimeout(activeRecord.timeout);

      if (job.signal && activeRecord.abortHandler) {
        job.signal.removeEventListener(
          "abort",
          activeRecord.abortHandler
        );
      }

      this.active.delete(name);
      this.#emitStatus();
      this.#drain();
    }
  }

  cancel(name, reason = "Recovery cancelled.") {
    const activeRecord = this.active.get(name);

    if (activeRecord) {
      activeRecord.controller.abort(reason);
      return true;
    }

    const index = this.pending.findIndex(
      (job) => job.name === name
    );

    if (index < 0) {
      return false;
    }

    const [job] = this.pending.splice(index, 1);

    this.#cancelJob(job, reason);
    this.#emitStatus();

    return true;
  }

  #cancelJob(job, reason) {
    job.status = "cancelled";
    job.completedAt = Date.now();

    this.stats.cancelled += 1;

    const outcome = {
      name: job.name,
      recoveryId: job.id,
      status: "cancelled",
      recovered: false,
      error: {
        name: "AbortError",
        message: reason,
        timestamp: Date.now(),
      },
    };

    this.#record(outcome);
    job.resolve(outcome);
  }

  pause() {
    this.paused = true;
    this.#emitStatus();
  }

  resume() {
    this.#assertActive();

    this.paused = false;
    this.#drain();

    return this.getStatus();
  }

  enable() {
    this.#assertActive();

    this.config.enabled = true;
    this.#drain();

    return this.getStatus();
  }

  disable() {
    this.config.enabled = false;
    this.#emitStatus();

    return this.getStatus();
  }

  enableStrategy(name) {
    const strategy = this.strategies.get(name);

    if (!strategy) {
      return false;
    }

    strategy.enabled = true;
    this.#drain();
    this.#emitStatus();

    return true;
  }

  disableStrategy(name) {
    const strategy = this.strategies.get(name);

    if (!strategy) {
      return false;
    }

    strategy.enabled = false;
    this.#emitStatus();

    return true;
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
      priority: strategy.priority,
      timeoutMs: strategy.timeoutMs,
      cooldownMs: strategy.cooldownMs,
      enabled: strategy.enabled,
      metadata: strategy.metadata,
      running: this.active.has(name),
      cooldownUntil: this.cooldowns.get(name) ?? null,
    };
  }

  getStrategies() {
    return Array.from(this.strategies.keys()).map((name) =>
      this.getStrategy(name)
    );
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      paused: this.paused,
      destroyed: this.destroyed,
      registeredStrategies: this.strategies.size,
      queued: this.pending.length,
      active: this.active.size,
      ...this.stats,
    };
  }

  getHistory(options = {}) {
    let records = [...this.history];

    if (options.name) {
      records = records.filter(
        (record) => record.name === options.name
      );
    }

    if (options.status) {
      records = records.filter(
        (record) => record.status === options.status
      );
    }

    const limit = Number.isInteger(options.limit)
      ? Math.max(0, options.limit)
      : records.length;

    return records.slice(-limit);
  }

  #record(outcome) {
    this.history.push({
      ...outcome,
      timestamp: Date.now(),
    });

    if (this.history.length > this.config.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.config.historyLimit
      );
    }
  }

  #sortPending() {
    this.pending.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      return a.sequence - b.sequence;
    });
  }

  #priority(value) {
    return Number.isFinite(value)
      ? Math.max(0, Math.min(10, Math.floor(value)))
      : 0;
  }

  #positiveNumber(value, fallback) {
    return Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  #serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      timestamp: Date.now(),
    };
  }

  #snapshot(job) {
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      priority: job.priority,
      submittedAt: job.submittedAt,
      startedAt: job.startedAt ?? null,
      metadata: job.strategy.metadata,
    };
  }

  #emit(event, payload) {
    try {
      this.handlers[event]?.(payload);
    } catch {
      // Observers must not interrupt recovery processing.
    }
  }

  #emitStatus() {
    this.#emit("onStatus", this.getStatus());
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery manager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    for (const job of this.pending.splice(0)) {
      this.#cancelJob(job, "Recovery manager destroyed.");
    }

    for (const activeRecord of this.active.values()) {
      activeRecord.controller.abort("Recovery manager destroyed.");
    }

    this.destroyed = true;
    this.strategies.clear();
    this.cooldowns.clear();

    this.#emitStatus();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryManager;