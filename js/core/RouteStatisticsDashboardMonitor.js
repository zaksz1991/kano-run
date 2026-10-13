import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  STARTED: "routeStatisticsMonitor:started",
  STOPPED: "routeStatisticsMonitor:stopped",
  CHECKED: "routeStatisticsMonitor:checked",
  WARNING: "routeStatisticsMonitor:warning",
  ERROR: "routeStatisticsMonitor:error",
});

export class RouteStatisticsDashboardMonitor {
  constructor({
    dashboard,
    controller = null,
    eventBus = null,
    logger = null,
    intervalMs = 15000,
    staleAfterMs = 60000,
    warningThreshold = 1,
    autoStart = false,
  } = {}) {
    if (!dashboard) {
      throw new TypeError(
        "RouteStatisticsDashboardMonitor requires a dashboard."
      );
    }

    this.dashboard = dashboard;
    this.controller = controller;
    this.eventBus = eventBus ?? new EventBus();
    this.logger = logger ?? new Logger("RouteStatisticsDashboardMonitor");

    this.intervalMs = Math.max(1000, Number(intervalMs) || 15000);
    this.staleAfterMs = Math.max(1000, Number(staleAfterMs) || 60000);
    this.warningThreshold = Math.max(
      0,
      Number(warningThreshold) || 0
    );

    this.timer = null;
    this.running = false;
    this.disposed = false;
    this.checkInProgress = false;
    this.lastCheckAt = null;
    this.lastHealthyAt = null;
    this.lastResult = null;
    this.consecutiveWarnings = 0;
    this.totalChecks = 0;
    this.totalWarnings = 0;
    this.totalErrors = 0;
    this.listeners = new Set();

    if (autoStart) {
      this.start();
    }
  }

  start() {
    this.assertActive();

    if (this.running) {
      return false;
    }

    this.running = true;

    this.timer = globalThis.setInterval(() => {
      this.check().catch((error) => {
        this.reportError(error);
      });
    }, this.intervalMs);

    this.emit(EVENTS.STARTED, {
      intervalMs: this.intervalMs,
      startedAt: new Date().toISOString(),
    });

    this.check().catch((error) => {
      this.reportError(error);
    });

    return true;
  }

  stop() {
    if (!this.running) {
      return false;
    }

    this.running = false;

    if (this.timer !== null) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }

    this.emit(EVENTS.STOPPED, {
      stoppedAt: new Date().toISOString(),
      totalChecks: this.totalChecks,
    });

    return true;
  }

  async check() {
    this.assertActive();

    if (this.checkInProgress) {
      return {
        skipped: true,
        reason: "check_in_progress",
        checkedAt: this.lastCheckAt,
      };
    }

    this.checkInProgress = true;
    const startedAt = Date.now();

    try {
      const snapshot = await this.readSnapshot();
      const issues = this.inspectSnapshot(snapshot);
      const checkedAt = new Date().toISOString();

      this.lastCheckAt = checkedAt;
      this.totalChecks += 1;

      const result = {
        healthy: issues.length === 0,
        checkedAt,
        durationMs: Date.now() - startedAt,
        issues,
        snapshot,
        consecutiveWarnings: issues.length
          ? this.consecutiveWarnings + 1
          : 0,
      };

      if (issues.length > 0) {
        this.consecutiveWarnings += 1;
        this.totalWarnings += 1;

        this.emit(EVENTS.WARNING, {
          issues,
          consecutiveWarnings: this.consecutiveWarnings,
          checkedAt,
        });
      } else {
        this.consecutiveWarnings = 0;
        this.lastHealthyAt = checkedAt;
      }

      this.lastResult = result;

      this.emit(EVENTS.CHECKED, {
        ...result,
        snapshot: undefined,
      });

      if (
        this.warningThreshold > 0 &&
        this.consecutiveWarnings >= this.warningThreshold
      ) {
        this.logger?.warn?.(
          "Route statistics dashboard health warning.",
          {
            issues,
            consecutiveWarnings: this.consecutiveWarnings,
          }
        );
      }

      return result;
    } catch (error) {
      this.totalErrors += 1;
      this.reportError(error);
      throw error;
    } finally {
      this.checkInProgress = false;
    }
  }

  async readSnapshot() {
    if (this.controller?.getState) {
      return this.controller.getState();
    }

    if (this.dashboard?.getDashboard) {
      return this.dashboard.getDashboard();
    }

    if (this.dashboard?.getSnapshot) {
      return this.dashboard.getSnapshot();
    }

    throw new Error(
      "Dashboard does not expose getState(), getDashboard(), or getSnapshot()."
    );
  }

  inspectSnapshot(snapshot) {
    const issues = [];

    if (snapshot == null || typeof snapshot !== "object") {
      return ["Dashboard snapshot is missing or invalid."];
    }

    if (snapshot.error) {
      issues.push(`Dashboard reports an error: ${String(snapshot.error)}`);
    }

    const timestamp =
      snapshot.lastRefreshAt ??
      snapshot.refreshedAt ??
      snapshot.updatedAt ??
      null;

    if (timestamp) {
      const parsedTimestamp = Date.parse(timestamp);

      if (Number.isNaN(parsedTimestamp)) {
        issues.push("Dashboard refresh timestamp is invalid.");
      } else if (Date.now() - parsedTimestamp > this.staleAfterMs) {
        issues.push("Dashboard data is stale.");
      }
    } else if (this.lastHealthyAt === null && this.totalChecks > 0) {
      issues.push("Dashboard has no known refresh timestamp.");
    }

    if (snapshot.healthy === false || snapshot.status === "error") {
      issues.push("Dashboard health status is unhealthy.");
    }

    if (
      snapshot.status === "loading" &&
      this.lastCheckAt !== null
    ) {
      issues.push("Dashboard is still loading.");
    }

    return [...new Set(issues)];
  }

  getStatus() {
    const now = Date.now();
    const lastCheckTimestamp = this.lastCheckAt
      ? Date.parse(this.lastCheckAt)
      : null;

    return {
      running: this.running,
      disposed: this.disposed,
      checkInProgress: this.checkInProgress,
      intervalMs: this.intervalMs,
      staleAfterMs: this.staleAfterMs,
      lastCheckAt: this.lastCheckAt,
      lastHealthyAt: this.lastHealthyAt,
      lastCheckAgeMs:
        lastCheckTimestamp === null
          ? null
          : Math.max(0, now - lastCheckTimestamp),
      consecutiveWarnings: this.consecutiveWarnings,
      totalChecks: this.totalChecks,
      totalWarnings: this.totalWarnings,
      totalErrors: this.totalErrors,
      lastResult: this.lastResult
        ? { ...this.lastResult, snapshot: undefined }
        : null,
    };
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Monitor listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(type, payload = {}) {
    const event = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(type, payload);
      } else if (typeof this.eventBus?.dispatch === "function") {
        this.eventBus.dispatch(type, payload);
      }
    } catch (error) {
      this.logger?.warn?.("Monitor event dispatch failed.", error);
    }

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logger?.warn?.("Monitor listener failed.", error);
      }
    }
  }

  reportError(error) {
    const message =
      error instanceof Error ? error.message : String(error);

    this.logger?.error?.("Route statistics monitor check failed.", error);

    this.emit(EVENTS.ERROR, {
      message,
      occurredAt: new Date().toISOString(),
    });
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardMonitor has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.listeners.clear();
    this.disposed = true;
  }
}

export { EVENTS as RouteStatisticsDashboardMonitorEvents };

export default RouteStatisticsDashboardMonitor;