const DEFAULT_CONFIG = {
  cooldownMs: 60000,
  repeatNotifications: false,
  maxHistory: 200,
};

export class AlertDeliveryQueueHealthNotifications {
  constructor({
    health,
    notify = null,
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!health) {
      throw new Error("A health monitor is required.");
    }

    this.health = health;
    this.notify = notify;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.clock = clock;

    this.lastNotified = new Map();
    this.history = [];
    this.listeners = new Set();
    this.unsubscribeHealth = null;
    this.started = false;
  }

  start() {
    if (this.started) {
      return this.getStatus();
    }

    if (typeof this.health.subscribe === "function") {
      this.unsubscribeHealth = this.health.subscribe((event) => {
        if (event?.type === "health_check" && event.health) {
          this.process(event.health);
        }
      });
    }

    this.started = true;

    return this.getStatus();
  }

  stop() {
    this.unsubscribeHealth?.();
    this.unsubscribeHealth = null;
    this.started = false;

    return this.getStatus();
  }

  process(health) {
    if (!health || typeof health !== "object") {
      throw new TypeError("A health result is required.");
    }

    const issues = Array.isArray(health.issues)
      ? health.issues
      : [];

    const notifications = [];

    for (const issue of issues) {
      const key = String(issue.code ?? issue.message ?? "UNKNOWN");
      const now = this.clock();
      const lastTime = this.lastNotified.get(key);

      if (
        !this.config.repeatNotifications &&
        lastTime !== undefined &&
        now - lastTime < this.config.cooldownMs
      ) {
        continue;
      }

      const notification = {
        id: this.#createId(),
        key,
        severity: issue.severity ?? "info",
        code: issue.code ?? "UNKNOWN",
        message: String(issue.message ?? "Health issue detected."),
        healthStatus: health.status ?? "unknown",
        createdAt: new Date(now).toISOString(),
        timestamp: now,
        acknowledged: false,
      };

      this.lastNotified.set(key, now);
      this.history.push(notification);
      notifications.push(notification);

      this.#deliver(notification);
    }

    this.#trimHistory();

    this.#emit({
      type: "notifications_processed",
      count: notifications.length,
      notifications,
    });

    return notifications;
  }

  async #deliver(notification) {
    if (typeof this.notify !== "function") {
      return;
    }

    try {
      await this.notify(notification);

      this.#emit({
        type: "notification_delivered",
        notification,
      });
    } catch (error) {
      notification.deliveryError =
        error instanceof Error ? error.message : String(error);

      this.#emit({
        type: "notification_failed",
        notification,
        error: notification.deliveryError,
      });
    }
  }

  acknowledge(id) {
    const notification = this.history.find(
      (item) => item.id === String(id),
    );

    if (!notification) {
      return {
        success: false,
        error: "Notification not found.",
      };
    }

    notification.acknowledged = true;
    notification.acknowledgedAt = new Date(
      this.clock(),
    ).toISOString();

    this.#emit({
      type: "notification_acknowledged",
      notification,
    });

    return {
      success: true,
      notification,
    };
  }

  acknowledgeAll() {
    const timestamp = new Date(this.clock()).toISOString();
    let count = 0;

    for (const notification of this.history) {
      if (!notification.acknowledged) {
        notification.acknowledged = true;
        notification.acknowledgedAt = timestamp;
        count += 1;
      }
    }

    this.#emit({
      type: "notifications_acknowledged",
      count,
    });

    return {
      success: true,
      count,
    };
  }

  getNotifications({
    limit = 50,
    acknowledged,
    severity,
  } = {}) {
    let items = this.history;

    if (typeof acknowledged === "boolean") {
      items = items.filter(
        (item) => item.acknowledged === acknowledged,
      );
    }

    if (severity) {
      items = items.filter(
        (item) => item.severity === severity,
      );
    }

    return items
      .slice(-Math.max(1, Number(limit) || 50))
      .reverse();
  }

  getStatus() {
    const total = this.history.length;
    const acknowledged = this.history.filter(
      (item) => item.acknowledged,
    ).length;

    return {
      started: this.started,
      totalNotifications: total,
      unacknowledged: total - acknowledged,
      acknowledged,
      trackedIssues: this.lastNotified.size,
      deliveryEnabled: typeof this.notify === "function",
    };
  }

  clearHistory() {
    this.history = [];

    this.#emit({
      type: "history_cleared",
      timestamp: this.clock(),
    });
  }

  resetCooldowns() {
    this.lastNotified.clear();
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
    this.lastNotified.clear();
  }

  #createId() {
    return `health-notice-${this.clock()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  #trimHistory() {
    const maximum = Math.max(
      1,
      Number(this.config.maxHistory) || DEFAULT_CONFIG.maxHistory,
    );

    if (this.history.length > maximum) {
      this.history.splice(0, this.history.length - maximum);
    }
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not interrupt notification processing.
      }
    }
  }
}

export default AlertDeliveryQueueHealthNotifications;