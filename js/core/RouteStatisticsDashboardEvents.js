export const RouteStatisticsDashboardEvents = Object.freeze({
  INITIALIZED: "route-statistics:initialized",
  STARTED: "route-statistics:started",
  STOPPED: "route-statistics:stopped",
  REFRESH_REQUESTED: "route-statistics:refresh-requested",
  REFRESH_STARTED: "route-statistics:refresh-started",
  REFRESH_COMPLETED: "route-statistics:refresh-completed",
  REFRESH_FAILED: "route-statistics:refresh-failed",
  FILTER_CHANGED: "route-statistics:filter-changed",
  SNAPSHOT_UPDATED: "route-statistics:snapshot-updated",
  EXPORT_REQUESTED: "route-statistics:export-requested",
  EXPORT_COMPLETED: "route-statistics:export-completed",
  DISPOSED: "route-statistics:disposed",
});

export class RouteStatisticsDashboardEventDetail {
  constructor({
    type,
    timestamp = Date.now(),
    source = "dashboard",
    payload = null,
  } = {}) {
    if (!type || typeof type !== "string") {
      throw new TypeError(
        "Dashboard event detail requires a valid event type.",
      );
    }

    this.type = type;
    this.timestamp = timestamp;
    this.source = source;
    this.payload = payload;
  }

  toObject() {
    return {
      type: this.type,
      timestamp: this.timestamp,
      source: this.source,
      payload: this.payload,
    };
  }
}

export class RouteStatisticsDashboardEventDispatcher {
  constructor({
    eventBus = null,
    logger = console,
    historyLimit = 100,
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.historyLimit = Math.max(
      1,
      Math.floor(Number(historyLimit) || 100),
    );

    this.listeners = new Map();
    this.history = [];
    this.disposed = false;
  }

  on(eventName, listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Event listener must be a function.");
    }

    const name = String(eventName);
    let listeners = this.listeners.get(name);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(name, listeners);
    }

    listeners.add(listener);

    return () => this.off(name, listener);
  }

  once(eventName, listener) {
    this.assertActive();

    let unsubscribe = null;

    const wrapped = (event) => {
      unsubscribe?.();
      listener(event);
    };

    unsubscribe = this.on(eventName, wrapped);

    return unsubscribe;
  }

  off(eventName, listener) {
    const listeners = this.listeners.get(String(eventName));

    if (!listeners) {
      return false;
    }

    const removed = listeners.delete(listener);

    if (listeners.size === 0) {
      this.listeners.delete(String(eventName));
    }

    return removed;
  }

  emit(eventName, payload = null, options = {}) {
    this.assertActive();

    const name = String(eventName);

    const detail = new RouteStatisticsDashboardEventDetail({
      type: name,
      timestamp: Date.now(),
      source: options.source ?? "dashboard",
      payload,
    });

    this.history.push(detail.toObject());

    if (this.history.length > this.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.historyLimit,
      );
    }

    const listeners = [
      ...(this.listeners.get(name) ?? []),
      ...(this.listeners.get("*") ?? []),
    ];

    for (const listener of new Set(listeners)) {
      try {
        listener(detail);
      } catch (error) {
        this.logError(
          `Listener failed for dashboard event "${name}".`,
          error,
        );
      }
    }

    this.emitToExternalBus(name, detail);

    return detail;
  }

  emitToExternalBus(eventName, detail) {
    if (!this.eventBus) {
      return;
    }

    try {
      if (typeof this.eventBus.emit === "function") {
        this.eventBus.emit(eventName, detail);
        return;
      }

      if (typeof this.eventBus.dispatch === "function") {
        this.eventBus.dispatch(eventName, detail);
        return;
      }

      if (typeof this.eventBus.publish === "function") {
        this.eventBus.publish(eventName, detail);
      }
    } catch (error) {
      this.logError(
        `External event dispatch failed for "${eventName}".`,
        error,
      );
    }
  }

  getHistory({
    eventName = null,
    limit = this.historyLimit,
    newestFirst = true,
  } = {}) {
    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    let entries = this.history;

    if (eventName) {
      entries = entries.filter(
        (event) => event.type === eventName,
      );
    }

    if (newestFirst) {
      entries = [...entries].reverse();
    } else {
      entries = [...entries];
    }

    return safeLimit === 0
      ? []
      : entries.slice(0, safeLimit).map((event) => ({
          ...event,
        }));
  }

  clearHistory() {
    this.assertActive();
    this.history.length = 0;
  }

  listenerCount(eventName) {
    return this.listeners.get(String(eventName))?.size ?? 0;
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardEvents] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardEventDispatcher has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.listeners.clear();
    this.history.length = 0;
    this.eventBus = null;
  }
}

export function createRouteStatisticsDashboardEvents(options = {}) {
  return new RouteStatisticsDashboardEventDispatcher(options);
}

export default RouteStatisticsDashboardEventDispatcher;