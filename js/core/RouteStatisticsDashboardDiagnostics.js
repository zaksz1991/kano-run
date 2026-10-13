export class RouteStatisticsDashboardDiagnostics {
  constructor({
    controller = null,
    dashboard = null,
    dashboardUI = null,
    healthMonitor = null,
    eventDispatcher = null,
    logger = console,
    maxEntries = 200,
  } = {}) {
    this.controller = controller;
    this.dashboard = dashboard;
    this.dashboardUI = dashboardUI;
    this.healthMonitor = healthMonitor;
    this.eventDispatcher = eventDispatcher;
    this.logger = logger;

    this.maxEntries = Math.max(
      1,
      Math.floor(Number(maxEntries) || 200),
    );

    this.entries = [];
    this.startedAt = Date.now();
    this.disposed = false;
  }

  run() {
    this.assertActive();

    const startedAt = Date.now();
    const checks = [
      this.checkController(),
      this.checkDashboard(),
      this.checkUI(),
      this.checkHealthMonitor(),
      this.checkEventDispatcher(),
    ];

    const failed = checks.filter(
      (check) => check.status === "error",
    );

    const warnings = checks.filter(
      (check) => check.status === "warning",
    );

    const report = {
      timestamp: Date.now(),
      durationMs: Date.now() - startedAt,
      status: failed.length
        ? "error"
        : warnings.length
          ? "warning"
          : "healthy",
      summary: {
        total: checks.length,
        passed: checks.filter(
          (check) => check.status === "ok",
        ).length,
        warnings: warnings.length,
        errors: failed.length,
      },
      checks,
    };

    this.record("diagnostics:completed", report);

    return this.clone(report);
  }

  checkController() {
    if (!this.controller) {
      return this.result(
        "controller",
        "error",
        "Dashboard controller is missing.",
      );
    }

    if (this.controller.disposed) {
      return this.result(
        "controller",
        "error",
        "Dashboard controller has been disposed.",
      );
    }

    const hasRefresh =
      typeof this.controller.refresh === "function" ||
      typeof this.controller.forceRefresh === "function";

    if (!hasRefresh) {
      return this.result(
        "controller",
        "error",
        "Controller does not expose a refresh method.",
      );
    }

    return this.result(
      "controller",
      "ok",
      "Controller is available.",
    );
  }

  checkDashboard() {
    if (!this.dashboard) {
      return this.result(
        "dashboard",
        "error",
        "Dashboard instance is missing.",
      );
    }

    const supportedMethods = [
      "getDashboard",
      "getSnapshot",
      "getOverview",
    ];

    const available = supportedMethods.filter(
      (method) => typeof this.dashboard[method] === "function",
    );

    if (available.length === 0) {
      return this.result(
        "dashboard",
        "error",
        "Dashboard has no supported snapshot method.",
      );
    }

    return this.result(
      "dashboard",
      "ok",
      "Dashboard exposes a supported snapshot method.",
      { availableMethods: available },
    );
  }

  checkUI() {
    if (!this.dashboardUI) {
      return this.result(
        "ui",
        "warning",
        "Dashboard UI is not configured.",
      );
    }

    if (this.dashboardUI.disposed) {
      return this.result(
        "ui",
        "error",
        "Dashboard UI has been disposed.",
      );
    }

    const hasRenderMethod = [
      "renderSnapshot",
      "render",
      "update",
    ].some(
      (method) => typeof this.dashboardUI[method] === "function",
    );

    if (!hasRenderMethod) {
      return this.result(
        "ui",
        "warning",
        "Dashboard UI has no recognized rendering method.",
      );
    }

    if (
      "container" in this.dashboardUI &&
      !this.dashboardUI.container
    ) {
      return this.result(
        "ui",
        "warning",
        "Dashboard UI has no container element.",
      );
    }

    return this.result(
      "ui",
      "ok",
      "Dashboard UI is configured.",
    );
  }

  checkHealthMonitor() {
    if (!this.healthMonitor) {
      return this.result(
        "healthMonitor",
        "warning",
        "Health monitor is not configured.",
      );
    }

    if (this.healthMonitor.disposed) {
      return this.result(
        "healthMonitor",
        "error",
        "Health monitor has been disposed.",
      );
    }

    if (typeof this.healthMonitor.check !== "function") {
      return this.result(
        "healthMonitor",
        "error",
        "Health monitor does not expose check().",
      );
    }

    return this.result(
      "healthMonitor",
      "ok",
      "Health monitor is available.",
    );
  }

  checkEventDispatcher() {
    if (!this.eventDispatcher) {
      return this.result(
        "eventDispatcher",
        "warning",
        "Event dispatcher is not configured.",
      );
    }

    if (this.eventDispatcher.disposed) {
      return this.result(
        "eventDispatcher",
        "error",
        "Event dispatcher has been disposed.",
      );
    }

    const supportsEvents =
      typeof this.eventDispatcher.emit === "function" &&
      (
        typeof this.eventDispatcher.on === "function" ||
        typeof this.eventDispatcher.subscribe === "function"
      );

    if (!supportsEvents) {
      return this.result(
        "eventDispatcher",
        "warning",
        "Event dispatcher has an incomplete interface.",
      );
    }

    return this.result(
      "eventDispatcher",
      "ok",
      "Event dispatcher is available.",
    );
  }

  result(name, status, message, details = {}) {
    return {
      name,
      status,
      message,
      details,
      timestamp: Date.now(),
    };
  }

  record(type, details = {}) {
    const entry = {
      type,
      timestamp: Date.now(),
      details: this.clone(details),
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(
        0,
        this.entries.length - this.maxEntries,
      );
    }

    this.emit(type, entry);

    return entry;
  }

  emit(eventName, payload) {
    if (!this.eventDispatcher) {
      return;
    }

    try {
      if (typeof this.eventDispatcher.emit === "function") {
        this.eventDispatcher.emit(eventName, payload, {
          source: "dashboard-diagnostics",
        });
      }
    } catch (error) {
      this.logError("Unable to dispatch diagnostic event.", error);
    }
  }

  getEntries({
    limit = 50,
    type = null,
    newestFirst = true,
  } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    let results = this.entries;

    if (type) {
      results = results.filter(
        (entry) => entry.type === type,
      );
    }

    results = newestFirst
      ? [...results].reverse()
      : [...results];

    return results
      .slice(0, safeLimit)
      .map((entry) => this.clone(entry));
  }

  getSummary() {
    this.assertActive();

    const entries = this.entries;

    return {
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, Date.now() - this.startedAt),
      totalEntries: entries.length,
      diagnosticRuns: entries.filter(
        (entry) => entry.type === "diagnostics:completed",
      ).length,
      latestDiagnostic:
        this.clone(
          [...entries]
            .reverse()
            .find(
              (entry) => entry.type === "diagnostics:completed",
            ) ?? null,
        ),
    };
  }

  exportReport() {
    this.assertActive();

    return {
      generatedAt: new Date().toISOString(),
      summary: this.getSummary(),
      entries: this.getEntries({
        limit: this.maxEntries,
        newestFirst: false,
      }),
    };
  }

  clone(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.clone(item));
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

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(
        `[RouteStatisticsDashboardDiagnostics] ${message}`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardDiagnostics has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.entries.length = 0;

    this.controller = null;
    this.dashboard = null;
    this.dashboardUI = null;
    this.healthMonitor = null;
    this.eventDispatcher = null;
  }
}

export function createRouteStatisticsDashboardDiagnostics(
  options = {},
) {
  return new RouteStatisticsDashboardDiagnostics(options);
}

export default RouteStatisticsDashboardDiagnostics;