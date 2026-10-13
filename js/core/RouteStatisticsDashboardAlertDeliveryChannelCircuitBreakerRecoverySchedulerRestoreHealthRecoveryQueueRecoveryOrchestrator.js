const DEFAULT_OPTIONS = {
  maxConcurrent: 3,
  retryDelay: 1000,
  maxRetries: 3,
  taskTimeout: 15000,
  autoStart: false,
};

export class RecoveryOrchestrator {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.queue = [];
    this.active = new Map();
    this.completed = [];
    this.failed = [];
    this.handlers = new Map();
    this.running = false;
    this.destroyed = false;
    this.sequence = 0;
    this.listeners = new Set();
    this.stats = {
      submitted: 0,
      recovered: 0,
      failed: 0,
      retries: 0,
      cancelled: 0,
    };

    if (this.options.autoStart) {
      this.start();
    }
  }

  register(type, handler) {
    if (typeof type !== "string" || !type.trim()) {
      throw new TypeError("Recovery task type must be a non-empty string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Recovery handler must be a function.");
    }

    this.handlers.set(type, handler);
    return () => this.handlers.delete(type);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event, details = {}) {
    const payload = {
      event,
      timestamp: Date.now(),
      stats: this.getStats(),
      ...details,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error("[RecoveryOrchestrator] Listener error:", error);
      }
    }
  }

  submit(type, payload = {}, options = {}) {
    if (this.destroyed) {
      throw new Error("Recovery orchestrator has been destroyed.");
    }

    if (!this.handlers.has(type)) {
      throw new Error(`No recovery handler registered for "${type}".`);
    }

    const task = {
      id: `recovery-${Date.now()}-${++this.sequence}`,
      type,
      payload,
      priority: Number.isFinite(options.priority)
        ? options.priority
        : 0,
      retries: 0,
      maxRetries: Number.isInteger(options.maxRetries)
        ? Math.max(0, options.maxRetries)
        : this.options.maxRetries,
      retryDelay: Number.isFinite(options.retryDelay)
        ? Math.max(0, options.retryDelay)
        : this.options.retryDelay,
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      lastError: null,
      cancelled: false,
    };

    this.queue.push(task);
    this.sortQueue();
    this.stats.submitted += 1;

    this.emit("task:submitted", { task: this.snapshot(task) });

    if (this.running) {
      this.process();
    }

    return task.id;
  }

  sortQueue() {
    this.queue.sort(
      (a, b) =>
        b.priority - a.priority ||
        a.createdAt - b.createdAt
    );
  }

  start() {
    if (this.destroyed) {
      throw new Error("Cannot start a destroyed orchestrator.");
    }

    if (this.running) return;

    this.running = true;
    this.emit("orchestrator:started");
    this.process();
  }

  stop() {
    this.running = false;
    this.emit("orchestrator:stopped");
  }

  async process() {
    if (!this.running || this.destroyed) return;

    while (
      this.running &&
      !this.destroyed &&
      this.active.size < this.options.maxConcurrent &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();

      if (!task || task.cancelled) continue;

      this.execute(task);
    }
  }

  async execute(task) {
    const handler = this.handlers.get(task.type);

    if (!handler || task.cancelled || this.destroyed) return;

    task.status = "running";
    task.startedAt = Date.now();

    const controller = new AbortController();
    const activeRecord = {
      task,
      controller,
      timeout: null,
    };

    this.active.set(task.id, activeRecord);

    this.emit("task:started", { task: this.snapshot(task) });

    let timeoutId;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();

          const error = new Error(
            `Recovery task exceeded ${this.options.taskTimeout}ms.`
          );

          error.name = "TimeoutError";
          reject(error);
        }, this.options.taskTimeout);
      });

      const result = await Promise.race([
        Promise.resolve().then(() =>
          handler(task.payload, {
            id: task.id,
            attempt: task.retries + 1,
            signal: controller.signal,
            createdAt: task.createdAt,
          })
        ),
        timeoutPromise,
      ]);

      if (task.cancelled || this.destroyed) return;

      task.status = "recovered";
      task.result = result;
      task.completedAt = Date.now();

      this.completed.push(this.snapshot(task));
      this.trimHistory(this.completed);

      this.stats.recovered += 1;

      this.emit("task:recovered", {
        task: this.snapshot(task),
        result,
      });
    } catch (error) {
      if (task.cancelled || this.destroyed) return;

      task.lastError = {
        name: error?.name || "Error",
        message: error?.message || String(error),
      };

      if (task.retries < task.maxRetries) {
        task.retries += 1;
        task.status = "retry_wait";
        this.stats.retries += 1;

        this.emit("task:retry", {
          task: this.snapshot(task),
          error: task.lastError,
        });

        await this.delay(task.retryDelay * task.retries);

        if (!task.cancelled && !this.destroyed) {
          task.status = "queued";
          task.startedAt = null;
          this.queue.push(task);
          this.sortQueue();
        }
      } else {
        task.status = "failed";
        task.completedAt = Date.now();

        this.failed.push(this.snapshot(task));
        this.trimHistory(this.failed);

        this.stats.failed += 1;

        this.emit("task:failed", {
          task: this.snapshot(task),
          error: task.lastError,
        });
      }
    } finally {
      clearTimeout(timeoutId);
      this.active.delete(task.id);

      if (!this.destroyed) {
        this.process();
      }
    }
  }

  delay(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  cancel(taskId) {
    const queuedIndex = this.queue.findIndex(
      (task) => task.id === taskId
    );

    if (queuedIndex !== -1) {
      const [task] = this.queue.splice(queuedIndex, 1);

      task.cancelled = true;
      task.status = "cancelled";
      task.completedAt = Date.now();

      this.stats.cancelled += 1;

      this.emit("task:cancelled", {
        task: this.snapshot(task),
      });

      return true;
    }

    const activeRecord = this.active.get(taskId);

    if (activeRecord) {
      activeRecord.task.cancelled = true;
      activeRecord.task.status = "cancelled";
      activeRecord.task.completedAt = Date.now();

      activeRecord.controller.abort();
      this.stats.cancelled += 1;

      this.emit("task:cancelled", {
        task: this.snapshot(activeRecord.task),
      });

      return true;
    }

    return false;
  }

  retry(taskId) {
    const task = this.failed.find((item) => item.id === taskId);

    if (!task) return false;

    const handlerExists = this.handlers.has(task.type);

    if (!handlerExists || this.destroyed) return false;

    this.failed = this.failed.filter((item) => item.id !== taskId);

    this.queue.push({
      ...task,
      status: "queued",
      retries: 0,
      startedAt: null,
      completedAt: null,
      lastError: null,
      cancelled: false,
    });

    this.sortQueue();

    this.emit("task:resubmitted", { taskId });

    if (this.running) {
      this.process();
    }

    return true;
  }

  trimHistory(collection) {
    const limit = 200;

    if (collection.length > limit) {
      collection.splice(0, collection.length - limit);
    }
  }

  snapshot(task) {
    return {
      id: task.id,
      type: task.type,
      payload: task.payload,
      priority: task.priority,
      retries: task.retries,
      maxRetries: task.maxRetries,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      lastError: task.lastError,
      cancelled: task.cancelled,
    };
  }

  getStats() {
    return {
      ...this.stats,
      queued: this.queue.length,
      active: this.active.size,
      completed: this.completed.length,
      permanentlyFailed: this.failed.length,
      running: this.running,
      destroyed: this.destroyed,
    };
  }

  getQueue() {
    return this.queue.map((task) => this.snapshot(task));
  }

  getActiveTasks() {
    return Array.from(this.active.values()).map(({ task }) =>
      this.snapshot(task)
    );
  }

  getCompletedTasks() {
    return this.completed.map((task) => ({ ...task }));
  }

  getFailedTasks() {
    return this.failed.map((task) => ({ ...task }));
  }

  clearQueue() {
    const removed = this.queue.length;

    for (const task of this.queue) {
      task.cancelled = true;
      task.status = "cancelled";
      this.stats.cancelled += 1;
    }

    this.queue = [];

    this.emit("queue:cleared", { removed });

    return removed;
  }

  destroy() {
    if (this.destroyed) return;

    this.running = false;
    this.destroyed = true;

    for (const { task, controller } of this.active.values()) {
      task.cancelled = true;
      controller.abort();
    }

    this.active.clear();
    this.queue = [];
    this.handlers.clear();

    this.emit("orchestrator:destroyed");
    this.listeners.clear();
  }
}

export default RecoveryOrchestrator;