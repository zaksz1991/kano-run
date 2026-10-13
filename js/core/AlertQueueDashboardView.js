export class AlertQueueDashboardView {
  constructor(options = {}) {
    this.root = options.root ?? null;
    this.controller = options.controller ?? null;
    this.document = options.document ?? globalThis.document;
    this.unsubscribe = null;
    this.started = false;
  }

  mount(root = this.root) {
    if (!root) {
      throw new Error("AlertQueueDashboardView requires a root element.");
    }

    this.root = root;
    this.started = true;

    this.root.setAttribute("data-alert-dashboard", "true");
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "Alert delivery queue dashboard");

    this.renderLoading();

    if (this.controller?.subscribe) {
      this.unsubscribe = this.controller.subscribe((state) => {
        this.render(state);
      });
    }

    if (this.controller?.start) {
      this.controller.start();
    }

    return this;
  }

  renderLoading() {
    if (!this.root) return;

    this.root.replaceChildren();

    const message = this.document.createElement("p");
    message.textContent = "Loading alert queue status…";
    message.setAttribute("role", "status");

    this.root.append(message);
  }

  render(state = {}) {
    if (!this.root || !this.started) return;

    const fragment = this.document.createDocumentFragment();
    const heading = this.document.createElement("h2");

    heading.textContent = "Alert Delivery Queue";
    fragment.append(heading);

    const metrics = state.metrics ?? state.data?.metrics ?? {};
    const status = state.status ?? state.data?.status ?? "unknown";

    const summary = this.document.createElement("p");
    summary.textContent = `Status: ${this.formatValue(status)}`;
    summary.setAttribute("data-queue-status", String(status));
    fragment.append(summary);

    const metricList = this.document.createElement("dl");

    const fields = [
      ["Pending", metrics.pending],
      ["Processing", metrics.processing],
      ["Completed", metrics.completed],
      ["Failed", metrics.failed],
      ["Total", metrics.total],
    ];

    for (const [label, value] of fields) {
      if (value === undefined || value === null) continue;

      const term = this.document.createElement("dt");
      term.textContent = label;

      const detail = this.document.createElement("dd");
      detail.textContent = this.formatValue(value);

      metricList.append(term, detail);
    }

    fragment.append(metricList);

    const notifications = Array.isArray(state.notifications)
      ? state.notifications
      : Array.isArray(state.data?.notifications)
        ? state.data.notifications
        : [];

    const notificationHeading = this.document.createElement("h3");
    notificationHeading.textContent = "Notifications";
    fragment.append(notificationHeading);

    const notificationList = this.document.createElement("ul");

    if (notifications.length === 0) {
      const empty = this.document.createElement("li");
      empty.textContent = "No active notifications.";
      notificationList.append(empty);
    } else {
      for (const notification of notifications) {
        notificationList.append(
          this.createNotificationItem(notification)
        );
      }
    }

    fragment.append(notificationList);
    this.root.replaceChildren(fragment);
  }

  createNotificationItem(notification) {
    const item = this.document.createElement("li");
    const message = this.document.createElement("span");

    message.textContent =
      notification.message ??
      notification.title ??
      notification.type ??
      "Queue notification";

    item.append(message);

    if (notification.id !== undefined && notification.id !== null) {
      const button = this.document.createElement("button");

      button.type = "button";
      button.textContent = "Acknowledge";
      button.setAttribute("aria-label", "Acknowledge notification");

      button.addEventListener("click", async () => {
        button.disabled = true;

        try {
          await this.controller?.acknowledge?.(notification.id);
        } catch (error) {
          button.disabled = false;
          this.showError(error);
        }
      });

      item.append(button);
    }

    return item;
  }

  showError(error) {
    if (!this.root) return;

    const message = this.document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = error instanceof Error
      ? error.message
      : String(error ?? "An unexpected error occurred.");

    this.root.append(message);
  }

  formatValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "0";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (value === undefined || value === null || value === "") {
      return "Unknown";
    }

    return String(value);
  }

  destroy() {
    if (!this.started) return;

    this.started = false;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.controller?.stop?.();
    this.root?.removeAttribute("data-alert-dashboard");
  }
}