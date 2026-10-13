const DEFAULT_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterRatio: 0.2,
};

export class RouteStatisticsDashboardAlertDeliveryRetry {
  constructor({
    config = {},
    clock = () => Date.now(),
    random = Math.random,
    logger = console,
  } = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.clock = clock;
    this.random = random;
    this.logger = logger;
    this.jobs = new Map();
    this.timers = new Map();
    this.disposed = false;
  }

  schedule(delivery, handler, overrides = {}) {
    this.assertActive();

    if (!delivery || delivery.id == null) {
      throw new TypeError("A delivery with an id is required.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("A retry handler function is required.");
    }

    const id = String(delivery.id);
    const existing = this.jobs.get(id);

    if (existing?.status === "scheduled" || existing?.status === "running") {
      return this.getJob(id);
    }

    const settings = this.resolveSettings(overrides);
    const attempts = Math.max(0, Number(delivery.attempts) || 0);

    if (attempts >= settings.maxAttempts) {
      const exhausted = {
        id,
        delivery: this.clone(delivery),
        attempts,
        maxAttempts: settings.maxAttempts,
        status: "exhausted",
        createdAt: this.clock(),
        updatedAt: this.clock(),
        nextAttemptAt: null,
        lastError: delivery.lastError || null,
      };

      this.jobs.set(id, exhausted);
      return this.clone(exhausted);
    }

    const delayMs = this.calculateDelay(attempts, settings);
    const now = this.clock();

    const job = {
      id,
      delivery: this.clone(delivery),
      handler,
      attempts,
      maxAttempts: settings.maxAttempts,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: now + delayMs,
      lastError: delivery.lastError || null,
      settings,
    };

    this.jobs.set(id, job);
    this.armTimer(id, delayMs);

    this.emit("scheduled", this.publicJob(job));

    return this.publicJob(job);
  }

  async execute(id) {
    this.assertActive();

    const key = String(id);
    const job = this.jobs.get(key);

    if (!job || job.status !== "scheduled") {
      return this.getJob(key);
    }

    this.clearTimer(key);

    if (job.attempts >= job.maxAttempts) {
      job.status = "exhausted";
      job.updatedAt = this.clock();
      job.nextAttemptAt = null;
      this.emit("exhausted", this.publicJob(job));
      return this.publicJob(job);
    }

    job.status = "running";
    job.updatedAt = this.clock();
    job.nextAttemptAt = null;

    this.emit("attempt", {
      ...this.publicJob(job),
      attemptNumber: job.attempts + 1,
    });

    try {
      const result = await job.handler(
        this.clone(job.delivery),
        job.attempts + 1
      );

      if (this.disposed) return this.publicJob(job);

      job.attempts += 1;
      job.updatedAt = this.clock();
      job.lastError = null;

      if (result === false || result?.success === false) {
        const error = new Error(
          result?.error || "Delivery handler reported failure."
        );

        return this.handleFailure(job, error);
      }

      job.status = "succeeded";
      job.result = this.cloneSafe(result);
      job.nextAttemptAt = null;

      this.emit("succeeded", this.publicJob(job));

      return this.publicJob(job);
    } catch (error) {
      if (this.disposed) return this.publicJob(job);

      job.attempts += 1;
      job.updatedAt = this.clock();

      return this.handleFailure(job, error);
    }
  }

  handleFailure(job, error) {
    job.lastError = this.normalizeError(error);
    job.updatedAt = this.clock();

    if (job.attempts >= job.maxAttempts) {
      job.status = "exhausted";
      job.nextAttemptAt = null;

      this.emit("exhausted", this.publicJob(job));
      return this.publicJob(job);
    }

    const delayMs = this.calculateDelay(job.attempts, job.settings);

    job.status = "scheduled";
    job.nextAttemptAt = this.clock() + delayMs;

    this.armTimer(job.id, delayMs);
    this.emit("retry", this.publicJob(job));

    return this.publicJob(job);
  }

  calculateDelay(attempts, settings = this.config) {
    const exponent = Math.max(0, Number(attempts) || 0);

    const base = Math.min(
      settings.maxDelayMs,
      settings.baseDelayMs *
        Math.pow(settings.backoffMultiplier, exponent)
    );

    const jitterRatio = Math.max(
      0,
      Math.min(1, Number(settings.jitterRatio) || 0)
    );

    const jitter = base * jitterRatio * this.random();

    return Math.max(
      0,
      Math.min(settings.maxDelayMs, Math.round(base - jitter + jitter * 2))
    );
  }

  resolveSettings(overrides = {}) {
    const settings = {
      ...this.config,
      ...overrides,
    };

    settings.maxAttempts = Math.max(
      1,
      Math.floor(Number(settings.maxAttempts) || DEFAULT_CONFIG.maxAttempts)
    );

    settings.baseDelayMs = Math.max(
      0,
      Number(settings.baseDelayMs) || 0
    );

    settings.maxDelayMs = Math.max(
      settings.baseDelayMs,
      Number(settings.maxDelayMs) || DEFAULT_CONFIG.maxDelayMs
    );

    settings.backoffMultiplier = Math.max(
      1,
      Number(settings.backoffMultiplier) ||
        DEFAULT_CONFIG.backoffMultiplier
    );

    settings.jitterRatio = Math.max(
      0,
      Math.min(1, Number(settings.jitterRatio) || 0)
    );

    return settings;
  }

  armTimer(id, delayMs) {
    this.clearTimer(id);

    const timer = setTimeout(() => {
      this.timers.delete(id);

      if (this.disposed) return;

      this.execute(id).catch((error) => {
        this.warn("Delivery retry execution failed.", error);
      });
    }, Math.max(0, delayMs));

    this.timers.set(id, timer);
  }

  clearTimer(id) {
    const key = String(id);
    const timer = this.timers.get(key);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  cancel(id) {
    const key = String(id);
    const job = this.jobs.get(key);

    if (!job) return false;

    this.clearTimer(key);

    if (job.status === "running") {
      job.cancelRequested = true;
    }

    job.status = "cancelled";
    job.updatedAt = this.clock();
    job.nextAttemptAt = null;

    this.emit("cancelled", this.publicJob(job));

    return true;
  }

  retryNow(id) {
    this.assertActive();

    const key = String(id);
    const job = this.jobs.get(key);

    if (!job) return null;

    if (job.status === "running") {
      return this.publicJob(job);
    }

    if (job.status === "succeeded" || job.status === "cancelled") {
      return this.publicJob(job);
    }

    if (job.attempts >= job.maxAttempts) {
      return this.publicJob(job);
    }

    this.clearTimer(key);
    job.status = "scheduled";
    job.nextAttemptAt = this.clock();
    job.updatedAt = this.clock();

    this.armTimer(key, 0);

    return this.publicJob(job);
  }

  getJob(id) {
    const job = this.jobs.get(String(id));
    return job ? this.publicJob(job) : null;
  }

  getJobs({ status, limit = 100 } = {}) {
    let jobs = Array.from(this.jobs.values());

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    jobs.sort((a, b) => b.updatedAt - a.updatedAt);

    return jobs
      .slice(0, Math.max(0, Number(limit) || 0))
      .map((job) => this.publicJob(job));
  }

  getStats() {
    const stats = {
      total: this.jobs.size,
      scheduled: 0,
      running: 0,
      succeeded: 0,
      exhausted: 0,
      cancelled: 0,
    };

    for (const job of this.jobs.values()) {
      if (Object.hasOwn(stats, job.status)) {
        stats[job.status] += 1;
      }
    }

    return stats;
  }

  prune({ keep = 500 } = {}) {
    const maxKeep = Math.max(0, Number(keep) || 0);

    if (this.jobs.size <= maxKeep) return 0;

    const removable = Array.from(this.jobs.values())
      .filter((job) =>
        ["succeeded", "exhausted", "cancelled"].includes(job.status)
      )
      .sort((a, b) => a.updatedAt - b.updatedAt);

    let removed = 0;

    while (this.jobs.size > maxKeep && removable.length) {
      const job = removable.shift();

      this.clearTimer(job.id);
      this.jobs.delete(job.id);
      removed += 1;
    }

    return removed;
  }

  publicJob(job) {
    const {
      handler,
      settings,
      ...publicData
    } = job;

    return this.cloneSafe(publicData);
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall through for non-cloneable values.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  cloneSafe(value) {
    if (value === undefined) return null;

    try {
      return this.clone(value);
    } catch {
      return {
        message: String(value?.message || value),
      };
    }
  }

  normalizeError(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      name: "Error",
      message: String(error ?? "Unknown delivery error."),
    };
  }

  emit(event, payload) {
    this.logger?.debug?.(`[AlertDeliveryRetry] ${event}`, payload);
  }

  warn(message, error) {
    this.logger?.warn?.(`[AlertDeliveryRetry] ${message}`, error);
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Alert delivery retry manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.jobs.clear();
  }
}

export default RouteStatisticsDashboardAlertDeliveryRetry;