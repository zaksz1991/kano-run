import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  maxSchedulers: 100,
  autoStart: false,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRegistry {
  constructor({
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.config = { ...DEFAULTS, ...config };
    this.schedulers = new Map();
    this.disposed = false;
  }

  register(id, scheduler, { replace = false, start } = {}) {
    this.assertActive();

    const key = this.normalizeId(id);

    if (!scheduler || typeof scheduler.start !== "function") {
      throw new TypeError("A valid recovery scheduler is required.");
    }

    if (this.schedulers.has(key) && !replace) {
      throw new Error(`Recovery scheduler "${key}" is already registered.`);
    }

    if (
      !this.schedulers.has(key) &&
      this.schedulers.size >= this.config.maxSchedulers
    ) {
      throw new Error("Maximum registered recovery schedulers reached.");
    }

    if (this.schedulers.has(key)) {
      const previous = this.schedulers.get(key);

      if (previous.scheduler !== scheduler) {
        previous.scheduler.stop?.();
      }
    }

    this.schedulers.set(key, {
      id: key,
      scheduler,
      registeredAt: Date.now(),
    });

    const shouldStart = start ?? this.config.autoStart;

    if (shouldStart) {
      scheduler.start();
    }

    this.emit("registered", {
      id: key,
      started: Boolean(shouldStart),
      count: this.schedulers.size,
    });

    return scheduler;
  }

  unregister(id, { stop = true, dispose = false } = {}) {
    this.assertActive();

    const key = this.normalizeId(id);
    const entry = this.schedulers.get(key);

    if (!entry) {
      return false;
    }

    if (stop) {
      entry.scheduler.stop?.();
    }

    if (dispose) {
      entry.scheduler.dispose?.();
    }

    this.schedulers.delete(key);

    this.emit("unregistered", {
      id: key,
      count: this.schedulers.size,
    });

    return true;
  }

  get(id) {
    const key = this.normalizeId(id);
    return this.schedulers.get(key)?.scheduler ?? null;
  }

  getEntry(id) {
    const key = this.normalizeId(id);
    const entry = this.schedulers.get(key);

    return entry ? { ...entry } : null;
  }

  has(id) {
    return this.schedulers.has(this.normalizeId(id));
  }

  start(id, options = {}) {
    this.assertActive();

    const scheduler = this.get(id);

    if (!scheduler) {
      return {
        success: false,
        id: this.normalizeId(id),
        reason: "Scheduler not found.",
      };
    }

    const started = scheduler.start(options);

    this.emit("scheduler-started", {
      id: this.normalizeId(id),
      started,
    });

    return {
      success: Boolean(started),
      id: this.normalizeId(id),
    };
  }

  stop(id) {
    this.assertActive();

    const scheduler = this.get(id);

    if (!scheduler) {
      return {
        success: false,
        id: this.normalizeId(id),
        reason: "Scheduler not found.",
      };
    }

    const stopped = scheduler.stop();

    this.emit("scheduler-stopped", {
      id: this.normalizeId(id),
      stopped,
    });

    return {
      success: Boolean(stopped),
      id: this.normalizeId(id),
    };
  }

  startAll({ immediate = false } = {}) {
    this.assertActive();

    const results = [];

    for (const [id, entry] of this.schedulers) {
      try {
        results.push({
          id,
          success: Boolean(entry.scheduler.start({ immediate })),
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: this.serializeError(error),
        });

        this.log("error", "Failed to start recovery scheduler.", {
          id,
          error: this.serializeError(error),
        });
      }
    }

    this.emit("all-started", {
      total: results.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
    });

    return results;
  }

  stopAll() {
    this.assertActive();

    const results = [];

    for (const [id, entry] of this.schedulers) {
      try {
        results.push({
          id,
          success: Boolean(entry.scheduler.stop()),
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: this.serializeError(error),
        });

        this.log("error", "Failed to stop recovery scheduler.", {
          id,
          error: this.serializeError(error),
        });
      }
    }

    this.emit("all-stopped", {
      total: results.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
    });

    return results;
  }

  getStatuses() {
    return [...this.schedulers.entries()].map(([id, entry]) => {
      let status = null;

      try {
        status = entry.scheduler.getStatus?.() ?? null;
      } catch (error) {
        status = {
          error: this.serializeError(error),
        };
      }

      return {
        id,
        registeredAt: entry.registeredAt,
        status,
      };
    });
  }

  getRunning() {
    return this.getStatuses().filter(
      (entry) => entry.status?.running === true,
    );
  }

  getSummary() {
    const statuses = this.getStatuses();

    return {
      total: statuses.length,
      running: statuses.filter(
        (entry) => entry.status?.running === true,
      ).length,
      idle: statuses.filter(
        (entry) => entry.status?.running !== true,
      ).length,
      disposed: statuses.filter(
        (entry) => entry.status?.disposed === true,
      ).length,
      runCount: statuses.reduce(
        (total, entry) => total + (entry.status?.runCount ?? 0),
        0,
      ),
      failureCount: statuses.reduce(
        (total, entry) => total + (entry.status?.failureCount ?? 0),
        0,
      ),
    };
  }

  clear({ stop = true, dispose = false } = {}) {
    this.assertActive();

    const ids = [...this.schedulers.keys()];

    for (const id of ids) {
      this.unregister(id, { stop, dispose });
    }

    return {
      cleared: ids.length,
      remaining: this.schedulers.size,
    };
  }

  normalizeId(id) {
    if (id === null || id === undefined || String(id).trim() === "") {
      throw new TypeError("A non-empty scheduler ID is required.");
    }

    return String(id).trim();
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-registry:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit registry event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Logging failures must not interrupt registry operations.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRegistry has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.clear({ stop: true, dispose: true });
    this.disposed = true;

    this.emit("disposed", {
      at: Date.now(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRegistry;