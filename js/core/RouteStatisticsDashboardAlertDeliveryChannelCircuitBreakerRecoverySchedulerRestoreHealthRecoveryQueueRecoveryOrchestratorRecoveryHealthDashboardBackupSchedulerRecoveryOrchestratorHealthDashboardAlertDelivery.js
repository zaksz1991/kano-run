import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlerts from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlerts.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlertDelivery {
  constructor({
    alerts = null,
    clock = () => Date.now(),
    historyLimit = 200,
    maxRetries = 3,
    retryDelayMs = 1000,
    channels = {},
  } = {}) {
    this.alerts =
      alerts ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlerts();

    this.clock = clock;
    this.historyLimit = Math.max(10, Number(historyLimit) || 200);
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);

    this.channels = new Map();
    this.history = [];
    this.queue = [];
    this.delivering = false;
    this.started = false;
    this.unsubscribe = null;
    this.sequence = 0;
    this.deliveryCounts = {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    };

    for (const [name, handler] of Object.entries(channels)) {
      this.registerChannel(name, handler);
    }
  }

  registerChannel(name, handler) {
    if (!name || typeof handler !== "function") {
      throw new TypeError(
        "A channel name and delivery function are required.",
      );
    }

    this.channels.set(name, handler);

    return {
      name,
      registered: true,
      channelCount: this.channels.size,
    };
  }

  unregisterChannel(name) {
    return this.channels.delete(name);
  }

  start() {
    if (this.started) {
      return this.getStatus();
    }

    this.started = true;

    this.unsubscribe = this.alerts.subscribe?.((alert) => {
      void this.enqueue(alert);
    }) ?? null;

    return this.getStatus();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.started = false;

    return this.getStatus();
  }

  async enqueue(alert, {
    channels = [...this.channels.keys()],
    priority = 0,
  } = {}) {
    if (!alert || !alert.key) {
      throw new TypeError("A valid alert is required.");
    }

    const job = {
      id: `alert-delivery-${++this.sequence}`,
      alert: this.#sanitize(alert),
      channels: [...new Set(channels)],
      priority: Number(priority) || 0,
      queuedAt: this.clock(),
      status: "queued",
      attempts: 0,
    };

    this.queue.push(job);

    this.queue.sort((a, b) => {
      return b.priority - a.priority || a.queuedAt - b.queuedAt;
    });

    this.#record("queued", job);

    void this.flush();

    return {
      id: job.id,
      status: job.status,
      queuedAt: job.queuedAt,
    };
  }

  async flush() {
    if (this.delivering) {
      return this.getStatus();
    }

    this.delivering = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();

        if (!job) {
          continue;
        }

        job.status = "delivering";
        job.startedAt = this.clock();

        for (const channelName of job.channels) {
          const handler = this.channels.get(channelName);

          if (!handler) {
            this.deliveryCounts.skipped += 1;

            this.#record("channel_missing", {
              jobId: job.id,
              channel: channelName,
            });

            continue;
          }

          await this.#deliverToChannel(job, channelName, handler);
        }

        job.finishedAt = this.clock();
        job.status = job.failedChannels?.length
          ? "partially_failed"
          : "delivered";

        this.#record("job_finished", {
          jobId: job.id,
          status: job.status,
          durationMs: job.finishedAt - job.startedAt,
        });
      }
    } finally {
      this.delivering = false;
    }

    return this.getStatus();
  }

  async #deliverToChannel(job, channelName, handler) {
    const delivery = {
      jobId: job.id,
      channel: channelName,
      attempts: 0,
      status: "pending",
      startedAt: this.clock(),
      error: null,
    };

    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      delivery.attempts = attempt;
      this.deliveryCounts.attempted += 1;

      try {
        await handler({
          id: job.id,
          alert: this.#sanitize(job.alert),
          channel: channelName,
          attempt,
          timestamp: this.clock(),
        });

        delivery.status = "delivered";
        delivery.deliveredAt = this.clock();
        this.deliveryCounts.delivered += 1;

        this.#record("delivery_succeeded", delivery);

        return delivery;
      } catch (error) {
        delivery.error = error instanceof Error
          ? error.message
          : String(error);

        if (attempt < maxAttempts) {
          await this.#delay(this.retryDelayMs * attempt);
        }
      }
    }

    delivery.status = "failed";
    delivery.finishedAt = this.clock();
    this.deliveryCounts.failed += 1;

    job.failedChannels ??= [];
    job.failedChannels.push(channelName);

    this.#record("delivery_failed", delivery);

    return delivery;
  }

  getStatus() {
    return {
      started: this.started,
      delivering: this.delivering,
      queuedJobs: this.queue.length,
      registeredChannels: [...this.channels.keys()],
      counts: { ...this.deliveryCounts },
      historyCount: this.history.length,
    };
  }

  getQueue() {
    return this.queue.map((job) => ({
      ...job,
      alert: this.#sanitize(job.alert),
      channels: [...job.channels],
      failedChannels: [...(job.failedChannels ?? [])],
    }));
  }

  getHistory({ limit = this.historyLimit } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(this.historyLimit, Number(limit) || this.historyLimit),
    );

    return this.history.slice(-safeLimit).map((entry) => ({
      ...entry,
      details: this.#sanitize(entry.details),
    }));
  }

  clearHistory() {
    const removed = this.history.length;
    this.history = [];

    return {
      removed,
      clearedAt: this.clock(),
    };
  }

  #record(event, details) {
    this.history.push({
      id: ++this.sequence,
      event,
      timestamp: this.clock(),
      details: this.#sanitize(details),
    });

    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
  }

  #delay(ms) {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  #sanitize(value, depth = 0) {
    if (depth > 6) {
      return "[MaxDepth]";
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.#sanitize(item, depth + 1));
    }

    if (typeof value === "object") {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        output[key] = /password|secret|token|authorization/i.test(key)
          ? "[REDACTED]"
          : this.#sanitize(item, depth + 1);
      }

      return output;
    }

    return String(value);
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardAlertDelivery;