export class AlertQueueDashboardController {
  constructor({
    dashboard,
    root = null,
    refreshIntervalMs = 5000,
    onUpdate = null,
    clock = () => Date.now(),
  } = {}) {
    if (!dashboard) {
      throw new Error("A health dashboard is required.");
    }

    this.dashboard = dashboard;
    this.root = root;
    this.refreshIntervalMs = Math.max(
      500,
      Number(refreshIntervalMs) || 5000,
    );
    this.onUpdate = onUpdate;
    this.clock = clock;

    this.timer = null;
    this.unsubscribe = null;
    this.running = false;
    this.lastViewModel = null;
    this.listeners = new Set();
  }

  start() {
    if (this.running) {
      return this.getViewModel();
    }

    this.running = true;

    this.unsubscribe = this.dashboard.subscribe((event) => {
      this.#handleEvent(event);
    });

    this.refresh();
    this.timer = setInterval(
      () => this.refresh(),
      this.refreshIntervalMs,
    );

    return this.lastViewModel;
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.running = false;

    this.#emit({
      type: "controller_stopped",
      timestamp: this.clock(),
    });

    return this.getViewModel();
  }

  refresh() {
    const data = this.dashboard.getDashboardData();

    this.lastViewModel = this.#buildViewModel(data);

    if (typeof this.onUpdate === "function") {
      try {
        this.onUpdate(this.lastViewModel);
      } catch (error) {
        this.#emit({
          type: "render_error",
          error: this.#errorMessage(error),
        });
      }
    }

    this.#emit({
      type: "view_updated",
      viewModel: this.lastViewModel,
    });

    return this.lastViewModel;
  }

  getViewModel() {
    return this.lastViewModel;
  }

  getStatus() {
    return {
      running: this.running,
      refreshIntervalMs: this.refreshIntervalMs,
      hasRoot: Boolean(this.root),
      lastUpdatedAt: this.lastViewModel?.updatedAt ?? null,
    };
  }

  acknowledgeNotification(id) {
    const result = this.dashboard.notifications.acknowledge(id);

    this.refresh();

    return result;
  }

  acknowledgeAllNotifications() {
    const result = this.dashboard.notifications.acknowledgeAll();

    this.refresh();

    return result;
  }

  runHealthCheck() {
    const health = this.dashboard.check();

    this.refresh();

    return health;
  }

  exportJSON() {
    return this.dashboard.exportReportJSON();
  }

  exportCSV() {
    return this.dashboard.exportReportCSV();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.stop();
    this.listeners.clear();
    this.lastViewModel = null;
  }

  #buildViewModel(data) {
    const health = data.health;
    const summary = data.summary;
    const analytics = data.analytics;
    const notifications = data.notifications ?? [];

    return {
      updatedAt: new Date(this.clock()).toISOString(),
      status: health?.status ?? "unknown",
      statusLabel: this.#formatStatus(health?.status),
      metrics: {
        totalJobs: health?.totalJobs ?? 0,
        pending: health?.counts?.pending ?? 0,
        processing: health?.counts?.processing ?? 0,
        completed: health?.counts?.completed ?? 0,
        failed: health?.counts?.failed ?? 0,
        availabilityPercent: analytics?.availabilityPercent ?? 0,
      },
      issues: (health?.issues ?? []).map((issue) => ({
        code: issue.code ?? "UNKNOWN",
        severity: issue.severity ?? "info",
        message: issue.message ?? "",
      })),
      notifications: notifications.map((item) => ({
        id: item.id,
        severity: item.severity,
        message: item.message,
        acknowledged: Boolean(item.acknowledged),
        createdAt: item.createdAt,
      })),
      summary: summary ?? {},
      analytics: analytics ?? {},
      empty: !health,
    };
  }

  #handleEvent(event) {
    this.#emit({
      type: "dashboard_event",
      event,
    });

    if (event?.type === "health_updated") {
      this.refresh();
    }
  }

  #formatStatus(status) {
    const labels = {
      healthy: "Healthy",
      degraded: "Degraded",
      unhealthy: "Unhealthy",
      unknown: "Unknown",
    };

    return labels[status] ?? "Unknown";
  }

  #errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Keep controller updates isolated from subscriber errors.
      }
    }
  }
}

export default AlertQueueDashboardController;