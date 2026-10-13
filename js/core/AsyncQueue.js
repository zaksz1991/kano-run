class AsyncQueue {
  #tasks = [];
  #running = false;
  #paused = false;
  #destroyed = false;
  #concurrency;
  #activeCount = 0;
  #completedCount = 0;
  #failedCount = 0;
  #taskId = 0;
  #maxQueueSize;
  #listeners = new Map();

  constructor(options = {}) {
    const {
      concurrency = 1,
      maxQueueSize = Infinity,
    } = options;

    this.#concurrency = Math.max(
      1,
      Math.floor(Number(concurrency) || 1)
    );

    this.#maxQueueSize =
      maxQueueSize === Infinity
        ? Infinity
        : Math.max(1, Math.floor(Number(maxQueueSize) || 1));
  }

  get size() {
    return this.#tasks.length;
  }

  get activeCount() {
    return this.#activeCount;
  }

  get completedCount() {
    return this.#completedCount;
  }

  get failedCount() {
    return this.#failedCount;
  }

  get paused() {
    return this.#paused;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get idle() {
    return this.#tasks.length === 0 && this.#activeCount === 0;
  }

  get concurrency() {
    return this.#concurrency;
  }

  enqueue(task, options = {}) {
    this.#assertActive();

    if (typeof task !== "function") {
      throw new TypeError("AsyncQueue.enqueue expects a function.");
    }

    if (this.#tasks.length >= this.#maxQueueSize) {
      throw new Error("AsyncQueue has reached its maximum queue size.");
    }

    const id = ++this.#taskId;

    return new Promise((resolve, reject) => {
      this.#tasks.push({
        id,
        task,
        resolve,
        reject,
        priority: Number(options.priority) || 0,
        label: options.label || `task-${id}`,
        signal: options.signal || null,
      });

      this.#tasks.sort((a, b) => b.priority - a.priority);

      this.#emit("queued", { id, label: options.label || `task-${id}` });

      this.#process();
    });
  }

  pause() {
    this.#paused = true;
    this.#emit("paused");
    return this;
  }

  resume() {
    this.#assertActive();

    this.#paused = false;
    this.#emit("resumed");
    this.#process();

    return this;
  }

  setConcurrency(value) {
    const concurrency = Math.floor(Number(value));

    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new RangeError("Concurrency must be a positive integer.");
    }

    this.#concurrency = concurrency;
    this.#process();

    return this;
  }

  clear(reason = new Error("AsyncQueue cleared.")) {
    const pending = this.#tasks.splice(0);

    for (const item of pending) {
      item.reject(reason);
      this.#emit("cancelled", {
        id: item.id,
        label: item.label,
        reason,
      });
    }

    return pending.length;
  }

  on(event, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }

    this.#listeners.get(event).add(listener);

    return () => {
      this.#listeners.get(event)?.delete(listener);
    };
  }

  async onIdle() {
    if (this.idle) {
      return;
    }

    await new Promise((resolve) => {
      const unsubscribe = this.on("idle", () => {
        unsubscribe();
        resolve();
      });
    });
  }

  getStats() {
    return {
      queued: this.#tasks.length,
      active: this.#activeCount,
      completed: this.#completedCount,
      failed: this.#failedCount,
      concurrency: this.#concurrency,
      paused: this.#paused,
      destroyed: this.#destroyed,
    };
  }

  async #process() {
    if (this.#running || this.#paused || this.#destroyed) {
      return;
    }

    this.#running = true;

    try {
      while (
        !this.#paused &&
        !this.#destroyed &&
        this.#activeCount < this.#concurrency &&
        this.#tasks.length > 0
      ) {
        const item = this.#tasks.shift();

        if (item.signal?.aborted) {
          item.reject(
            item.signal.reason || new Error("Task aborted.")
          );

          this.#emit("cancelled", {
            id: item.id,
            label: item.label,
          });

          continue;
        }

        this.#runTask(item);
      }
    } finally {
      this.#running = false;
      this.#checkIdle();
    }
  }

  async #runTask(item) {
    this.#activeCount++;

    this.#emit("started", {
      id: item.id,
      label: item.label,
    });

    try {
      const result = await item.task({
        id: item.id,
        label: item.label,
        signal: item.signal,
      });

      item.resolve(result);
      this.#completedCount++;

      this.#emit("completed", {
        id: item.id,
        label: item.label,
        result,
      });
    } catch (error) {
      item.reject(error);
      this.#failedCount++;

      this.#emit("failed", {
        id: item.id,
        label: item.label,
        error,
      });
    } finally {
      this.#activeCount--;
      this.#process();
      this.#checkIdle();
    }
  }

  #checkIdle() {
    if (this.idle) {
      this.#emit("idle");
    }
  }

  #emit(event, payload = {}) {
    for (const listener of this.#listeners.get(event) || []) {
      try {
        listener(payload);
      } catch (error) {
        if (typeof console !== "undefined" && console.error) {
          console.error("AsyncQueue listener failed:", error);
        }
      }
    }
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error("AsyncQueue has been destroyed.");
    }
  }

  destroy(options = {}) {
    if (this.#destroyed) {
      return;
    }

    const { clearPending = true } = options;

    this.#paused = true;

    if (clearPending) {
      this.clear(new Error("AsyncQueue destroyed."));
    }

    this.#destroyed = true;
    this.#listeners.clear();
  }
}

export { AsyncQueue };
export default AsyncQueue;