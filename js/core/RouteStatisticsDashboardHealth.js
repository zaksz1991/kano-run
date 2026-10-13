export class RouteStatisticsDashboardHealth {
  constructor({
    controller = null,
    dashboard = null,
    eventDispatcher = null,
    logger = console,
    staleAfterMs = 120000,
    historyLimit = 100,
  } = {}) {
    this.controller = controller;
    this.dashboard = dashboard;
    this.eventDispatcher = eventDispatcher;
    this.logger = logger;

    this.staleAfterMs = Math.max(
      1000,
      Number(staleAfterMs) || 120000,
    );

    this.historyLimit = Math.max(
      1,
      Math.floor(Number(historyLimit) || 100),
    );

    this.checkHistory = [];
    this.lastCheckAt = null;
    this.lastReport = null;
    this.disposed = false;
  }

  check() {
    this.assertActive();

    const checkedAt = Date.now();
    const controllerState = this.getControllerState();
    const dashboardState = this.getDashboardState();

    const checks = {
      controllerAvailable: Boolean(this.controller),
      dashboardAvailable: Boolean(this.dashboard),
      controllerNotDisposed: controllerState?.disposed !== true,
      dashboardResponsive: dashboardState.responsive,
      refreshNotStuck: !controllerState?.refreshing,
      snapshotAvailable: controllerState?.hasSnapshot === true,
      snapshotFresh: this.isSnapshotFresh(controllerState, checkedAt),
      noRecentRefreshError: !controllerState?.lastError,
    };

    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    const criticalFailures = failedChecks.filter((name) =>
      [
        "controllerAvailable",
        "dashboardAvailable",
        "controllerNotDisposed",
        "dashboardResponsive",
      ].includes(name),
    );

    const status = criticalFailures.length
      ? "unhealthy"
      : failedChecks.length
        ? "degraded"
        : "healthy";

    const report = {
      status,
      checkedAt,
      checks,
      failedChecks,
      criticalFailures,
      controller: controllerState,
      dashboard: dashboardState,
    };

    this.lastCheckAt = checkedAt;
    this.lastReport = report;

    this.checkHistory.push(report);

    if (this.checkHistory.length > this.historyLimit) {
      this.checkHistory.splice(
        0,
        this.checkHistory.length - this.historyLimit,
      );
    }

    this.emit("route-statistics:health-checked", {
      status,
      failedChecks,
      checkedAt,
    });

    if (status !== "healthy") {
      this.logWarning("Dashboard health check reported issues.", report);
    }

    return this.clone(report);
  }

  getControllerState() {
    if (!this.controller) {
      return null;
    }

    try {
      if (typeof this.controller.getState === "function") {
        return this.controller.getState();
      }

      return {
        disposed: Boolean(this.controller.disposed),
        refreshing: Boolean(this.controller.refreshing),
        hasSnapshot: this.controller.lastSnapshot != null,
        lastRefreshAt: this.controller.lastRefreshAt ?? null,
        lastError: this.controller.lastError
          ? {
              message: String(this.controller.lastError.message ?? ""),
            }
          : null,
      };
    } catch (error) {
      this.logError("Unable to inspect controller state.", error);

      return {
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  getDashboardState() {
    if (!this.dashboard) {
      return {
        responsive: false,
      };
    }

    try {
      const responsive =
        typeof this.dashboard.getDashboard === "function" ||
        typeof this.dashboard.getSnapshot === "function" ||
        typeof this.dashboard.getOverview === "function";

      return {
        responsive,
        methods: {
          getDashboard:
            typeof this.dashboard.getDashboard === "function",
          getSnapshot:
            typeof this.dashboard.getSnapshot === "function",
          getOverview:
            typeof this.dashboard.getOverview === "function",
        },
      };
    } catch (error) {
      this.logError("Unable to inspect dashboard.", error);

      return {
        responsive: false,
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  isSnapshotFresh(controllerState, now = Date.now()) {
    if (!controllerState?.lastRefreshAt) {
      return false;
    }

    const timestamp = new Date(
      controllerState.lastRefreshAt,
    ).getTime();

    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const age = now - timestamp;

    return age >= 0 && age <= this.staleAfterMs;
  }

  getSummary() {
    this.assertActive();

    if (!this.lastReport) {
      return {
        status: "unknown",
        checkedAt: null,
        failedChecks: [],
        message: "Health check has not run.",
      };
    }

    return {
      status: this.lastReport.status,
      checkedAt: this.lastReport.checkedAt,
      failedChecks: [...this.lastReport.failedChecks],
      message: this.getStatusMessage(this.lastReport.status),
    };
  }

  getStatusMessage(status) {
    const messages = {
      healthy: "All dashboard health checks passed.",
      degraded: "The dashboard is running with one or more warnings.",
      unhealthy: "Critical dashboard health checks failed.",
      unknown: "Dashboard health has not been checked.",
    };

    return messages[status] ?? messages.unknown;
  }

  getHistory({ limit = 20, newestFirst = true } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    const entries = newestFirst
      ? [...this.checkHistory].reverse()
      : [...this.checkHistory];

    return entries
      .slice(0, safeLimit)
      .map((entry) => this.clone(entry));
  }

  emit(eventName, payload) {
    if (!this.eventDispatcher) {
      return;
    }

    try {
      if (typeof this.eventDispatcher.emit === "function") {
        this.eventDispatcher.emit(eventName, payload, {
          source: "dashboard-health",
        });
      }
    } catch (error) {
      this.logError("Unable to emit health event.", error);
    }
  }

  clone(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.clone(item));
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.clone(item),
        ]),
      );
    }

    return value;
  }

  logWarning(message, details) {
    if (typeof this.logger?.warn === "function") {
      this.logger.warn(
        `[RouteStatisticsDashboardHealth] ${message}`,
        details,
      );
    }
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardHealth] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardHealth has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.controller = null;
    this.dashboard = null;
    this.eventDispatcher = null;
    this.checkHistory.length = 0;
    this.lastReport = null;
  }
}

export function createRouteStatisticsDashboardHealth(options = {}) {
  return new RouteStatisticsDashboardHealth(options);
}

export default RouteStatisticsDashboardHealth;export class RouteStatisticsDashboardHealth {
  constructor({
    controller = null,
    dashboard = null,
    eventDispatcher = null,
    logger = console,
    staleAfterMs = 120000,
    historyLimit = 100,
  } = {}) {
    this.controller = controller;
    this.dashboard = dashboard;
    this.eventDispatcher = eventDispatcher;
    this.logger = logger;

    this.staleAfterMs = Math.max(
      1000,
      Number(staleAfterMs) || 120000,
    );

    this.historyLimit = Math.max(
      1,
      Math.floor(Number(historyLimit) || 100),
    );

    this.checkHistory = [];
    this.lastCheckAt = null;
    this.lastReport = null;
    this.disposed = false;
  }

  check() {
    this.assertActive();

    const checkedAt = Date.now();
    const controllerState = this.getControllerState();
    const dashboardState = this.getDashboardState();

    const checks = {
      controllerAvailable: Boolean(this.controller),
      dashboardAvailable: Boolean(this.dashboard),
      controllerNotDisposed: controllerState?.disposed !== true,
      dashboardResponsive: dashboardState.responsive,
      refreshNotStuck: !controllerState?.refreshing,
      snapshotAvailable: controllerState?.hasSnapshot === true,
      snapshotFresh: this.isSnapshotFresh(controllerState, checkedAt),
      noRecentRefreshError: !controllerState?.lastError,
    };

    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    const criticalFailures = failedChecks.filter((name) =>
      [
        "controllerAvailable",
        "dashboardAvailable",
        "controllerNotDisposed",
        "dashboardResponsive",
      ].includes(name),
    );

    const status = criticalFailures.length
      ? "unhealthy"
      : failedChecks.length
        ? "degraded"
        : "healthy";

    const report = {
      status,
      checkedAt,
      checks,
      failedChecks,
      criticalFailures,
      controller: controllerState,
      dashboard: dashboardState,
    };

    this.lastCheckAt = checkedAt;
    this.lastReport = report;

    this.checkHistory.push(report);

    if (this.checkHistory.length > this.historyLimit) {
      this.checkHistory.splice(
        0,
        this.checkHistory.length - this.historyLimit,
      );
    }

    this.emit("route-statistics:health-checked", {
      status,
      failedChecks,
      checkedAt,
    });

    if (status !== "healthy") {
      this.logWarning("Dashboard health check reported issues.", report);
    }

    return this.clone(report);
  }

  getControllerState() {
    if (!this.controller) {
      return null;
    }

    try {
      if (typeof this.controller.getState === "function") {
        return this.controller.getState();
      }

      return {
        disposed: Boolean(this.controller.disposed),
        refreshing: Boolean(this.controller.refreshing),
        hasSnapshot: this.controller.lastSnapshot != null,
        lastRefreshAt: this.controller.lastRefreshAt ?? null,
        lastError: this.controller.lastError
          ? {
              message: String(this.controller.lastError.message ?? ""),
            }
          : null,
      };
    } catch (error) {
      this.logError("Unable to inspect controller state.", error);

      return {
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  getDashboardState() {
    if (!this.dashboard) {
      return {
        responsive: false,
      };
    }

    try {
      const responsive =
        typeof this.dashboard.getDashboard === "function" ||
        typeof this.dashboard.getSnapshot === "function" ||
        typeof this.dashboard.getOverview === "function";

      return {
        responsive,
        methods: {
          getDashboard:
            typeof this.dashboard.getDashboard === "function",
          getSnapshot:
            typeof this.dashboard.getSnapshot === "function",
          getOverview:
            typeof this.dashboard.getOverview === "function",
        },
      };
    } catch (error) {
      this.logError("Unable to inspect dashboard.", error);

      return {
        responsive: false,
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  isSnapshotFresh(controllerState, now = Date.now()) {
    if (!controllerState?.lastRefreshAt) {
      return false;
    }

    const timestamp = new Date(
      controllerState.lastRefreshAt,
    ).getTime();

    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const age = now - timestamp;

    return age >= 0 && age <= this.staleAfterMs;
  }

  getSummary() {
    this.assertActive();

    if (!this.lastReport) {
      return {
        status: "unknown",
        checkedAt: null,
        failedChecks: [],
        message: "Health check has not run.",
      };
    }

    return {
      status: this.lastReport.status,
      checkedAt: this.lastReport.checkedAt,
      failedChecks: [...this.lastReport.failedChecks],
      message: this.getStatusMessage(this.lastReport.status),
    };
  }

  getStatusMessage(status) {
    const messages = {
      healthy: "All dashboard health checks passed.",
      degraded: "The dashboard is running with one or more warnings.",
      unhealthy: "Critical dashboard health checks failed.",
      unknown: "Dashboard health has not been checked.",
    };

    return messages[status] ?? messages.unknown;
  }

  getHistory({ limit = 20, newestFirst = true } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    const entries = newestFirst
      ? [...this.checkHistory].reverse()
      : [...this.checkHistory];

    return entries
      .slice(0, safeLimit)
      .map((entry) => this.clone(entry));
  }

  emit(eventName, payload) {
    if (!this.eventDispatcher) {
      return;
    }

    try {
      if (typeof this.eventDispatcher.emit === "function") {
        this.eventDispatcher.emit(eventName, payload, {
          source: "dashboard-health",
        });
      }
    } catch (error) {
      this.logError("Unable to emit health event.", error);
    }
  }

  clone(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.clone(item));
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.clone(item),
        ]),
      );
    }

    return value;
  }

  logWarning(message, details) {
    if (typeof this.logger?.warn === "function") {
      this.logger.warn(
        `[RouteStatisticsDashboardHealth] ${message}`,
        details,
      );
    }
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardHealth] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardHealth has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.controller = null;
    this.dashboard = null;
    this.eventDispatcher = null;
    this.checkHistory.length = 0;
    this.lastReport = null;
  }
}

export function createRouteStatisticsDashboardHealth(options = {}) {
  return new RouteStatisticsDashboardHealth(options);
}

export default RouteStatisticsDashboardHealth;export class RouteStatisticsDashboardHealth {
  constructor({
    controller = null,
    dashboard = null,
    eventDispatcher = null,
    logger = console,
    staleAfterMs = 120000,
    historyLimit = 100,
  } = {}) {
    this.controller = controller;
    this.dashboard = dashboard;
    this.eventDispatcher = eventDispatcher;
    this.logger = logger;

    this.staleAfterMs = Math.max(
      1000,
      Number(staleAfterMs) || 120000,
    );

    this.historyLimit = Math.max(
      1,
      Math.floor(Number(historyLimit) || 100),
    );

    this.checkHistory = [];
    this.lastCheckAt = null;
    this.lastReport = null;
    this.disposed = false;
  }

  check() {
    this.assertActive();

    const checkedAt = Date.now();
    const controllerState = this.getControllerState();
    const dashboardState = this.getDashboardState();

    const checks = {
      controllerAvailable: Boolean(this.controller),
      dashboardAvailable: Boolean(this.dashboard),
      controllerNotDisposed: controllerState?.disposed !== true,
      dashboardResponsive: dashboardState.responsive,
      refreshNotStuck: !controllerState?.refreshing,
      snapshotAvailable: controllerState?.hasSnapshot === true,
      snapshotFresh: this.isSnapshotFresh(controllerState, checkedAt),
      noRecentRefreshError: !controllerState?.lastError,
    };

    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    const criticalFailures = failedChecks.filter((name) =>
      [
        "controllerAvailable",
        "dashboardAvailable",
        "controllerNotDisposed",
        "dashboardResponsive",
      ].includes(name),
    );

    const status = criticalFailures.length
      ? "unhealthy"
      : failedChecks.length
        ? "degraded"
        : "healthy";

    const report = {
      status,
      checkedAt,
      checks,
      failedChecks,
      criticalFailures,
      controller: controllerState,
      dashboard: dashboardState,
    };

    this.lastCheckAt = checkedAt;
    this.lastReport = report;

    this.checkHistory.push(report);

    if (this.checkHistory.length > this.historyLimit) {
      this.checkHistory.splice(
        0,
        this.checkHistory.length - this.historyLimit,
      );
    }

    this.emit("route-statistics:health-checked", {
      status,
      failedChecks,
      checkedAt,
    });

    if (status !== "healthy") {
      this.logWarning("Dashboard health check reported issues.", report);
    }

    return this.clone(report);
  }

  getControllerState() {
    if (!this.controller) {
      return null;
    }

    try {
      if (typeof this.controller.getState === "function") {
        return this.controller.getState();
      }

      return {
        disposed: Boolean(this.controller.disposed),
        refreshing: Boolean(this.controller.refreshing),
        hasSnapshot: this.controller.lastSnapshot != null,
        lastRefreshAt: this.controller.lastRefreshAt ?? null,
        lastError: this.controller.lastError
          ? {
              message: String(this.controller.lastError.message ?? ""),
            }
          : null,
      };
    } catch (error) {
      this.logError("Unable to inspect controller state.", error);

      return {
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  getDashboardState() {
    if (!this.dashboard) {
      return {
        responsive: false,
      };
    }

    try {
      const responsive =
        typeof this.dashboard.getDashboard === "function" ||
        typeof this.dashboard.getSnapshot === "function" ||
        typeof this.dashboard.getOverview === "function";

      return {
        responsive,
        methods: {
          getDashboard:
            typeof this.dashboard.getDashboard === "function",
          getSnapshot:
            typeof this.dashboard.getSnapshot === "function",
          getOverview:
            typeof this.dashboard.getOverview === "function",
        },
      };
    } catch (error) {
      this.logError("Unable to inspect dashboard.", error);

      return {
        responsive: false,
        inspectionError: String(error?.message ?? error),
      };
    }
  }

  isSnapshotFresh(controllerState, now = Date.now()) {
    if (!controllerState?.lastRefreshAt) {
      return false;
    }

    const timestamp = new Date(
      controllerState.lastRefreshAt,
    ).getTime();

    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const age = now - timestamp;

    return age >= 0 && age <= this.staleAfterMs;
  }

  getSummary() {
    this.assertActive();

    if (!this.lastReport) {
      return {
        status: "unknown",
        checkedAt: null,
        failedChecks: [],
        message: "Health check has not run.",
      };
    }

    return {
      status: this.lastReport.status,
      checkedAt: this.lastReport.checkedAt,
      failedChecks: [...this.lastReport.failedChecks],
      message: this.getStatusMessage(this.lastReport.status),
    };
  }

  getStatusMessage(status) {
    const messages = {
      healthy: "All dashboard health checks passed.",
      degraded: "The dashboard is running with one or more warnings.",
      unhealthy: "Critical dashboard health checks failed.",
      unknown: "Dashboard health has not been checked.",
    };

    return messages[status] ?? messages.unknown;
  }

  getHistory({ limit = 20, newestFirst = true } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    const entries = newestFirst
      ? [...this.checkHistory].reverse()
      : [...this.checkHistory];

    return entries
      .slice(0, safeLimit)
      .map((entry) => this.clone(entry));
  }

  emit(eventName, payload) {
    if (!this.eventDispatcher) {
      return;
    }

    try {
      if (typeof this.eventDispatcher.emit === "function") {
        this.eventDispatcher.emit(eventName, payload, {
          source: "dashboard-health",
        });
      }
    } catch (error) {
      this.logError("Unable to emit health event.", error);
    }
  }

  clone(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.clone(item));
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.clone(item),
        ]),
      );
    }

    return value;
  }

  logWarning(message, details) {
    if (typeof this.logger?.warn === "function") {
      this.logger.warn(
        `[RouteStatisticsDashboardHealth] ${message}`,
        details,
      );
    }
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardHealth] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardHealth has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.controller = null;
    this.dashboard = null;
    this.eventDispatcher = null;
    this.checkHistory.length = 0;
    this.lastReport = null;
  }
}

export function createRouteStatisticsDashboardHealth(options = {}) {
  return new RouteStatisticsDashboardHealth(options);
}

export default RouteStatisticsDashboardHealth;