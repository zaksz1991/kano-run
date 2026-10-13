import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  intervalMs: 60000,
  runImmediately: false,
  maxRetries: 3,
  retryDelayMs: 2000,
  unrefTimers: true,
};

export class RouteStatisticsScheduler {
  constructor({
    statisticsManager = null,
    reportManager = null,
    eventBus = EventBus,
    logger = Logger,
    options = {},
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.reportManager = reportManager;
    this.eventBus = eventBus;
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.timer = null;
    this.retryTimer = null;
    this.running = false;
    this.disposed = false;
    this.generation = 0;
    this.lastRunAt = null;
    this.lastResult = null;
    this.lastError = null;
    this.runPromise = null;
    this.listeners = new Set();
  }

  start() {
    this.assertActive();

    if (this.running) {
      return false;
    }

    this.running = true;
    this.generation += 1;

    const generation = this.generation;

    this.emit("route:statistics:scheduler:started", {
      intervalMs: this.options.intervalMs,
    });

    if (this.options.runImmediately) {
      void this.runNow().catch(() => {});
    }

    this.scheduleNext(generation);

    return true;
  }

  stop() {
    if (this.disposed || !this.running) {
      return false;
    }

    this.running = false;
    this.generation += 1;

    this.clearTimers();

    this.emit("route:statistics:scheduler:stopped", {
      stoppedAt: Date.now(),
    });

    return true;
  }

  scheduleNext(generation) {
    if (!this.running || this.disposed || generation !== this.generation) {
      return;
    }

    this.clearIntervalTimer();

    const delay = Math.max(1000, Number(this.options.intervalMs) || 60000);

    this.timer = setTimeout(async () => {
      this.timer = null;

      if (!this.running || this.disposed || generation !== this.generation) {
        return;
      }

      try {
        await this.runNow();
      } catch {
        // runNow records and emits failures.
      }

      if (this.running && generation === this.generation) {
        this.scheduleNext(generation);
      }
    }, delay);

    if (this.options.unrefTimers && typeof this.timer?.unref === "function") {
      this.timer.unref();
    }
  }

  async runNow({ force = false } = {}) {
    this.assertActive();

    if (this.runPromise) {
      return this.runPromise;
    }

    if (!this.running && !force) {
      return {
        skipped: true,
        reason: "scheduler_stopped",
      };
    }

    const generation = this.generation;

    this.runPromise = this.executeRun(generation);

    try {
      return await this.runPromise;
    } finally {
      this.runPromise = null;
    }
  }

  async executeRun(generation) {
    const startedAt = Date.now();

    this.emit("route:statistics:scheduler:run-started", {
      startedAt,
    });

    let attempt = 0;

    while (attempt <= this.options.maxRetries) {
      if (this.disposed || (this.running && generation !== this.generation)) {
        return {
          skipped: true,
          reason: "scheduler_stopped",
        };
      }

      try {
        const result = await this.collectStatistics();

        if (this.disposed || (this.running && generation !== this.generation)) {
          return {
            skipped: true,
            reason: "scheduler_stopped",
          };
        }

        this.lastRunAt = Date.now();
        this.lastResult = result;
        this.lastError = null;

        const payload = {
          startedAt,
          completedAt: this.lastRunAt,
          durationMs: this.lastRunAt - startedAt,
          result,
          attempt,
        };

        this.emit("route:statistics:scheduler:run-completed", payload);
        this.notifyListeners({
          type: "completed",
          ...payload,
        });

        return payload;
      } catch (error) {
        this.lastError = error;
        attempt += 1;

        if (attempt > this.options.maxRetries) {
          const payload = {
            startedAt,
            failedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            attempts: attempt,
            error: this.serializeError(error),
          };

          this.emit("route:statistics:scheduler:run-failed", payload);
          this.notifyListeners({
            type: "failed",
            ...payload,
          });

          this.logger?.error?.(
            "RouteStatisticsScheduler: statistics collection failed.",
            error,
          );

          throw error;
        }

        await this.delay(
          Math.max(0, Number(this.options.retryDelayMs) || 0) * attempt,
        );
      }
    }

    throw new Error("Route statistics collection exhausted its retry limit.");
  }

  async collectStatistics() {
    let statistics = null;
    let report = null;

    if (this.statisticsManager) {
      if (typeof this.statisticsManager.refresh === "function") {
        statistics = await this.statisticsManager.refresh();
      } else if (typeof this.statisticsManager.update === "function") {
        statistics = await this.statisticsManager.update();
      } else if (typeof this.statisticsManager.getStatistics === "function") {
        statistics = await this.statisticsManager.getStatistics();
      }
    }

    if (this.reportManager) {
      if (typeof this.reportManager.generate === "function") {
        report = await this.reportManager.generate();
      } else if (typeof this.reportManager.createReport === "function") {
        report = await this.reportManager.createReport();
      }
    }

    const result = {
      collectedAt: new Date().toISOString(),
      statistics,
      report,
    };

    this.emit("route:statistics:snapshot", result);

    return result;
  }

  delay(milliseconds) {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }

      this.clearRetryTimer();

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        resolve();
      }, milliseconds);

      if (
        this.options.unrefTimers &&
        typeof this.retryTimer?.unref === "function"
      ) {
        this.retryTimer.unref();
      }
    });
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger?.warn?.(
          "RouteStatisticsScheduler: listener failed.",
          error,
        );
      }
    }
  }

  getStatus() {
    return {
      running: this.running,
      disposed: this.disposed,
      intervalMs: this.options.intervalMs,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError
        ? this.serializeError(this.lastError)
        : null,
      isCollecting: Boolean(this.runPromise),
    };
  }

  clearIntervalTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  clearRetryTimer() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  clearTimers() {
    this.clearIntervalTimer();
    this.clearRetryTimer();
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  emit(eventName, payload) {
    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(eventName, payload);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(eventName, payload);
      }
    } catch (error) {
      this.logger?.warn?.(
        `RouteStatisticsScheduler: failed to emit ${eventName}.`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsScheduler has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.running = false;
    this.generation += 1;
    this.clearTimers();
    this.listeners.clear();

    this.statisticsManager = null;
    this.reportManager = null;
    this.eventBus = null;
    this.disposed = true;
  }
}

export default RouteStatisticsScheduler;