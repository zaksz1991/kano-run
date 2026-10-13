import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  SHOWN: "notification:shown",
  CLICKED: "notification:clicked",
  CLOSED: "notification:closed",
  ERROR: "notification:error",
  PERMISSION_CHANGED: "notification:permission-changed",
});

const DEFAULTS = Object.freeze({
  enabled: true,
  browserNotifications: true,
  inPageNotifications: true,
  minSeverity: "warning",
  durationMs: 6000,
  maxVisible: 4,
  deduplicateWindowMs: 10000,
  requireInteractionForCritical: true,
});

const SEVERITY_LEVELS = Object.freeze({
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
});

export class RouteStatisticsDashboardAlertNotifications {
  constructor({
    alertManager = null,
    alerts = null,
    container = null,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null,
    options = {},
  } = {}) {
    this.alertManager = alertManager;
    this.alerts = alerts ?? alertManager?.alerts ?? null;
    this.document = documentRef;
    this.window = windowRef;
    this.logger =
      logger ?? new Logger("RouteStatisticsDashboardAlertNotifications");

    this.options = {
      ...DEFAULTS,
      ...options,
    };

    this.container = this.resolveContainer(container);
    this.unsubscribe = null;
    this.notificationHandles = new Map();
    this.recentKeys = new Map();
    this.listeners = new Set();
    this.permissionRequest = null;
    this.mounted = false;
    this.disposed = false;
    this.sequence = 0;

    this.onContainerClick = this.handleContainerClick.bind(this);
    this.onVisibilityChange = this.handleVisibilityChange.bind(this);
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

    if (
      this.options.inPageNotifications &&
      !this.container &&
      this.document?.body
    ) {
      this.container = this.createContainer();
    }

    if (this.container) {
      this.container.addEventListener("click", this.onContainerClick);
    }

    this.document?.addEventListener(
      "visibilitychange",
      this.onVisibilityChange
    );

    if (this.alerts?.subscribe) {
      this.unsubscribe = this.alerts.subscribe((event) => {
        this.handleAlertEvent(event);
      });
    }

    this.mounted = true;

    return this;
  }

  createContainer() {
    const container = this.document.createElement("section");

    container.className = "rs-alert-notifications";
    container.setAttribute("aria-label", "Dashboard notifications");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions");

    this.injectStyles();
    this.document.body.appendChild(container);

    return container;
  }

  injectStyles() {
    if (
      !this.document?.head ||
      this.document.getElementById("rs-alert-notifications-styles")
    ) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "rs-alert-notifications-styles";

    style.textContent = `
      .rs-alert-notifications {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 10000;
        display: grid;
        gap: 10px;
        width: min(380px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        pointer-events: none;
      }

      .rs-alert-notification {
        display: grid;
        gap: 8px;
        padding: 14px;
        border: 1px solid #dbe2ea;
        border-left: 4px solid #64748b;
        border-radius: 10px;
        background: #fff;
        color: #172033;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .16);
        font: 13px/1.5 system-ui, sans-serif;
        pointer-events: auto;
        animation: rs-alert-enter 160ms ease-out;
      }

      .rs-alert-notification[data-severity="info"] {
        border-left-color: #0284c7;
      }

      .rs-alert-notification[data-severity="warning"] {
        border-left-color: #d97706;
      }

      .rs-alert-notification[data-severity="error"] {
        border-left-color: #dc2626;
      }

      .rs-alert-notification[data-severity="critical"] {
        border-left-color: #7f1d1d;
      }

      .rs-alert-notification-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .rs-alert-notification-title {
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .rs-alert-notification-message {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .rs-alert-notification-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .rs-alert-notification-button {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 5px 9px;
        background: #f8fafc;
        color: #334155;
        font: inherit;
        cursor: pointer;
      }

      .rs-alert-notification-button:focus-visible {
        outline: 2px solid #0284c7;
        outline-offset: 2px;
      }

      @keyframes rs-alert-enter {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (prefers-reduced-motion: reduce) {
        .rs-alert-notification {
          animation: none;
        }
      }
    `;

    this.document.head.appendChild(style);
  }

  handleAlertEvent(event) {
    if (!this.options.enabled || !event) {
      return;
    }

    const type = event.type;
    const alert = event.payload;

    if (!alert || !alert.id) {
      return;
    }

    if (type.endsWith(":created")) {
      this.notify(alert).catch((error) => this.reportError(error));
      return;
    }

    if (
      type.endsWith(":resolved") ||
      type.endsWith(":dismissed")
    ) {
      this.closeNotification(alert.id);
    }
  }

  async notify(alert) {
    this.assertActive();

    if (!this.options.enabled || !this.meetsSeverityThreshold(alert)) {
      return {
        shown: false,
        reason: "disabled_or_below_severity_threshold",
      };
    }

    const dedupeKey = `${alert.id}:${alert.severity}:${alert.message}`;

    if (this.isDuplicate(dedupeKey)) {
      return {
        shown: false,
        reason: "duplicate",
      };
    }

    this.rememberKey(dedupeKey);

    const results = [];

    if (this.options.inPageNotifications && this.container) {
      const inPage = this.showInPageNotification(alert);

      if (inPage) {
        results.push("in-page");
      }
    }

    if (
      this.options.browserNotifications &&
      this.document?.visibilityState === "hidden"
    ) {
      const browserShown = await this.showBrowserNotification(alert);

      if (browserShown) {
        results.push("browser");
      }
    }

    if (results.length > 0) {
      this.emit(EVENTS.SHOWN, {
        alertId: alert.id,
        channels: results,
        severity: alert.severity,
      });
    }

    return {
      shown: results.length > 0,
      channels: results,
    };
  }

  meetsSeverityThreshold(alert) {
    const actual = SEVERITY_LEVELS[alert?.severity] ?? 0;
    const minimum = SEVERITY_LEVELS[this.options.minSeverity] ?? 2;

    return actual >= minimum;
  }

  isDuplicate(key) {
    const previous = this.recentKeys.get(key);

    if (!previous) {
      return false;
    }

    if (Date.now() - previous > this.options.deduplicateWindowMs) {
      this.recentKeys.delete(key);
      return false;
    }

    return true;
  }

  rememberKey(key) {
    const now = Date.now();

    this.recentKeys.set(key, now);

    for (const [existingKey, timestamp] of this.recentKeys.entries()) {
      if (now - timestamp > this.options.deduplicateWindowMs) {
        this.recentKeys.delete(existingKey);
      }
    }

    if (this.recentKeys.size > 500) {
      const oldestKey = this.recentKeys.keys().next().value;

      if (oldestKey !== undefined) {
        this.recentKeys.delete(oldestKey);
      }
    }
  }

  showInPageNotification(alert) {
    if (!this.container || !this.document) {
      return false;
    }

    const existing = this.notificationHandles.get(alert.id);

    if (existing?.element?.isConnected) {
      existing.element.querySelector(
        ".rs-alert-notification-message"
      ).textContent = alert.message;

      existing.element.querySelector(
        ".rs-alert-notification-title"
      ).textContent = alert.title;

      return true;
    }

    const maxVisible = Math.max(
      1,
      Math.floor(Number(this.options.maxVisible) || 4)
    );

    while (this.container.children.length >= maxVisible) {
      const oldest = this.container.firstElementChild;

      if (!oldest) {
        break;
      }

      this.removeNotificationElement(oldest);
    }

    const element = this.document.createElement("article");
    element.className = "rs-alert-notification";
    element.dataset.alertId = alert.id;
    element.dataset.severity = alert.severity;
    element.setAttribute(
      "role",
      alert.severity === "critical" || alert.severity === "error"
        ? "alert"
        : "status"
    );

    const header = this.document.createElement("div");
    header.className = "rs-alert-notification-header";

    const title = this.document.createElement("strong");
    title.className = "rs-alert-notification-title";
    title.textContent = alert.title || "Dashboard alert";

    header.appendChild(title);
    element.appendChild(header);

    const message = this.document.createElement("p");
    message.className = "rs-alert-notification-message";
    message.textContent = alert.message;
    element.appendChild(message);

    const actions = this.document.createElement("div");
    actions.className = "rs-alert-notification-actions";

    const dismiss = this.document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "rs-alert-notification-button";
    dismiss.dataset.action = "close";
    dismiss.dataset.alertId = alert.id;
    dismiss.textContent = "Close";
    dismiss.setAttribute(
      "aria-label",
      `Close notification: ${alert.title || "Dashboard alert"}`
    );

    actions.appendChild(dismiss);
    element.appendChild(actions);
    this.container.appendChild(element);

    const handle = {
      element,
      timer: null,
      sequence: ++this.sequence,
    };

    const duration = Math.max(
      0,
      Number(this.options.durationMs) || 0
    );

    const keepOpen =
      alert.severity === "critical" &&
      this.options.requireInteractionForCritical;

    if (duration > 0 && !keepOpen) {
      handle.timer = globalThis.setTimeout(() => {
        this.closeNotification(alert.id);
      }, duration);
    }

    this.notificationHandles.set(alert.id, handle);

    return true;
  }

  async showBrowserNotification(alert) {
    if (
      !this.options.browserNotifications ||
      !this.window ||
      !("Notification" in this.window)
    ) {
      return false;
    }

    try {
      let permission = this.window.Notification.permission;

      if (permission === "default") {
        permission = await this.requestPermission();
      }

      if (permission !== "granted") {
        return false;
      }

      const notification = new this.window.Notification(
        alert.title || "Dashboard alert",
        {
          body: alert.message,
          tag: `route-statistics-alert-${alert.id}`,
          requireInteraction:
            alert.severity === "critical" &&
            this.options.requireInteractionForCritical,
        }
      );

      notification.onclick = () => {
        this.window?.focus?.();

        this.emit(EVENTS.CLICKED, {
          alertId: alert.id,
          channel: "browser",
        });

        notification.close();
      };

      notification.onclose = () => {
        this.emit(EVENTS.CLOSED, {
          alertId: alert.id,
          channel: "browser",
        });
      };

      return true;
    } catch (error) {
      this.reportError(error);
      return false;
    }
  }

  requestPermission() {
    if (!this.window || !("Notification" in this.window)) {
      return Promise.resolve("unsupported");
    }

    if (this.permissionRequest) {
      return this.permissionRequest;
    }

    this.permissionRequest = this.window.Notification.requestPermission()
      .then((permission) => {
        this.emit(EVENTS.PERMISSION_CHANGED, { permission });
        return permission;
      })
      .catch((error) => {
        this.reportError(error);
        return "denied";
      })
      .finally(() => {
        this.permissionRequest = null;
      });

    return this.permissionRequest;
  }

  handleContainerClick(event) {
    const target = event.target;

    if (!(target instanceof this.window?.Element)) {
      return;
    }

    const button = target.closest(
      'button[data-action="close"][data-alert-id]'
    );

    if (!button || !this.container?.contains(button)) {
      return;
    }

    const alertId = button.dataset.alertId;

    this.closeNotification(alertId);

    this.emit(EVENTS.CLOSED, {
      alertId,
      channel: "in-page",
      reason: "user",
    });
  }

  handleVisibilityChange() {
    if (this.document?.visibilityState === "visible") {
      return;
    }

    // Browser notifications are emitted when new alerts arrive while hidden.
  }

  closeNotification(alertId) {
    const handle = this.notificationHandles.get(String(alertId));

    if (!handle) {
      return false;
    }

    if (handle.timer !== null) {
      globalThis.clearTimeout(handle.timer);
    }

    handle.element?.remove();
    this.notificationHandles.delete(String(alertId));

    return true;
  }

  removeNotificationElement(element) {
    const alertId = element?.dataset?.alertId;

    if (alertId) {
      this.closeNotification(alertId);
      return;
    }

    element?.remove();
  }

  setOptions(options = {}) {
    this.assertActive();

    this.options = {
      ...this.options,
      ...options,
    };

    return { ...this.options };
  }

  getStatus() {
    return {
      enabled: this.options.enabled,
      mounted: this.mounted,
      disposed: this.disposed,
      inPageNotifications: this.options.inPageNotifications,
      browserNotifications: this.options.browserNotifications,
      notificationPermission:
        this.window && "Notification" in this.window
          ? this.window.Notification.permission
          : "unsupported",
      activeInPageNotifications: this.notificationHandles.size,
      deduplicationEntries: this.recentKeys.size,
    };
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Notification listener must be a function.");
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

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logger?.warn?.(
          "Notification event listener failed.",
          error
        );
      }
    }
  }

  reportError(error) {
    const message =
      error instanceof Error ? error.message : String(error);

    this.logger?.warn?.("Dashboard notification failed.", error);

    this.emit(EVENTS.ERROR, {
      message,
      occurredAt: new Date().toISOString(),
    });
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertNotifications has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;

    this.document?.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange
    );

    this.container?.removeEventListener(
      "click",
      this.onContainerClick
    );

    for (const alertId of [...this.notificationHandles.keys()]) {
      this.closeNotification(alertId);
    }

    this.container?.remove();
    this.recentKeys.clear();
    this.listeners.clear();

    this.mounted = false;
    this.disposed = true;
  }
}

export {
  DEFAULTS as ROUTE_STATISTICS_DASHBOARD_NOTIFICATION_DEFAULTS,
  EVENTS as RouteStatisticsDashboardAlertNotificationEvents,
};

export default RouteStatisticsDashboardAlertNotifications;