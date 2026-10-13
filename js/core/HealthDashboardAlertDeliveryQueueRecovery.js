const DEFAULT_CONFIG = {
  maxAttempts: 3,
  retryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export class HealthDashboardAlertDeliveryQueueRecovery {
  constructor({
    queue,
    config = {},
    clock = () => Date.now(),
    random = Math.random,
  } = {}) {
    if (!queue) {
      throw new Error("An alert delivery queue is required.");
    }

    this.queue = queue;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.clock = clock;
    this.random = random;
    this.attempts = new Map();
    this.recoveries = [];
    this.listeners = new Set();
    this.running = false;
    this.destroyed = false;
  }

  async recover(job, error = null) {
    if (this.destroyed) {
      return {
        success: false,
        reason: "destroyed",
      };
    }

    if (!job || !job.id) {
      throw new TypeError("A valid job with an ID is required.");
    }

    const jobId = String(job.id);
    const attempt = (this.attempts.get(jobId) ?? 0) + 1;

    this.attempts.set(jobId, attempt);

    if (attempt > this.config.maxAttempts) {
      return this.#record({
        jobId,
        attempt,
        success: false,
        status: "exhausted",
        error: this.#errorMessage(error),
      });
    }

    const delayMs = this.#calculateDelay(attempt);

    this.running = true;

    try {
      await this.#delay(delayMs);

      if (this.destroyed) {
        return {
          success: false,
          reason: "destroyed",
          jobId,
        };
      }

      const result = await this.#requeue(job, attempt);

      return this.#record({
        jobId,
        attempt,
        success: result.success,
        status: result.success ? "requeued" : "failed",
        delayMs,
        error: result.error ?? this.#errorMessage(error),
      });
    } finally {
      this.running = false;
    }
  }

  async #requeue(job, attempt) {
    try {
      if (typeof this.queue.requeue === "function") {
        const result = await this.queue.requeue(job.id, {
          recoveryAttempt: attempt,
        });

        return {
          success: result?.success !== false,
        };
      }

      if (typeof this.queue.enqueue === "function") {
        const result = await this.queue.enqueue({
          ...job,
          id: `${job.id}-retry-${attempt}`,
          status: "pending",
          recoveryAttempt: attempt,
          recoveredAt: new Date(this.clock()).toISOString(),
        });

        return {
          success: result?.success !== false,
        };
      }

      return {
        success: false,
        error: "Queue does not support requeue or enqueue.",
      };
    } catch (error) {
      return {
        success: false,
        error: this.#errorMessage(error),
      };
    }
  }

  #calculateDelay(attempt) {
    const base = Math.max(0, Number(this.config.retryDelayMs) || 0);
    const maximum = Math.max(
      base,
      Number(this.config.maxRetryDelayMs) || base,
    );
    const multiplier = Math.max(
      1,
      Number(this.config.backoffMultiplier) || 1,
    );

    let delay = Math.min(
      maximum,
      base * multiplier ** Math.max(0, attempt - 1),
    );

    if (this.config.jitter) {
      delay *= 0.5 + this.random() * 0.5;
    }

    return Math.round(delay);
  }

  #delay(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  #record(record) {
    const entry = {
      ...record,
      timestamp: this.clock(),
      isoTime: new Date(this.clock()).toISOString(),
    };

    this.recoveries.push(entry);

    this.#emit({
      type: "recovery",
      entry,
    });

    return entry;
  }

  getAttemptCount(jobId) {
    return this.attempts.get(String(jobId)) ?? 0;
  }

  resetAttempts(jobId) {
    if (jobId === undefined) {
      this.attempts.clear();
      return;
    }

    this.attempts.delete(String(jobId));
  }

  getHistory({ limit = 100 } = {}) {
    const safeLimit = Math.max(1, Number(limit) || 100);
    return this.recoveries.slice(-safeLimit);
  }

  getStatus() {
    const successful = this.recoveries.filter(
      (item) => item.success,
    ).length;

    return {
      running: this.running,
      destroyed: this.destroyed,
      trackedJobs: this.attempts.size,
      totalRecoveries: this.recoveries.length,
      successfulRecoveries: successful,
      failedRecoveries: this.recoveries.length - successful,
      maxAttempts: this.config.maxAttempts,
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
  }

  #errorMessage(error) {
    if (!error) return null;
    return error instanceof Error
      ? error.message
      : String(error);
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not interrupt recovery.
      }
    }
  }
}

export default HealthDashboardAlertDeliveryQueueRecovery;