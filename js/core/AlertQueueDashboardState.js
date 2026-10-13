export class AlertQueueDashboardState {
  constructor(options = {}) {
    this.maxHistory = this.normalizeLimit(options.maxHistory ?? 100);
    this.state = {
      status: "idle",
      loading: false,
      error: null,
      metrics: {},
      notifications: [],
      lastUpdated: null,
      history: [],
    };

    this.listeners = new Set();
  }

  getState() {
    return {
      ...this.state,
      metrics: { ...this.state.metrics },
      notifications: [...this.state.notifications],
      history: [...this.state.history],
    };
  }

  setLoading(loading) {
    this.update({
      loading: Boolean(loading),
      error: loading ? null : this.state.error,
    });
  }

  setStatus(status) {
    this.update({
      status: String(status ?? "unknown"),
    });
  }

  setError(error) {
    this.update({
      loading: false,
      error: error instanceof Error
        ? error.message
        : String(error ?? "Unknown error"),
      status: "error",
    });
  }

  clearError() {
    this.update({ error: null });

    if (this.state.status === "error") {
      this.update({ status: "idle" });
    }
  }

  setMetrics(metrics = {}) {
    if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
      throw new TypeError("Metrics must be an object.");
    }

    this.update({
      metrics: { ...metrics },
    });
  }

  setNotifications(notifications = []) {
    if (!Array.isArray(notifications)) {
      throw new TypeError("Notifications must be an array.");
    }

    this.update({
      notifications: [...notifications],
    });
  }

  addNotification(notification) {
    if (!notification || typeof notification !== "object") {
      throw new TypeError("A notification object is required.");
    }

    const id = notification.id;

    const notifications = this.state.notifications.filter(
      (item) => item.id !== id
    );

    notifications.unshift({ ...notification });

    this.update({ notifications });
  }

  removeNotification(notificationId) {
    const notifications = this.state.notifications.filter(
      (item) => item.id !== notificationId
    );

    if (notifications.length === this.state.notifications.length) {
      return false;
    }

    this.update({ notifications });
    return true;
  }

  recordSnapshot(snapshot = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      status: snapshot.status ?? this.state.status,
      metrics: {
        ...this.state.metrics,
        ...(snapshot.metrics ?? {}),
      },
      notificationCount: this.state.notifications.length,
    };

    const history = [entry, ...this.state.history].slice(
      0,
      this.maxHistory
    );

    this.update({ history });
    return { ...entry, metrics: { ...entry.metrics } };
  }

  applyDashboardData(data = {}) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Dashboard data must be an object.");
    }

    const updates = {
      loading: false,
      error: null,
      lastUpdated: new Date().toISOString(),
    };

    if (data.status !== undefined) {
      updates.status = data.status;
    }

    if (data.metrics && typeof data.metrics === "object") {
      updates.metrics = { ...data.metrics };
    }

    if (Array.isArray(data.notifications)) {
      updates.notifications = [...data.notifications];
    }

    this.update(updates);
    this.recordSnapshot(data);

    return this.getState();
  }

  update(patch = {}) {
    this.state = {
      ...this.state,
      ...patch,
    };

    this.notify();
    return this.getState();
  }

  subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    if (options.emitCurrent === true) {
      listener(this.getState());
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const snapshot = this.getState();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Dashboard state listener failed:", error);
      }
    }
  }

  clearHistory() {
    this.update({ history: [] });
  }

  reset() {
    this.state = {
      status: "idle",
      loading: false,
      error: null,
      metrics: {},
      notifications: [],
      lastUpdated: null,
      history: [],
    };

    this.notify();
    return this.getState();
  }

  normalizeLimit(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 100;

    return Math.min(1000, Math.max(1, Math.floor(number)));
  }

  destroy() {
    this.listeners.clear();
  }
}