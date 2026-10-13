import RecoveryHealthDashboardBackupSchedulerRecoveryPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryPersistence.js";

const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_QUEUE_LIMIT = 500;

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator {
  constructor(options = {}) {
    this.persistence =
      options.persistence ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryPersistence(
        options
      );

    this.maxConcurrency = Math.max(
      1,
      Number(options.maxConcurrency) || DEFAULT_MAX_CONCURRENCY
    );

    this.maxRetries = Math.max(
      0,
      Number(options.maxRetries ?? DEFAULT_MAX_RETRIES)
    );

    this.retryDelayMs = Math.max(
      0,
      Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
    );

    this.queueLimit = Math.max(
      10,
      Number(options.queueLimit) || DEFAULT_QUEUE_LIMIT
    );

    this.clock = options.clock ?? (() => Date.now());
    this.onEvent = options.onEvent ?? (() => {});

    this.queue = [];
    this.running = new Map();
    this.completed = [];
    this.handlers = new Map();
    this.sequence = 0;
    this.activeCount = 0;
    this.paused = false;
    this.destroyed = false;
    this.drainPromise = null;
  }

  register(name, handler) {
    this.assertAvailable();

    if (!name || typeof name !== "string") {
      throw new TypeError("Recovery handler name must be a string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Recovery handler must be a function.");
    }

    this.handlers.set(name, handler);

    return () => {
      if (this.handlers.get(name) === handler) {
        this.handlers.delete(name);
      }
    };
  }

  enqueue(task, options = {}) {
    this.assertAvailable();

    if (this.queue.length + this.activeCount >= this.queueLimit) {
      throw new Error("Recovery queue capacity exceeded.");
    }

    const handlerName =
      typeof task === "string" ? task : task?.handler;

    const handler =
      typeof task === "function"
        ? task
        : this.handlers.get(handlerName);

    if (typeof handler !== "function") {
      throw new Error(
        `No recovery handler registered for "${handlerName ?? "unknown"}".`
      );
    }

    const item = {
      id: options.id ?? this.createId(),
      sequence: ++this.sequence,
      name: options.name ?? handlerName ?? "anonymous-recovery",
      handler,
      payload:
        typeof task === "object" && task !== null
          ? task.payload ?? options.payload ?? {}
          : options.payload ?? {},
      priority: Number(options.priority) || 0,
      maxRetries: Math.max(
        0,
        Number(options.maxRetries ?? this.maxRetries)
      ),
      attempts: 0,
      status: "queued",
      createdAt: this.clock(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    this.queue.push(item);
    this.sortQueue();

    this.emit("recovery_queued", this.publicItem(item));

    void this.persistState();

    return {
      id: item.id,
      status: item.status,
      queuePosition: this.queue.indexOf(item),
    };
  }

  async process() {
    this.assertAvailable();

    if (this.paused) {
      return this.getStatus();
    }

    if (this.drainPromise) {
      return this.drainPromise;
    }

    this.drainPromise = this.drainQueue();

    try {
      await this.drainPromise;
    } finally {
      this.drainPromise = null;
    }

    return this.getStatus();
  }

  async drainQueue() {
    const workers = [];

    for (let index = 0; index < this.maxConcurrency; index += 1) {
      workers.push(this.runWorker());
    }

    await Promise.all(workers);
  }

  async runWorker() {
    while (!this.paused && !this.destroyed) {
      const item = this.queue.shift();

      if (!item) {
        return;
      }

      this.activeCount += 1;
      this.running.set(item.id, item);

      try {
        await this.execute(item);
      } finally {
        this.activeCount -= 1;
        this.running.delete(item.id);
        await this.persistState();
      }
    }
  }

  async execute(item) {
    item.status = "running";
    item.startedAt = this.clock();

    this.emit("recovery_started", this.publicItem(item));

    while (item.attempts <= item.maxRetries) {
      item.attempts += 1;

      try {
        const result = await item.handler({
          id: item.id,
          name: item.name,
          payload: item.payload,
          attempt: item.attempts,
          signal: undefined,
        });

        item.status = "completed";
        item.result = this.sanitize(result);
        item.error = null;
        item.completedAt = this.clock();

        this.completed.push(item);
        this.trimCompleted();

        this.emit("recovery_completed", this.publicItem(item));

        return;
      } catch (error) {
        item.error = this.serializeError(error);

        this.emit("recovery_attempt_failed", {
          ...this.publicItem(item),
          retryAvailable: item.attempts <= item.maxRetries,
        });

        if (item.attempts > item.maxRetries) {
          item.status = "failed";
          item.completedAt = this.clock();

          this.completed.push(item);
          this.trimCompleted();

          this.emit("recovery_failed", this.publicItem(item));

          return;
        }

        await this.delay(this.retryDelayMs * item.attempts);
      }
    }
  }

  pause() {
    this.paused = true;
    this.emit("recovery_queue_paused", this.getStatus());

    return this.getStatus();
  }

  async resume() {
    this.assertAvailable();

    this.paused = false;
    this.emit("recovery_queue_resumed", this.getStatus());

    return this.process();
  }

  cancel(id) {
    const index = this.queue.findIndex((item) => item.id === id);

    if (index === -1) {
      return {
        success: false,
        reason: this.running.has(id)
          ? "task_already_running"
          : "task_not_found",
      };
    }

    const [item] = this.queue.splice(index, 1);

    item.status = "cancelled";
    item.completedAt = this.clock();

    this.completed.push(item);
    this.trimCompleted();

    this.emit("recovery_cancelled", this.publicItem(item));

    void this.persistState();

    return {
      success: true,
      id,
      status: item.status,
    };
  }

  retry(id) {
    this.assertAvailable();

    const item = this.completed.find(
      (entry) => entry.id === id && entry.status === "failed"
    );

    if (!item) {
      return {
        success: false,
        reason: "failed_task_not_found",
      };
    }

    const handler = item.handler;
    const payload = this.sanitize(item.payload);
    const name = item.name;

    this.completed = this.completed.filter(
      (entry) => entry.id !== id
    );

    return {
      success: true,
      task: this.enqueue(handler, {
        name,
        payload,
        priority: item.priority,
        maxRetries: item.maxRetries,
      }),
    };
  }

  sortQueue() {
    this.queue.sort(
      (a, b) =>
        b.priority - a.priority ||
        a.sequence - b.sequence
    );
  }

  getTask(id) {
    const item =
      this.running.get(id) ??
      this.queue.find((entry) => entry.id === id) ??
      this.completed.find((entry) => entry.id === id);

    return item ? this.publicItem(item) : null;
  }

  getStatus() {
    return {
      paused: this.paused,
      destroyed: this.destroyed,
      concurrency: this.maxConcurrency,
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      completedCount: this.completed.filter(
        (item) => item.status === "completed"
      ).length,
      failedCount: this.completed.filter(
        (item) => item.status === "failed"
      ).length,
      cancelledCount: this.completed.filter(
        (item) => item.status === "cancelled"
      ).length,
      queue: this.queue.map((item) => this.publicItem(item)),
      running: [...this.running.values()].map((item) =>
        this.publicItem(item)
      ),
    };
  }

  async persistState() {
    if (this.destroyed) {
      return;
    }

    try {
      await this.persistence.persist({
        sequence: this.sequence,
        paused: this.paused,
        queued: this.queue.map((item) => ({
          id: item.id,
          name: item.name,
          payload: this.sanitize(item.payload),
          priority: item.priority,
          attempts: item.attempts,
          createdAt: item.createdAt,
        })),
        completed: this.completed.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          attempts: item.attempts,
          createdAt: item.createdAt,
          completedAt: item.completedAt,
          error: item.error,
        })),
      });
    } catch (error) {
      this.emit("recovery_persistence_failed", {
        error: this.serializeError(error),
      });
    }
  }

  publicItem(item) {
    return {
      id: item.id,
      sequence: item.sequence,
      name: item.name,
      priority: item.priority,
      status: item.status,
      attempts: item.attempts,
      maxRetries: item.maxRetries,
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      result: item.result,
      error: item.error,
    };
  }

  trimCompleted() {
    if (this.completed.length > this.queueLimit) {
      this.completed.splice(
        0,
        this.completed.length - this.queueLimit
      );
    }
  }

  emit(type, details = {}) {
    try {
      this.onEvent({
        type,
        timestamp: this.clock(),
        details: this.sanitize(details),
      });
    } catch {
      // Event listeners must not interrupt queue processing.
    }
  }

  sanitize(value) {
    try {
      return JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Error) {
            return this.serializeError(item);
          }

          if (typeof item === "bigint") {
            return item.toString();
          }

          if (typeof item === "function") {
            return undefined;
          }

          return item;
        })
      );
    } catch {
      return { summary: String(value) };
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  createId() {
    return `recovery-task-${this.clock()}-${++this.sequence}`;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  assertAvailable() {
    if (this.destroyed) {
      throw new Error("Recovery orchestrator has been destroyed.");
    }
  }

  async destroy() {
    this.paused = true;
    await this.persistState();
    this.destroyed = true;
    this.queue = [];
    this.handlers.clear();
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator;