const DEFAULT_QUEUE_CONFIG = Object.freeze({
  concurrency: 3,
  maxQueueSize: 500,
  taskTimeoutMs: 20_000,
  retryDelayMs: 1_000,
  maxRetries: 3,
  priorityLevels: 5,
});

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueue {
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_QUEUE_CONFIG,
      ...options,
    };

    this.queue = [];
    this.jobs = new Map();
    this.activeJobs = new Map();
    this.sequence = 0;
    this.paused = false;
    this.destroyed = false;

    this.handlers = {
      onQueued: options.onQueued ?? (() => {}),
      onStarted: options.onStarted ?? (() => {}),
      onCompleted: options.onCompleted ?? (() => {}),
      onFailed: options.onFailed ?? (() => {}),
      onStatus: options.onStatus ?? (() => {}),
    };

    this.stats = {
      submitted: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      rejected: 0,
    };
  }

  enqueue(task, options = {}) {
    this.#assertActive();

    if (typeof task !== "function") {
      throw new TypeError("Queue task must be a function.");
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      this.stats.rejected += 1;
      throw new Error("Recovery queue capacity exceeded.");
    }

    const id = options.id ?? this.#createId();

    if (this.jobs.has(id)) {
      throw new Error(`Recovery job "${id}" already exists.`);
    }

    const job = {
      id,
      task,
      priority: this.#normalizePriority(options.priority),
      sequence: this.sequence++,
      attempts: 0,
      maxRetries: this.#normalizeRetries(options.maxRetries),
      timeoutMs: this.#normalizeTimeout(options.timeoutMs),
      retryDelayMs: this.#normalizeRetryDelay(options.retryDelayMs),
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: undefined,
      metadata: options.metadata ?? {},
      resolve: null,
      reject: null,
      retryTimer: null,
      signal: options.signal ?? null,
    };

    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });

    promise.jobId = id;

    this.jobs.set(id, job);
    this.queue.push(job);
    this.stats.submitted += 1;

    this.#sortQueue();
    this.#emit("onQueued", this.#snapshot(job));
    this.#emitStatus();

    this.#process();

    return promise;
  }

  async #process() {
    if (this.destroyed || this.paused) {
      return;
    }

    while (
      !this.destroyed &&
      !this.paused &&
      this.activeJobs.size < this.config.concurrency &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();

      if (!job || job.status !== "queued") {
        continue;
      }

      if (job.signal?.aborted) {
        this.#cancelQueuedJob(job, "Job was cancelled before execution.");
        continue;
      }

      void this.#execute(job);
    }

    this.#emitStatus();
  }

  async #execute(job) {
    job.status = "running";
    job.attempts += 1;
    job.startedAt ??= Date.now();

    const controller = new AbortController();
    const activeRecord = {
      job,
      controller,
      timeout: null,
      externalAbortHandler: null,
    };

    this.activeJobs.set(job.id, activeRecord);

    if (job.signal) {
      activeRecord.externalAbortHandler = () => {
        controller.abort(job.signal.reason);
      };

      job.signal.addEventListener(
        "abort",
        activeRecord.externalAbortHandler,
        { once: true }
      );
    }

    this.#emit("onStarted", this.#snapshot(job));
    this.#emitStatus();

    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
      activeRecord.timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();

        const error = new Error(
          `Recovery job "${job.id}" exceeded ${job.timeoutMs}ms.`
        );

        error.name = "TimeoutError";
        reject(error);
      }, job.timeoutMs);
    });

    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          job.task({
            id: job.id,
            attempt: job.attempts,
            signal: controller.signal,
            metadata: job.metadata,
          })
        ),
        timeoutPromise,
      ]);

      if (controller.signal.aborted) {
        throw new Error("Recovery job was aborted.");
      }

      job.status = "completed";
      job.result = result;
      job.completedAt = Date.now();

      this.stats.completed += 1;
      job.resolve(result);

      this.#emit("onCompleted", {
        ...this.#snapshot(job),
        result,
      });
    } catch (error) {
      job.error = this.#serializeError(error);

      const canRetry =
        !this.destroyed &&
        !job.signal?.aborted &&
        job.attempts <= job.maxRetries;

      if (canRetry) {
        job.status = "retry_wait";
        this.stats.retried += 1;

        this.#emit("onFailed", {
          ...this.#snapshot(job),
          willRetry: true,
          timedOut,
        });

        const delay = job.retryDelayMs * 2 ** (job.attempts - 1);

        job.retryTimer = setTimeout(() => {
          job.retryTimer = null;

          if (this.destroyed) {
            this.#finalizeFailure(
              job,
              new Error("Recovery queue was destroyed.")
            );
            return;
          }

          job.status = "queued";
          job.sequence = this.sequence++;
          this.queue.push(job);
          this.#sortQueue();
          this.#emitStatus();
          this.#process();
        }, delay);
      } else {
        this.#finalizeFailure(job, error);
      }
    } finally {
      clearTimeout(activeRecord.timeout);

      if (job.signal && activeRecord.externalAbortHandler) {
        job.signal.removeEventListener(
          "abort",
          activeRecord.externalAbortHandler
        );
      }

      this.activeJobs.delete(job.id);
      this.#emitStatus();
      this.#process();
    }
  }

  #finalizeFailure(job, error) {
    job.status = "failed";
    job.error = this.#serializeError(error);
    job.completedAt = Date.now();

    this.stats.failed += 1;
    job.reject(error);

    this.#emit("onFailed", {
      ...this.#snapshot(job),
      willRetry: false,
    });
  }

  cancel(id, reason = "Recovery job cancelled.") {
    this.#assertActive();

    const job = this.jobs.get(id);

    if (!job) {
      return false;
    }

    if (job.status === "queued") {
      this.queue = this.queue.filter((item) => item.id !== id);
      this.#cancelQueuedJob(job, reason);
      this.#emitStatus();
      return true;
    }

    if (job.status === "retry_wait") {
      clearTimeout(job.retryTimer);
      job.retryTimer = null;
      this.#finalizeFailure(job, new Error(reason));
      this.#emitStatus();
      return true;
    }

    if (job.status === "running") {
      const active = this.activeJobs.get(id);

      if (active) {
        active.controller.abort(reason);
        return true;
      }
    }

    return false;
  }

  #cancelQueuedJob(job, reason) {
    job.status = "cancelled";
    job.error = {
      name: "AbortError",
      message: reason,
      timestamp: Date.now(),
    };
    job.completedAt = Date.now();

    job.reject(
      Object.assign(new Error(reason), {
        name: "AbortError",
      })
    );

    this.#emit("onFailed", {
      ...this.#snapshot(job),
      willRetry: false,
    });
  }

  pause() {
    this.paused = true;
    this.#emitStatus();
  }

  resume() {
    this.#assertActive();

    this.paused = false;
    this.#emitStatus();
    this.#process();
  }

  getJob(id) {
    const job = this.jobs.get(id);
    return job ? this.#snapshot(job) : null;
  }

  getJobs(status = null) {
    const jobs = Array.from(this.jobs.values());

    return jobs
      .filter((job) => !status || job.status === status)
      .sort((a, b) => a.sequence - b.sequence)
      .map((job) => this.#snapshot(job));
  }

  getStats() {
    return {
      ...this.stats,
      queued: this.queue.length,
      active: this.activeJobs.size,
      totalTracked: this.jobs.size,
      paused: this.paused,
    };
  }

  forget(id) {
    const job = this.jobs.get(id);

    if (!job) {
      return false;
    }

    if (
      ["queued", "running", "retry_wait"].includes(job.status)
    ) {
      return false;
    }

    this.jobs.delete(id);
    this.#emitStatus();

    return true;
  }

  clearCompleted() {
    let removed = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        this.jobs.delete(id);
        removed += 1;
      }
    }

    this.#emitStatus();

    return removed;
  }

  async waitForIdle(options = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const startedAt = Date.now();

    while (true) {
      const pending = Array.from(this.jobs.values()).some((job) =>
        ["queued", "running", "retry_wait"].includes(job.status)
      );

      if (!pending) {
        return true;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  destroy(reason = "Recovery queue destroyed.") {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const job of this.queue.splice(0)) {
      this.#cancelQueuedJob(job, reason);
    }

    for (const job of this.jobs.values()) {
      if (job.status === "retry_wait") {
        clearTimeout(job.retryTimer);
        job.retryTimer = null;
        this.#finalizeFailure(job, new Error(reason));
      }
    }

    for (const active of this.activeJobs.values()) {
      active.controller.abort(reason);
    }

    this.#emitStatus();
  }

  #sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      return a.sequence - b.sequence;
    });
  }

  #normalizePriority(value) {
    const priority = Number.isFinite(value) ? Math.floor(value) : 0;

    return Math.max(
      0,
      Math.min(this.config.priorityLevels - 1, priority)
    );
  }

  #normalizeRetries(value) {
    return Number.isInteger(value) && value >= 0
      ? value
      : this.config.maxRetries;
  }

  #normalizeTimeout(value) {
    return Number.isFinite(value) && value > 0
      ? value
      : this.config.taskTimeoutMs;
  }

  #normalizeRetryDelay(value) {
    return Number.isFinite(value) && value >= 0
      ? value
      : this.config.retryDelayMs;
  }

  #createId() {
    return `recovery-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  #snapshot(job) {
    return {
      id: job.id,
      priority: job.priority,
      attempts: job.attempts,
      maxRetries: job.maxRetries,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      metadata: job.metadata,
    };
  }

  #serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      timestamp: Date.now(),
    };
  }

  #emit(event, payload) {
    try {
      this.handlers[event]?.(payload);
    } catch {
      // Observer errors must not interrupt queue processing.
    }
  }

  #emitStatus() {
    this.#emit("onStatus", this.getStats());
  }

  #assertActive() {
    if (this.destroyed) {
      throw new Error("Recovery queue has been destroyed.");
    }
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueue;