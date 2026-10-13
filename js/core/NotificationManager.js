class NotificationManager {
  constructor(options = {}) {
    this.options = {
      duration: 3000,
      maxNotifications: 5,
      containerId: "kano-run-notifications",
      position: "top-right",
      ...options,
    };

    this.notifications = new Map();
    this.listeners = new Set();
    this.nextId = 1;
    this.container = null;
  }

  init() {
    if (typeof document === "undefined") return this;

    this.container = document.getElementById(
      this.options.containerId
    );

    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = this.options.containerId;

      Object.assign(this.container.style, {
        position: "fixed",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "min(360px, calc(100vw - 32px))",
        maxHeight: "80vh",
        overflowY: "auto",
        pointerEvents: "none",
      });

      this.applyPosition();
      document.body.appendChild(this.container);
    }

    return this;
  }

  applyPosition() {
    if (!this.container) return;

    const positions = {
      "top-right": { top: "16px", right: "16px" },
      "top-left": { top: "16px", left: "16px" },
      "bottom-right": { bottom: "16px", right: "16px" },
      "bottom-left": { bottom: "16px", left: "16px" },
      "top-center": {
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
      },
    };

    Object.assign(
      this.container.style,
      positions[this.options.position] || positions["top-right"]
    );
  }

  show(message, options = {}) {
    if (typeof document === "undefined") {
      return null;
    }

    if (!this.container) this.init();

    const id = this.nextId++;
    const config = {
      type: "info",
      duration: this.options.duration,
      title: "",
      dismissible: true,
      ...options,
    };

    while (
      this.notifications.size >= this.options.maxNotifications
    ) {
      const oldestId = this.notifications.keys().next().value;
      if (oldestId === undefined) break;
      this.dismiss(oldestId);
    }

    const element = document.createElement("div");

    element.className = `kr-notification kr-notification-${config.type}`;
    element.setAttribute("role", this.getRole(config.type));

    Object.assign(element.style, {
      padding: "12px 16px",
      borderRadius: "8px",
      background: this.getBackground(config.type),
      color: "#ffffff",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      lineHeight: "1.4",
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      pointerEvents: "auto",
      opacity: "0",
      transform: "translateY(-6px)",
      transition: "opacity 160ms ease, transform 160ms ease",
    });

    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.minWidth = "0";

    if (config.title) {
      const title = document.createElement("strong");
      title.textContent = String(config.title);
      title.style.display = "block";
      title.style.marginBottom = "4px";
      content.appendChild(title);
    }

    const text = document.createElement("div");
    text.textContent = String(message);
    content.appendChild(text);
    element.appendChild(content);

    if (config.dismissible) {
      const closeButton = document.createElement("button");

      closeButton.type = "button";
      closeButton.textContent = "×";
      closeButton.setAttribute("aria-label", "Dismiss notification");

      Object.assign(closeButton.style, {
        border: "0",
        padding: "0 2px",
        background: "transparent",
        color: "inherit",
        fontSize: "22px",
        lineHeight: "1",
        cursor: "pointer",
      });

      closeButton.addEventListener("click", () => this.dismiss(id));
      element.appendChild(closeButton);
    }

    this.container.appendChild(element);

    const notification = {
      id,
      message: String(message),
      type: config.type,
      element,
      timer: null,
    };

    this.notifications.set(id, notification);

    requestAnimationFrame(() => {
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    });

    if (config.duration > 0) {
      notification.timer = setTimeout(
        () => this.dismiss(id),
        config.duration
      );
    }

    this.emit({ action: "show", id, message, type: config.type });

    return id;
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

  getRole(type) {
    return type === "error" || type === "warning"
      ? "alert"
      : "status";
  }

  getBackground(type) {
    const backgrounds = {
      success: "#166534",
      error: "#991b1b",
      warning: "#92400e",
      info: "#0b1e3a",
    };

    return backgrounds[type] || backgrounds.info;
  }

  dismiss(id) {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    clearTimeout(notification.timer);
    this.notifications.delete(id);

    const element = notification.element;

    element.style.opacity = "0";
    element.style.transform = "translateY(-6px)";

    setTimeout(() => element.remove(), 180);

    this.emit({
      action: "dismiss",
      id,
      message: notification.message,
      type: notification.type,
    });

    return true;
  }

  dismissAll() {
    for (const id of [...this.notifications.keys()]) {
      this.dismiss(id);
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Notification listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Notification listener failed:", error);
      }
    }
  }

  destroy() {
    for (const notification of this.notifications.values()) {
      clearTimeout(notification.timer);
      notification.element.remove();
    }

    this.notifications.clear();
    this.listeners.clear();

    if (this.container?.id === this.options.containerId) {
      this.container.remove();
    }

    this.container = null;
  }
}

export default NotificationManager;