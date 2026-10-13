export class AlertQueueDashboardActions {
  constructor(options = {}) {
    this.controller = options.controller ?? null;
    this.dashboard = options.dashboard ?? null;
    this.onError = options.onError ?? (() => {});
    this.busyActions = new Set();
  }

  async refresh() {
    return this.execute("refresh", async () => {
      if (typeof this.controller?.refresh === "function") {
        return this.controller.refresh();
      }

      if (typeof this.dashboard?.check === "function") {
        return this.dashboard.check();
      }

      throw new Error("Refresh action is unavailable.");
    });
  }

  async runHealthCheck() {
    return this.execute("health-check", async () => {
      if (typeof this.controller?.runHealthCheck === "function") {
        return this.controller.runHealthCheck();
      }

      if (typeof this.dashboard?.check === "function") {
        return this.dashboard.check();
      }

      throw new Error("Health check action is unavailable.");
    });
  }

  async acknowledge(notificationId) {
    if (notificationId === undefined || notificationId === null) {
      throw new TypeError("A notification ID is required.");
    }

    return this.execute(`ack:${notificationId}`, async () => {
      const notifications = this.dashboard?.notifications;

      if (typeof notifications?.acknowledge === "function") {
        return notifications.acknowledge(notificationId);
      }

      if (typeof this.controller?.acknowledge === "function") {
        return this.controller.acknowledge(notificationId);
      }

      throw new Error("Notification acknowledgement is unavailable.");
    });
  }

  async exportJSON() {
    return this.execute("export-json", async () => {
      if (typeof this.controller?.exportReportJSON === "function") {
        return this.controller.exportReportJSON();
      }

      if (typeof this.dashboard?.exportReportJSON === "function") {
        return this.dashboard.exportReportJSON();
      }

      throw new Error("JSON report export is unavailable.");
    });
  }

  async exportCSV() {
    return this.execute("export-csv", async () => {
      if (typeof this.controller?.exportReportCSV === "function") {
        return this.controller.exportReportCSV();
      }

      if (typeof this.dashboard?.exportReportCSV === "function") {
        return this.dashboard.exportReportCSV();
      }

      throw new Error("CSV report export is unavailable.");
    });
  }

  isBusy(action) {
    return this.busyActions.has(action);
  }

  getBusyActions() {
    return [...this.busyActions];
  }

  async execute(action, callback) {
    if (this.busyActions.has(action)) {
      return {
        ok: false,
        action,
        reason: "already_running",
      };
    }

    this.busyActions.add(action);

    try {
      const result = await callback();

      return {
        ok: true,
        action,
        result,
      };
    } catch (error) {
      try {
        this.onError(error, action);
      } catch {
        // Error reporting must not hide the original failure.
      }

      return {
        ok: false,
        action,
        error,
      };
    } finally {
      this.busyActions.delete(action);
    }
  }

  reset() {
    this.busyActions.clear();
  }
}