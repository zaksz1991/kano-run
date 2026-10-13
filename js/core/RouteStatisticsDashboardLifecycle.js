import {
  RouteStatisticsDashboardEvents,
} from "./RouteStatisticsDashboardEvents.js";

export class RouteStatisticsDashboardLifecycle {
  constructor({
    controller = null,
    dashboard = null,
    eventDispatcher = null,
    logger = console,
    disposeController = true,
  } = {}) {
    this.controller = controller;
    this.dashboard = dashboard ?? controller?.dashboard ?? null;
    this.eventDispatcher = eventDispatcher;
    this.logger = logger;
    this.disposeController = Boolean(disposeController);

    this.state = "created";
    this.startedAt = null;
    this.stoppedAt = null;
    this.disposedAt = null;
    this.transitionHistory = [];
    this.disposed = false;
  }

  start(options = {}) {
    this.assertActive();

    if (this.state === "running") {
      return this;
    }

    if (this.state === "stopped") {
      this.recordTransition("running", "restarted");
    } else {
      this.recordTransition("running", "started");
    }

    this.startedAt = Date.now();
    this.stoppedAt = null;

    try {
      if (this.controller && typeof this.controller.start === "function") {
        this.controller.start(options);
      }

      this.emit(RouteStatisticsDashboardEvents.STARTED, {
        startedAt: this.startedAt,
      });

      return this;
    } catch (error) {
      this.recordTransition("error", "start_failed");
      this.logError("Failed to start dashboard lifecycle.", error);
      throw error;
    }
  }

  stop() {
    this.assertActive();

    if (this.state === "stopped" || this.state === "created") {
      if (this.state === "created") {
        this.recordTransition("stopped", "stopped_before_start");
      }

      this.stoppedAt = Date.now();
      return this;
    }

    if (this.controller && typeof this.controller.stop === "function") {
      try {
        this.controller.stop();
      } catch (error) {
        this.logError("Failed to stop dashboard controller.", error);
      }
    }

    this.stoppedAt = Date.now();
    this.recordTransition("stopped", "stopped");

    this.emit(RouteStatisticsDashboardEvents.STOPPED, {
      stoppedAt: this.stoppedAt,
    });

    return this;
  }

  restart(options = {}) {
    this.assertActive();

    if (this.state === "running") {
      this.stop();
    }

    return this.start(options);
  }

  recordTransition(nextState, reason) {
    const previousState = this.state;

    this.state = nextState;

    this.transitionHistory.push({
      previousState,
      nextState,
      reason,
      timestamp: Date.now(),
    });

    if (this.transitionHistory.length > 100) {
      this.transitionHistory.shift();
    }
  }

  emit(eventName, payload) {
    if (!this.eventDispatcher) {
      return;
    }

    try {
      if (typeof this.eventDispatcher.emit === "function") {
        this.eventDispatcher.emit(eventName, payload, {
          source: "dashboard-lifecycle",
        });
      }
    } catch (error) {
      this.logError(`Failed to emit "${eventName}".`, error);
    }
  }

  getState() {
    return {
      state: this.state,
      disposed: this.disposed,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      disposedAt: this.disposedAt,
      uptime:
        this.state === "running" && this.startedAt !== null
          ? Math.max(0, Date.now() - this.startedAt)
          : 0,
      transitions: this.transitionHistory.map((transition) => ({
        ...transition,
      })),
    };
  }

  isRunning() {
    return this.state === "running" && !this.disposed;
  }

  isStopped() {
    return this.state === "stopped";
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardLifecycle] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardLifecycle has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.state === "running") {
      this.stop();
    }

    if (
      this.disposeController &&
      this.controller &&
      typeof this.controller.dispose === "function"
    ) {
      try {
        this.controller.dispose();
      } catch (error) {
        this.logError("Failed to dispose dashboard controller.", error);
      }
    }

    this.disposedAt = Date.now();
    this.recordTransition("disposed", "disposed");

    this.emit(RouteStatisticsDashboardEvents.DISPOSED, {
      disposedAt: this.disposedAt,
    });

    this.disposed = true;
    this.controller = null;
    this.dashboard = null;
    this.eventDispatcher = null;
  }
}

export function createRouteStatisticsDashboardLifecycle(options = {}) {
  return new RouteStatisticsDashboardLifecycle(options);
}

export default RouteStatisticsDashboardLifecycle;