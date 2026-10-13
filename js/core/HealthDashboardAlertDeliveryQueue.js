import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlertDelivery from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlertDelivery.js";

export class HealthDashboardAlertDeliveryQueue {
  constructor({
    delivery = null,
    maxQueueSize = 500,
    maxRetries = 3,
    retryDelayMs = 1000,
    concurrency = 1,
    clock = () => Date.now(),
  } = {}) {
    this.delivery =
      delivery ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlertDelivery({
        maxRetries,
        retryDelayMs,
      });

    this.maxQueueSize = Math.max(1, Number(maxQueueSize) || 500);
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.clock = clock;

    this.queue = [];
    this.jobs = new Map();
    this.activeWorkers = 0;
    this.sequence = 0;
    this.closed = false;
    this.scheduled = false;

    this.stats = {
      enqueued: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
      retried: 0,
    };

    this.listeners = new Set();
  }

  enqueue(alert, options = {}) {
    if (this.closed) {
      return {
        accepted: false,
        reason: "queue_closed",
      };
    }

    if (!alert || typeof alert !== "object" || !alert.key) {
      throw new TypeError("A valid alert object is required.");
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.stats.rejected += 1;

      return {
        accepted: false,
        reason: "queue_full",
        capacity: this.maxQueueSize,
      };
    }

    const id = `health-alert-${this.clock()}-${++this.sequence}`;

    const job = {
      id,
      alert: this.#clone(alert),
      channels: Array.isArray(options.channels)
        ? [...new Set(options.channels)]
        : undefined,
      priority: Number(options.priority) || 0,
      attempts: 0,
      status: "queued",
      enqueuedAt: this.clock(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    this.queue.push(job);
    this.jobs.set(id, job);
    this.stats.enqueued += 1;

    this.#sortQueue();
    this.#emit("job_enqueued", job);
    this.#schedule();

    return {
      accepted: true,
      id,
      status: job.status,
    };
  }

  async enqueueAndWait(alert, options = {}) {
    const result = this.enqueue(alert, options);

    if (!result.accepted) {
      return result;
    }

    const job = this.jobs.get(result.id);

    return new Promise((resolve) => {
      if (job.status === "completed" || job.status === "failed") {
        resolve(this.#publicJob(job));
        return;
      }

      const unsubscribe = this.subscribe((event) => {
        if (
          event.job?.id === result.id &&
          ["job_completed", "job_failed"].includes(event.type)
        ) {
          unsubscribe();
          resolve(this.#publicJob(job));
        }
      });
    });
  }

  async process() {
    if (this.closed && this.queue.length === 0) {
      return this.getStatus();
    }

    const workers = [];

    while (
      this.activeWorkers < this.concurrency &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();

      if (!job || job.status !== "queued") {
        continue;
      }

      this.activeWorkers += 1;
      workers.push(this.#processJob(job));
    }

    await Promise.allSettled(workers);

    if (this.queue.length > 0 && !this.closed) {
      this.#schedule();
    }

    return this.getStatus();
  }

  async #processJob(job) {
    job.status = "processing";
    job.startedAt = this.clock();

    this.#emit("job_started", job);

    try {
      const options = {};

      if (job.channels) {
        options.channels = job.channels;
      }

      const result = await this.delivery.enqueue(
        job.alert,
        options,
      );

      if (result?.status === "queued") {
        await this.delivery.flush();
      }

      if (result?.status === "failed") {
        throw new Error(result.error || "Alert delivery failed.");
      }

      job.status = "completed";
      job.result = this.#clone(result);
      job.completedAt = this.clock();

      this.stats.completed += 1;
      this.#emit("job_completed", job);
    } catch (error) {
      job.attempts += 1;
      job.error = error instanceof Error
        ? error.message
        : String(error);

      if (job.attempts <= 3 && !this.closed) {
        job.status = "queued";
        this.stats.retried += 1;

        this.queue.push(job);
        this.#sortQueue();

        this.#emit("job_retrying", job);
      } else {
        job.status = "failed";
        job.completedAt = this.clock();

        this.stats.failed += 1;
        this.#emit("job_failed", job);
      }
    } finally {
      this.activeWorkers -= 1;
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getJob(id) {
    const job = this.jobs.get(id);

    return job ? this.#publicJob(job) : null;
  }

  getJobs({ status = null, limit = 100 } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(1000, Number(limit) || 100),
    );

    let jobs = [...this.jobs.values()];

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    return jobs
      .slice(-safeLimit)
      .map((job) => this.#publicJob(job));
  }

  getStatus() {
    const statuses = {};

    for (const job of this.jobs.values()) {
      statuses[job.status] = (statuses[job.status] || 0) + 1;
    }

    return {
      closed: this.closed,
      queueLength: this.queue.length,
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
      trackedJobs: this.jobs.size,
      statuses,
      stats: { ...this.stats },
    };
  }

  async drain({ timeoutMs = 30000 } = {}) {
    const deadline = this.clock() + Math.max(0, timeoutMs);

    this.#schedule();

    while (
      this.queue.length > 0 ||
      this.activeWorkers > 0
    ) {
      if (this.clock() >= deadline) {
        return {
          drained: false,
          reason: "timeout",
          status: this.getStatus(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return {
      drained: true,
      status: this.getStatus(),
    };
  }

  close({ discardQueued = false } = {}) {
    this.closed = true;

    if (discardQueued) {
      for (const job of this.queue) {
        job.status = "failed";
        job.error = "Queue closed before processing.";
        job.completedAt = this.clock();

        this.stats.failed += 1;
        this.#emit("job_failed", job);
      }

      this.queue = [];
    }

    this.#emit("queue_closed", null);

    return this.getStatus();
  }

  reopen() {
    this.closed = false;
    this.#schedule();

    return this.getStatus();
  }

  #schedule() {
    if (this.scheduled || this.closed || this.queue.length === 0) {
      return;
    }

    this.scheduled = true;

    queueMicrotask(async () => {
      this.scheduled = false;
      await this.process();
    });
  }

  #sortQueue() {
    this.queue.sort(
      (a, b) =>
        b.priority - a.priority ||
        a.enqueuedAt - b.enqueuedAt,
    );
  }

  #emit(type, job) {
    const event = {
      type,
      timestamp: this.clock(),
      job: job ? this.#publicJob(job) : null,
      status: this.getStatus(),
    };

    for (const listener of this.listeners) {
      try {
        listener(this.#clone(event));
      } catch {
        // Listener failures must not interrupt queue processing.
      }
    }
  }

  #publicJob(job) {
    return {
      id: job.id,
      alert: this.#clone(job.alert),
      channels: job.channels ? [...job.channels] : null,
      priority: job.priority,
      attempts: job.attempts,
      status: job.status,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result ? this.#clone(job.result) : null,
    };
  }

  #clone(value) {
    if (value === undefined) {
      return null;
    }

    return structuredClone(value);
  }
}

export default HealthDashboardAlertDeliveryQueue;