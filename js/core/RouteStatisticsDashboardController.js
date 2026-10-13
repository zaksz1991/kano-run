export class RouteStatisticsDashboardController {
  constructor({
    dashboard,
    dashboardUI = null,
    statisticsManager = null,
    eventBus = null,
    logger = console,
    refreshOnEvents = [],
    autoRefresh = false,
    refreshInterval = 30000,
  } = {}) {
    if (!dashboard) {
      throw new TypeError(
        "RouteStatisticsDashboardController requires a dashboard.",
      );
    }

    this.dashboard = dashboard;
    this.dashboardUI = dashboardUI;
    this.statisticsManager = statisticsManager;
    this.eventBus = eventBus;
    this.logger = logger;

    this.refreshOnEvents = Array.isArray(refreshOnEvents)
      ? [...new Set(refreshOnEvents.filter(Boolean))]
      : [];

    this.autoRefresh = Boolean(autoRefresh);
    this.refreshInterval = Math.max(
      1000,
      Number(refreshInterval) || 30000,
    );

    this.started = false;
    this.disposed = false;
    this.refreshing = false;
    this.refreshPending = false;
    this.refreshTimer = null;
    this.unsubscribers = [];
    this.lastRefreshAt = null;
    this.lastSnapshot = null;
    this.lastError = null;
    this.refreshCount = 0;

    this.handleRefreshEvent = this.handleRefreshEvent.bind(this);
  }

  start({ mountUI = true } = {}) {
    this.assertActive();

    if (this.started) {
      return this;
    }

    this.started = true;

    this.subscribeToEvents();

    if (mountUI && this.dashboardUI) {
      try {
        this.dashboardUI.mount();
      } catch (error) {
        this.logError("Unable to mount dashboard UI.", error);
      }
    }

    this.refresh().catch((error) => {
      this.logError("Initial dashboard refresh failed.", error);
    });

    if (this.autoRefresh) {
      this.refreshTimer = globalThis.setInterval(() => {
        this.refresh().catch((error) => {
          this.logError("Scheduled dashboard refresh failed.", error);
        });
      }, this.refreshInterval);
    }

    return this;
  }

  subscribeToEvents() {
    if (!this.eventBus) {
      return;
    }

    const eventNames = this.refreshOnEvents.length
      ? this.refreshOnEvents
      : [
          "run:completed",
          "route:completed",
          "statistics:updated",
        ];

    for (const eventName of eventNames) {
      const unsubscribe = this.subscribe(eventName);

      if (unsubscribe) {
        this.unsubscribers.push(unsubscribe);
      }
    }
  }

  subscribe(eventName) {
    const callback = (payload) => {
      this.handleRefreshEvent(eventName, payload);
    };

    try {
      if (typeof this.eventBus.on === "function") {
        const result = this.eventBus.on(eventName, callback);

        if (typeof result === "function") {
          return result;
        }

        if (typeof this.eventBus.off === "function") {
          return () => this.eventBus.off(eventName, callback);
        }

        if (typeof this.eventBus.removeListener === "function") {
          return () =>
            this.eventBus.removeListener(eventName, callback);
        }

        return null;
      }

      if (typeof this.eventBus.subscribe === "function") {
        const result = this.eventBus.subscribe(eventName, callback);

        if (typeof result === "function") {
          return result;
        }

        if (result && typeof result.unsubscribe === "function") {
          return () => result.unsubscribe();
        }
      }
    } catch (error) {
      this.logError(`Unable to subscribe to "${eventName}".`, error);
    }

    return null;
  }

  handleRefreshEvent(eventName, payload) {
    if (this.disposed || !this.started) {
      return;
    }

    try {
      if (
        this.statisticsManager &&
        typeof this.statisticsManager.recordEvent === "function"
      ) {
        this.statisticsManager.recordEvent(eventName, payload);
      }

      this.refresh().catch((error) => {
        this.logError(
          `Refresh after "${eventName}" failed.`,
          error,
        );
      });
    } catch (error) {
      this.logError(
        `Unable to process "${eventName}".`,
        error,
      );
    }
  }

  async refresh() {
    this.assertActive();

    if (this.refreshing) {
      this.refreshPending = true;
      return this.lastSnapshot;
    }

    this.refreshing = true;

    try {
      do {
        this.refreshPending = false;

        const snapshot = await this.loadSnapshot();

        if (this.disposed) {
          return null;
        }

        this.lastSnapshot = snapshot;
        this.lastRefreshAt = new Date();
        this.lastError = null;
        this.refreshCount += 1;

        this.notifyUI(snapshot);
      } while (this.refreshPending && !this.disposed);

      return this.lastSnapshot;
    } catch (error) {
      this.lastError = error;
      this.notifyError(error);
      throw error;
    } finally {
      this.refreshing = false;
    }
  }

  async loadSnapshot() {
    if (typeof this.dashboard.getDashboard === "function") {
      return this.dashboard.getDashboard();
    }

    if (typeof this.dashboard.getSnapshot === "function") {
      return this.dashboard.getSnapshot();
    }

    if (typeof this.dashboard.getOverview === "function") {
      return this.dashboard.getOverview();
    }

    throw new Error(
      "Dashboard must implement getDashboard(), getSnapshot(), or getOverview().",
    );
  }

  notifyUI(snapshot) {
    if (!this.dashboardUI || typeof this.dashboardUI !== "object") {
      return;
    }

    try {
      if (typeof this.dashboardUI.renderSnapshot === "function") {
        this.dashboardUI.renderSnapshot(snapshot);
        return;
      }

      if (typeof this.dashboardUI.update === "function") {
        this.dashboardUI.update(snapshot);
        return;
      }

      if (typeof this.dashboardUI.render === "function") {
        this.dashboardUI.render(snapshot);
      }
    } catch (error) {
      this.logError("Unable to update dashboard UI.", error);
    }
  }

  notifyError(error) {
    if (
      this.dashboardUI &&
      typeof this.dashboardUI.setStatus === "function"
    ) {
      this.dashboardUI.setStatus(
        "Statistics refresh failed.",
        "error",
      );
    }

    this.logError("Dashboard refresh failed.", error);
  }

  getState() {
    return {
      started: this.started,
      disposed: this.disposed,
      refreshing: this.refreshing,
      refreshPending: this.refreshPending,
      refreshCount: this.refreshCount,
      lastRefreshAt: this.lastRefreshAt
        ? new Date(this.lastRefreshAt)
        : null,
      hasSnapshot: this.lastSnapshot !== null,
      lastError: this.lastError
        ? {
            name: this.lastError.name,
            message: this.lastError.message,
          }
        : null,
    };
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  async forceRefresh() {
    this.assertActive();

    this.refreshPending = false;

    if (this.refreshing) {
      this.refreshPending = true;
      return this.lastSnapshot;
    }

    return this.refresh();
  }

  stop() {
    if (!this.started) {
      return this;
    }

    this.started = false;

    if (this.refreshTimer !== null) {
      globalThis.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    for (const unsubscribe of this.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch (error) {
        this.logError("Unable to unsubscribe from dashboard event.", error);
      }
    }

    this.refreshPending = false;

    return this;
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(`[RouteStatisticsDashboardController] ${message}`, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardController has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.disposed = true;

    if (this.dashboardUI && typeof this.dashboardUI.dispose === "function") {
      this.dashboardUI.dispose();
    }

    this.lastSnapshot = null;
    this.lastError = null;
    this.statisticsManager = null;
    this.eventBus = null;
    this.dashboardUI = null;
    this.dashboard = null;
  }
}

export default RouteStatisticsDashboardController;