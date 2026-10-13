import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  ENQUEUED: "route-statistics-alert-queue:enqueued",
  PROCESSING: "route-statistics-alert-queue:processing",
  PROCESSED: "route-statistics-alert-queue:processed",
  FAILED: "route-statistics-alert-queue:failed",
  CLEARED: "route-statistics-alert-queue:cleared",
  DISPOSED: "route-statistics-alert-queue:disposed",
});

export class RouteStatisticsDashboardAlertQueue {
  constructor({
    processor,
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    maxQueueSize = 500,
    maxRetries = 2,
    retryDelayMs = 1000,
    autoStart = false,
  } = {}) {
    if (processor && typeof processor.process !== "function") {
      throw new TypeError("Processor must expose a process() method.");
    }

    this.processor = processor ?? null;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.maxQueueSize = Math.max(
      1,
      Math.floor(Number(maxQueueSize) || 500)
    );
    this.maxRetries = Math.max(0, Math.floor(Number(maxRetries) || 0));
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);

    this.items = [];
    this.sequence = 0;
    this.processedCount = 0;
    this.failedCount = 0;
    this.droppedCount = 0;
    this.processing = false;
    this.started = Boolean(autoStart);
    this.disposed = false;
    this.drainPromise = null;
  }

  enqueue(payload, metadata = {}) {
    this.assertActive();

    if (payload === undefined) {
      throw new TypeError("Queue payload cannot be undefined.");
    }

    if (this.items.length >= this.maxQueueSize) {
      this.droppedCount += 1;

      return {
        accepted: false,
        reason: "queue-full",
        queueSize: this.items.length,
      };
    }

    const item = {
      id: `alert-queue-${++this.sequence}-${this.clock()}`,
      payload,
      metadata: { ...metadata },
      enqueuedAt: this.clock(),
      attempts: 0,
      status: "queued",
    };

    this.items.push(item);

    this.emit(EVENTS.ENQUEUED, {
      id: item.id,
      queueSize: this.items.length,
    });

    if (this.started) {
      void this.drain();
    }

    return {
      accepted: true,
      id: item.id,
      queueSize: this.items.length,
    };
  }

  start() {
    this.assertActive();
    this.started = true;
    return this.drain();
  }

  stop() {
    this.assertActive();
    this.started = false;
  }

  async drain() {
    this.assertActive();

    if (!this.started || this.processing) {
      return this.drainPromise ?? {
        processed: 0,
        remaining: this.items.length,
      };
    }

    if (!this.processor) {
      throw new Error("No queue processor has been configured.");
    }

    this.processing = true;

    const task = this.processQueue();
    this.drainPromise = task;

    try {
      return await task;
    } finally {
      this.processing = false;
      this.drainPromise = null;

      if (this.started && this.items.length > 0 && !this.disposed) {
        queueMicrotask(() => {
          if (this.started && !this.disposed) {
            void this.drain();
          }
        });
      }
    }
  }

  async processQueue() {
    let processedThisRun = 0;

    while (this.started && this.items.length > 0 && !this.disposed) {
      const item = this.items[0];

      item.attempts += 1;
      item.status = "processing";

      this.emit(EVENTS.PROCESSING, {
        id: item.id,
        attempt: item.attempts,
        queueSize: this.items.length,
      });

      try {
        const result = await this.processor.process(
          item.payload,
          {
            ...item.metadata,
            queueItemId: item.id,
            enqueuedAt: item.enqueuedAt,
            attempt: item.attempts,
          }
        );

        if (result?.skipped) {
          item.status = "queued";
          break;
        }

        if (result?.success === false) {
          throw new Error(result.error ?? "Queue item processing failed.");
        }

        this.items.shift();
        this.processedCount += 1;
        processedThisRun += 1;

        this.emit(EVENTS.PROCESSED, {
          id: item.id,
          result,
          queueSize: this.items.length,
        });
      } catch (error) {
        if (item.attempts <= this.maxRetries) {
          item.status = "queued";

          if (this.retryDelayMs > 0) {
            await this.delay(this.retryDelayMs * item.attempts);
          }

          if (!this.started || this.disposed) break;
        } else {
          this.items.shift();
          this.failedCount += 1;

          this.emit(EVENTS.FAILED, {
            id: item.id,
            attempts: item.attempts,
            error: error?.message ?? String(error),
            queueSize: this.items.length,
          });

          this.logError(`Queue item "${item.id}" failed.`, error);
        }
      }
    }

    return {
      processed: processedThisRun,
      remaining: this.items.length,
      started: this.started,
    };
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  peek() {
    const item = this.items[0];

    return item
      ? {
          id: item.id,
          metadata: { ...item.metadata },
          enqueuedAt: item.enqueuedAt,
          attempts: item.attempts,
          status: item.status,
        }
      : null;
  }

  getItems() {
    return this.items.map((item) => ({
      id: item.id,
      payload: item.payload,
      metadata: { ...item.metadata },
      enqueuedAt: item.enqueuedAt,
      attempts: item.attempts,
      status: item.status,
    }));
  }

  remove(id) {
    this.assertActive();

    const index = this.items.findIndex((item) => item.id === id);

    if (index === -1) return false;
    if (index === 0 && this.processing) return false;

    this.items.splice(index, 1);
    return true;
  }

  clear({ includeProcessing = false } = {}) {
    this.assertActive();

    if (this.processing && !includeProcessing) {
      this.items = this.items.filter(
        (item) => item.status === "processing"
      );
    } else {
      this.items = [];
    }

    this.emit(EVENTS.CLEARED, {
      queueSize: this.items.length,
      clearedAt: this.clock(),
    });

    return this.items.length;
  }

  setProcessor(processor) {
    this.assertActive();

    if (!processor || typeof processor.process !== "function") {
      throw new TypeError("Processor must expose a process() method.");
    }

    this.processor = processor;

    if (this.started) {
      void this.drain();
    }
  }

  getStats() {
    return {
      queueSize: this.items.length,
      maxQueueSize: this.maxQueueSize,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      droppedCount: this.droppedCount,
      processing: this.processing,
      started: this.started,
      disposed: this.disposed,
    };
  }

  subscribe(event, handler) {
    this.assertActive();

    if (typeof handler !== "function") {
      throw new TypeError("Event handler must be a function.");
    }

    if (typeof this.eventBus.on !== "function") {
      throw new Error(
        "The configured event bus does not support subscriptions."
      );
    }

    return this.eventBus.on(event, handler);
  }

  emit(event, payload) {
    try {
      if (typeof this.eventBus.emit === "function") {
        this.eventBus.emit(event, payload);
      } else if (typeof this.eventBus.publish === "function") {
        this.eventBus.publish(event, payload);
      }
    } catch (error) {
      this.logError(`Failed to emit "${event}".`, error);
    }
  }

  logError(message, error) {
    try {
      this.logger.error?.(message, error);
    } catch {
      // Logging failures must not interrupt queue processing.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertQueue has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.started = false;
    this.disposed = true;
    this.items = [];

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export { EVENTS as RouteStatisticsDashboardAlertQueueEvents };

export default RouteStatisticsDashboardAlertQueue;