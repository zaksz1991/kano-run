const DEFAULT_DURATION = 3500;
const MAX_NOTIFICATIONS = 5;

export class NotificationSystem {
  constructor({ eventBus, container = null, duration = DEFAULT_DURATION } = {}) {
    this.eventBus = eventBus;
    this.container = container;
    this.duration = duration;
    this.notifications = [];
    this.listeners = [];
    this.element = null;
    this.initialized = false;
    this.nextId = 1;
  }

  initialize() {
    if (this.initialized) return this;

    this.createContainer();
    this.bindEvents();
    this.initialized = true;

    return this;
  }

  createContainer() {
    if (typeof document === "undefined") return;

    this.element =
      this.container ||
      document.querySelector("[data-kano-notifications]");

    if (!this.element) {
      this.element = document.createElement("div");
      this.element.dataset.kanoNotifications = "true";
      document.body.appendChild(this.element);
    }

    Object.assign(this.element.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      width: "min(360px, calc(100vw - 32px))",
      pointerEvents: "none",
    });
  }

  bindEvents() {
    this.subscribe("notification:show", (data) => {
      this.show(data?.message ?? data?.text ?? "", data || {});
    });

    this.subscribe("notification:success", (data) => {
      this.success(data?.message ?? data?.text ?? "", data || {});
    });

    this.subscribe("notification:error", (data) => {
      this.error(data?.message ?? data?.text ?? "", data || {});
    });

    this.subscribe("notification:warning", (data) => {
      this.warning(data?.message ?? data?.text ?? "", data || {});
    });

    this.subscribe("notification:info", (data) => {
      this.info(data?.message ?? data?.text ?? "", data || {});
    });

    this.subscribe("achievement:unlocked", (data) => {
      const name = data?.achievement?.name || data?.name;

      if (name) {
        this.success(`Achievement unlocked: ${name}`, {
          title: "Achievement",
          duration: 5000,
        });
      }
    });

    this.subscribe("mission:completed", (data) => {
      const name = data?.mission?.name || data?.name || "Mission";

      this.success(`${name} completed!`, {
        title: "Mission Complete",
      });
    });

    this.subscribe("game:error", (data) => {
      this.error(data?.message || "An unexpected game error occurred.");
    });
  }

  subscribe(eventName, callback) {
    if (!this.eventBus || typeof callback !== "function") return;

    if (typeof this.eventBus.on === "function") {
      const result = this.eventBus.on(eventName, callback);

      this.listeners.push({
        eventName,
        callback,
        unsubscribe:
          typeof result === "function" ? result : null,
      });

      return;
    }

    if (typeof this.eventBus.addEventListener === "function") {
      this.eventBus.addEventListener(eventName, callback);

      this.listeners.push({
        eventName,
        callback,
        domEvent: true,
      });
    }
  }

  publish(eventName, payload) {
    if (!this.eventBus) return;

    if (typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    } else if (typeof this.eventBus.dispatchEvent === "function") {
      const event =
        typeof CustomEvent !== "undefined"
          ? new CustomEvent(eventName, { detail: payload })
          : null;

      if (event) this.eventBus.dispatchEvent(event);
    }
  }

  show(message, options = {}) {
    const text = String(message ?? "").trim();

    if (!text) return null;

    const notification = {
      id: this.nextId++,
      message: text,
      title: options.title || "",
      type: this.normalizeType(options.type || "info"),
      duration: this.normalizeDuration(options.duration),
      createdAt: Date.now(),
      dismissed: false,
      timer: null,
      element: null,
    };

    this.notifications.push(notification);

    while (this.notifications.length > MAX_NOTIFICATIONS) {
      this.dismiss(this.notifications[0].id);
    }

    this.renderNotification(notification);

    if (notification.duration > 0) {
      notification.timer = setTimeout(() => {
        this.dismiss(notification.id);
      }, notification.duration);
    }

    this.publish("notification:displayed", {
      id: notification.id,
      message: notification.message,
      type: notification.type,
    });

    return notification.id;
  }

  success(message, options = {}) {
    return this.show(message, { ...options, type: "success" });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: "error" });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: "warning" });
  }

  info(message, options = {}) {
    return this.show(message, { ...options, type: "info" });
  }

  normalizeType(type) {
    const allowed = new Set([
      "success",
      "error",
      "warning",
      "info",
    ]);

    return allowed.has(type) ? type : "info";
  }

  normalizeDuration(duration) {
    if (duration === 0) return 0;

    const value = Number(duration);

    return Number.isFinite(value) && value > 0
      ? value
      : this.duration;
  }

  renderNotification(notification) {
    if (
      typeof document === "undefined" ||
      !this.element
    ) {
      return;
    }

    const colors = {
      success: "#166534",
      error: "#991b1b",
      warning: "#92400e",
      info: "#0b1e3a",
    };

    const card = document.createElement("div");

    Object.assign(card.style, {
      pointerEvents: "auto",
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #dbe3ee",
      borderLeft: `5px solid ${colors[notification.type]}`,
      borderRadius: "10px",
      padding: "14px 14px 14px 16px",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.18)",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      lineHeight: "1.5",
      overflowWrap: "anywhere",
      opacity: "0",
      transform: "translateX(12px)",
      transition: "opacity 180ms ease, transform 180ms ease",
    });

    const row = document.createElement("div");

    Object.assign(row.style, {
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
    });

    const content = document.createElement("div");
    content.style.flex = "1";

    if (notification.title) {
      const heading = document.createElement("div");
      heading.textContent = notification.title;

      Object.assign(heading.style, {
        fontWeight: "700",
        marginBottom: "4px",
      });

      content.appendChild(heading);
    }

    const body = document.createElement("div");
    body.textContent = notification.message;
    content.appendChild(body);

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "\u00d7";
    close.setAttribute("aria-label", "Dismiss notification");

    Object.assign(close.style, {
      border: "none",
      background: "transparent",
      color: "#64748b",
      cursor: "pointer",
      fontSize: "22px",
      lineHeight: "1",
      padding: "0 2px",
    });

    close.addEventListener("click", () => {
      this.dismiss(notification.id);
    });

    row.append(content, close);
    card.appendChild(row);
    this.element.appendChild(card);

    notification.element = card;

    requestAnimationFrame(() => {
      if (!notification.dismissed) {
        card.style.opacity = "1";
        card.style.transform = "translateX(0)";
      }
    });
  }

  dismiss(id) {
    const notification = this.notifications.find(
      (item) => item.id === id
    );

    if (!notification || notification.dismissed) return false;

    notification.dismissed = true;

    if (notification.timer) {
      clearTimeout(notification.timer);
      notification.timer = null;
    }

    const card = notification.element;

    if (card) {
      card.style.opacity = "0";
      card.style.transform = "translateX(12px)";

      setTimeout(() => {
        card.remove();
      }, 200);
    }

    this.notifications = this.notifications.filter(
      (item) => item.id !== id
    );

    this.publish("notification:dismissed", {
      id: notification.id,
      type: notification.type,
    });

    return true;
  }

  clear() {
    for (const notification of [...this.notifications]) {
      this.dismiss(notification.id);
    }
  }

  getActiveNotifications() {
    return this.notifications.map((item) => ({
      id: item.id,
      message: item.message,
      title: item.title,
      type: item.type,
      createdAt: item.createdAt,
    }));
  }

  update() {
    // Notifications use timers; no per-frame processing is required.
  }

  pause() {
    for (const notification of this.notifications) {
      if (notification.timer) {
        clearTimeout(notification.timer);
        notification.timer = null;
      }
    }
  }

  resume() {
    for (const notification of this.notifications) {
      if (
        !notification.dismissed &&
        notification.duration > 0 &&
        !notification.timer
      ) {
        const elapsed = Date.now() - notification.createdAt;
        const remaining = Math.max(
          0,
          notification.duration - elapsed
        );

        if (remaining === 0) {
          this.dismiss(notification.id);
        } else {
          notification.timer = setTimeout(() => {
            this.dismiss(notification.id);
          }, remaining);
        }
      }
    }
  }

  destroy() {
    this.clear();

    for (const listener of this.listeners) {
      if (listener.unsubscribe) {
        listener.unsubscribe();
      } else if (
        listener.domEvent &&
        this.eventBus &&
        typeof this.eventBus.removeEventListener === "function"
      ) {
        this.eventBus.removeEventListener(
          listener.eventName,
          listener.callback
        );
      } else if (
        this.eventBus &&
        typeof this.eventBus.off === "function"
      ) {
        this.eventBus.off(
          listener.eventName,
          listener.callback
        );
      }
    }

    this.listeners = [];

    if (this.element && !this.container) {
      this.element.remove();
    }

    this.element = null;
    this.initialized = false;
  }
}

export default NotificationSystem;