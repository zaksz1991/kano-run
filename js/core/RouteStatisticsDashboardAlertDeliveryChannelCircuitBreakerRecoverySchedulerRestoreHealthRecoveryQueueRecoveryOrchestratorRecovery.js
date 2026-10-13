import RecoveryOrchestrator from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestrator.js";

const DEFAULTS = {
  retryDelayMs: 1000,
  maxAttempts: 3,
  backoffMultiplier: 2,
  maxRetryDelayMs: 30000,
  recoveryTimeoutMs: 15000,
};

export class RecoveryQueueRecoveryOrchestratorRecovery {
  constructor(orchestrator = null, options = {}) {
    this.orchestrator = orchestrator || new RecoveryOrchestrator();
    this.options = { ...DEFAULTS, ...options };

    this.recoveryJobs = new Map();
    this.retryTimers = new Map();
    this.listeners = new Set();

    this.running = false;
    this.disposed = false;
    this.sequence = 0;

    this.stats = {
      scheduled: 0,
      attempted: 0,
      recovered: 0,
      failed: 0,
      retried: 0,
      cancelled: 0,
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Recovery listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(type, detail = {}) {
    const event = {
      type,
      detail,
      stats: this.getStats(),
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryQueueRecovery]", error);
      }
    }
  }

  schedule(task, options = {}) {
    this.assertActive();

    if (!task || typeof task !== "object") {
      throw new TypeError("A recovery task object is required.");
    }

    const id = String(
      options.id || task.id || `recovery-${Date.now()}-${++this.sequence}`
    );

    if (this.recoveryJobs.has(id)) {
      return this.recoveryJobs.get(id);
    }

    const job = {
      id,
      task,
      status: "scheduled",
      attempts: 0,
      maxAttempts: Math.max(
        1,
        Number(options.maxAttempts ?? this.options.maxAttempts)
      ),
      retryDelayMs: Math.max(
        0,
        Number(options.retryDelayMs ?? this.options.retryDelayMs)
      ),
      backoffMultiplier: Math.max(
        1,
        Number(options.backoffMultiplier ?? this.options.backoffMultiplier)
      ),
      maxRetryDelayMs: Math.max(
        0,
        Number(options.maxRetryDelayMs ?? this.options.maxRetryDelayMs)
      ),
      scheduledAt: Date.now(),
      updatedAt: Date.now(),
      recoveredAt: null,
      lastError: null,
      timer: null,
    };

    this.recoveryJobs.set(id, job);
    this.stats.scheduled += 1;

    this.emit("recovery:scheduled", this.serialize(job));

    if (options.immediate === true) {
      void this.execute(id);
    } else {
      this.scheduleRetry(job, job.retryDelayMs);
    }

    return this.serialize(job);
  }

  async execute(id) {
    this.assertActive();

    const job = this.recoveryJobs.get(String(id));

    if (!job || ["recovered", "cancelled"].includes(job.status)) {
      return job ? this.serialize(job) : null;
    }

    this.clearRetry(job.id);

    if (job.status === "running") {
      return this.serialize(job);
    }

    if (job.attempts >= job.maxAttempts) {
      this.markFailed(job, job.lastError || "Maximum recovery attempts reached.");
      return this.serialize(job);
    }

    job.status = "running";
    job.attempts += 1;
    job.updatedAt = Date.now();

    this.stats.attempted += 1;
    this.running = true;

    this.emit("recovery:started", this.serialize(job));

    try {
      const result = await this.runWithTimeout(
        () => this.performRecovery(job),
        this.options.recoveryTimeoutMs
      );

      job.status = "recovered";
      job.result = result ?? null;
      job.recoveredAt = Date.now();
      job.updatedAt = Date.now();
      job.lastError = null;

      this.stats.recovered += 1;

      this.emit("recovery:completed", this.serialize(job));

      return this.serialize(job);
    } catch (error) {
      job.lastError = this.formatError(error);
      job.updatedAt = Date.now();

      if (job.attempts < job.maxAttempts && !this.disposed) {
        job.status = "retry_wait";

        const delay = Math.min(
          job.retryDelayMs * Math.pow(
            job.backoffMultiplier,
            Math.max(0, job.attempts - 1)
          ),
          job.maxRetryDelayMs
        );

        this.stats.retried += 1;

        this.emit("recovery:retrying", {
          ...this.serialize(job),
          nextRetryDelayMs: delay,
        });

        this.scheduleRetry(job, delay);
      } else {
        this.markFailed(job, job.lastError);
      }

      return this.serialize(job);
    } finally {
      this.running = [...this.recoveryJobs.values()].some(
        (item) => item.status === "running"
      );
    }
  }

  async performRecovery(job) {
    const task = job.task;

    if (typeof task.recover === "function") {
      return task.recover({
        task,
        attempt: job.attempts,
        recoveryId: job.id,
      });
    }

    if (typeof task.run === "function") {
      return task.run({
        task,
        attempt: job.attempts,
        recoveryId: job.id,
      });
    }

    if (typeof task.execute === "function") {
      return task.execute({
        task,
        attempt: job.attempts,
        recoveryId: job.id,
      });
    }

    if (typeof this.orchestrator.submit === "function") {
      return this.orchestrator.submit({
        ...task,
        recoveryId: job.id,
        recoveryAttempt: job.attempts,
      });
    }

    throw new Error(
      `Recovery task "${job.id}" has no recover, run, or execute handler.`
    );
  }

  scheduleRetry(job, delayMs) {
    this.clearRetry(job.id);

    if (this.disposed || job.status === "cancelled") {
      return;
    }

    job.timer = setTimeout(() => {
      job.timer = null;
      this.retryTimers.delete(job.id);

      void this.execute(job.id);
    }, Math.max(0, delayMs));

    this.retryTimers.set(job.id, job.timer);
  }

  clearRetry(id) {
    const key = String(id);
    const timer = this.retryTimers.get(key);

    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(key);
    }

    const job = this.recoveryJobs.get(key);

    if (job) {
      job.timer = null;
    }
  }

  cancel(id, reason = "Cancelled by request.") {
    const key = String(id);
    const job = this.recoveryJobs.get(key);

    if (!job || ["recovered", "failed", "cancelled"].includes(job.status)) {
      return false;
    }

    this.clearRetry(key);

    job.status = "cancelled";
    job.cancelReason = String(reason);
    job.updatedAt = Date.now();

    this.stats.cancelled += 1;

    this.emit("recovery:cancelled", this.serialize(job));

    return true;
  }

  retryNow(id) {
    const job = this.recoveryJobs.get(String(id));

    if (!job || ["recovered", "cancelled"].includes(job.status)) {
      return Promise.resolve(null);
    }

    if (job.attempts >= job.maxAttempts) {
      job.attempts = 0;
    }

    job.status = "scheduled";
    job.updatedAt = Date.now();

    return this.execute(job.id);
  }

  markFailed(job, error) {
    job.status = "failed";
    job.lastError = this.formatError(error);
    job.updatedAt = Date.now();

    this.stats.failed += 1;

    this.emit("recovery:failed", this.serialize(job));
  }

  runWithTimeout(operation, timeoutMs) {
    let timer;

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(`Recovery timed out after ${timeoutMs} milliseconds.`)
        );
      }, Math.max(1, timeoutMs));
    });

    return Promise.race([
      Promise.resolve().then(operation),
      timeout,
    ]).finally(() => clearTimeout(timer));
  }

  get(id) {
    const job = this.recoveryJobs.get(String(id));
    return job ? this.serialize(job) : null;
  }

  getAll() {
    return [...this.recoveryJobs.values()].map((job) =>
      this.serialize(job)
    );
  }

  getPending() {
    return this.getAll().filter((job) =>
      ["scheduled", "retry_wait", "running"].includes(job.status)
    );
  }

  getStats() {
    return {
      ...this.stats,
      total: this.recoveryJobs.size,
      pending: [...this.recoveryJobs.values()].filter((job) =>
        ["scheduled", "retry_wait", "running"].includes(job.status)
      ).length,
      running: [...this.recoveryJobs.values()].filter(
        (job) => job.status === "running"
      ).length,
      disposed: this.disposed,
    };
  }

  remove(id) {
    const key = String(id);
    const job = this.recoveryJobs.get(key);

    if (!job || job.status === "running") {
      return false;
    }

    this.clearRetry(key);
    this.recoveryJobs.delete(key);

    this.emit("recovery:removed", { id: key });

    return true;
  }

  clearFinished() {
    let removed = 0;

    for (const [id, job] of this.recoveryJobs) {
      if (["recovered", "failed", "cancelled"].includes(job.status)) {
        this.clearRetry(id);
        this.recoveryJobs.delete(id);
        removed += 1;
      }
    }

    this.emit("recovery:finished_cleared", { removed });

    return removed;
  }

  serialize(job) {
    const {
      timer,
      task,
      ...data
    } = job;

    return {
      ...data,
      task: {
        id: task?.id ?? null,
        type: task?.type ?? null,
        name: task?.name ?? null,
      },
    };
  }

  formatError(error) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error ?? "Unknown recovery error.");
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Recovery service has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }

    this.retryTimers.clear();

    for (const job of this.recoveryJobs.values()) {
      if (job.status === "scheduled" || job.status === "retry_wait") {
        job.status = "cancelled";
        job.cancelReason = "Recovery service disposed.";
        job.updatedAt = Date.now();
      }
    }

    this.listeners.clear();
    this.disposed = true;
    this.running = false;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecovery;