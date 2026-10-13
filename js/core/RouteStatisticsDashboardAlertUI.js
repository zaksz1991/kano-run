import { Logger } from "./Logger.js";

const DEFAULTS = Object.freeze({
  container: null,
  className: "route-statistics-alerts",
  maxVisible: 5,
  showResolved: false,
  dismissible: true,
  emptyMessage: "No active alerts.",
});

const SEVERITY_LABELS = Object.freeze({
  info: "Information",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
});

export class RouteStatisticsDashboardAlertUI {
  constructor({
    alerts,
    container = null,
    documentRef = globalThis.document,
    logger = null,
    options = {},
  } = {}) {
    if (!alerts) {
      throw new TypeError(
        "RouteStatisticsDashboardAlertUI requires an alerts manager."
      );
    }

    this.alerts = alerts;
    this.document = documentRef;
    this.logger = logger ?? new Logger("RouteStatisticsDashboardAlertUI");

    this.options = {
      ...DEFAULTS,
      ...options,
    };

    this.container = this.resolveContainer(container ?? this.options.container);
    this.unsubscribe = null;
    this.mounted = false;
    this.disposed = false;
    this.onClick = this.handleClick.bind(this);
  }

  resolveContainer(container) {
    if (!container) {
      return null;
    }

    if (typeof container === "string") {
      return this.document?.querySelector(container) ?? null;
    }

    return container;
  }

  mount(container = null) {
    this.assertActive();

    if (this.mounted) {
      return this;
    }

    if (container) {
      this.container = this.resolveContainer(container);
    }

    if (!this.container) {
      throw new Error(
        "Alert UI container was not found. Provide a DOM element or selector."
      );
    }

    this.container.classList.add(this.options.className);
    this.container.setAttribute("aria-live", "polite");
    this.container.setAttribute("aria-relevant", "additions text");

    this.container.addEventListener("click", this.onClick);

    this.unsubscribe = this.alerts.subscribe(() => {
      this.render();
    });

    this.mounted = true;
    this.injectStyles();
    this.render();

    return this;
  }

  render() {
    this.assertActive();

    if (!this.container) {
      return null;
    }

    const alertList = this.options.showResolved
      ? this.alerts.getAll()
      : this.alerts.getActive();

    const visibleAlerts = alertList.slice(
      0,
      Math.max(0, Number(this.options.maxVisible) || 0)
    );

    const fragment = this.document.createDocumentFragment();

    if (visibleAlerts.length === 0) {
      const empty = this.document.createElement("p");
      empty.className = "rs-alerts-empty";
      empty.textContent = this.options.emptyMessage;
      fragment.appendChild(empty);
    } else {
      for (const alert of visibleAlerts) {
        fragment.appendChild(this.createAlertElement(alert));
      }
    }

    this.container.replaceChildren(fragment);

    return {
      total: alertList.length,
      visible: visibleAlerts.length,
    };
  }

  createAlertElement(alert) {
    const article = this.document.createElement("article");
    article.className = "rs-alert";
    article.dataset.alertId = alert.id;
    article.dataset.severity = alert.severity;
    article.dataset.status = alert.status;
    article.setAttribute("role", "status");

    const header = this.document.createElement("div");
    header.className = "rs-alert-header";

    const title = this.document.createElement("strong");
    title.className = "rs-alert-title";
    title.textContent = alert.title;

    const severity = this.document.createElement("span");
    severity.className = "rs-alert-severity";
    severity.textContent =
      SEVERITY_LABELS[alert.severity] ?? alert.severity;

    header.append(title, severity);
    article.appendChild(header);

    const message = this.document.createElement("p");
    message.className = "rs-alert-message";
    message.textContent = alert.message;
    article.appendChild(message);

    const details = this.document.createElement("div");
    details.className = "rs-alert-details";

    const source = this.document.createElement("span");
    source.textContent = `Source: ${alert.source}`;

    const timestamp = this.document.createElement("time");
    timestamp.dateTime = alert.updatedAt;
    timestamp.textContent = this.formatTimestamp(alert.updatedAt);

    details.append(source, timestamp);
    article.appendChild(details);

    if (alert.status === "active" && this.options.dismissible) {
      const dismissButton = this.document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "rs-alert-dismiss";
      dismissButton.dataset.action = "dismiss";
      dismissButton.dataset.alertId = alert.id;
      dismissButton.textContent = "Dismiss";
      dismissButton.setAttribute(
        "aria-label",
        `Dismiss alert: ${alert.title}`
      );

      article.appendChild(dismissButton);
    }

    if (alert.status !== "active") {
      const status = this.document.createElement("span");
      status.className = "rs-alert-status";
      status.textContent =
        alert.status.charAt(0).toUpperCase() + alert.status.slice(1);

      article.appendChild(status);
    }

    return article;
  }

  handleClick(event) {
    const target = event.target;

    if (!(target instanceof this.document.defaultView.Element)) {
      return;
    }

    const button = target.closest(
      'button[data-action="dismiss"][data-alert-id]'
    );

    if (!button || !this.container.contains(button)) {
      return;
    }

    const alertId = button.dataset.alertId;

    if (!alertId) {
      return;
    }

    try {
      this.alerts.dismiss(alertId);
    } catch (error) {
      this.logger?.error?.("Unable to dismiss dashboard alert.", error);
    }
  }

  formatTimestamp(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }

    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  injectStyles() {
    if (!this.document || this.document.getElementById("rs-alert-ui-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "rs-alert-ui-styles";

    style.textContent = `
      .route-statistics-alerts {
        display: grid;
        gap: 12px;
        width: 100%;
        box-sizing: border-box;
      }

      .rs-alert {
        position: relative;
        display: grid;
        gap: 10px;
        padding: 14px 16px;
        border: 1px solid #dbe2ea;
        border-left: 4px solid #64748b;
        border-radius: 10px;
        background: #ffffff;
        color: #172033;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
      }

      .rs-alert[data-severity="info"] {
        border-left-color: #0284c7;
      }

      .rs-alert[data-severity="warning"] {
        border-left-color: #d97706;
      }

      .rs-alert[data-severity="error"] {
        border-left-color: #dc2626;
      }

      .rs-alert[data-severity="critical"] {
        border-left-color: #7f1d1d;
      }

      .rs-alert-header,
      .rs-alert-details {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .rs-alert-title {
        font-size: 14px;
        font-weight: 700;
      }

      .rs-alert-severity,
      .rs-alert-status {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .rs-alert-message {
        margin: 0;
        font-size: 13px;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }

      .rs-alert-details {
        color: #64748b;
        font-size: 11px;
      }

      .rs-alert-dismiss {
        justify-self: start;
        padding: 6px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #f8fafc;
        color: #334155;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }

      .rs-alert-dismiss:hover {
        background: #e2e8f0;
      }

      .rs-alert-dismiss:focus-visible {
        outline: 2px solid #0284c7;
        outline-offset: 2px;
      }

      .rs-alerts-empty {
        margin: 0;
        padding: 16px;
        color: #64748b;
        font-size: 13px;
        text-align: center;
      }

      @media (max-width: 480px) {
        .rs-alert {
          padding: 12px;
        }

        .rs-alert-header {
          align-items: flex-start;
        }
      }
    `;

    this.document.head?.appendChild(style);
  }

  setOptions(options = {}) {
    this.assertActive();

    this.options = {
      ...this.options,
      ...options,
    };

    if (this.mounted) {
      this.render();
    }

    return this;
  }

  refresh() {
    return this.render();
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsDashboardAlertUI has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.container) {
      this.container.removeEventListener("click", this.onClick);
      this.container.classList.remove(this.options.className);
      this.container.removeAttribute("aria-live");
      this.container.removeAttribute("aria-relevant");
      this.container.replaceChildren();
    }

    this.mounted = false;
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertUI;