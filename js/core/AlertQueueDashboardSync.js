export class AlertQueueDashboardSync {
  constructor(options = {}) {
    this.state = options.state ?? null;
    this.persistence = options.persistence ?? null;
    this.channelName = options.channelName ?? "kano-run-alert-dashboard";
    this.storageKey = options.storageKey ?? "kano-run-alert-dashboard";
    this.window = options.window ?? globalThis.window;
    this.BroadcastChannel = options.BroadcastChannel ??
      globalThis.BroadcastChannel;

    this.channel = null;
    this.unsubscribe = null;
    this.started = false;
    this.applyingRemote = false;
    this.lastRevision = 0;
    this.origin = this.createOrigin();
    this.listeners = new Set();
    this.handleStorage = this.handleStorage.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
  }

  start() {
    if (this.started) return this;

    this.started = true;

    if (typeof this.BroadcastChannel === "function") {
      try {
        this.channel = new this.BroadcastChannel(this.channelName);
        this.channel.addEventListener("message", this.handleMessage);
      } catch {
        this.channel = null;
      }
    }

    this.window?.addEventListener?.("storage", this.handleStorage);

    if (typeof this.state?.subscribe === "function") {
      this.unsubscribe = this.state.subscribe((snapshot) => {
        if (!this.applyingRemote) {
          this.publish(snapshot);
        }
      });
    }

    return this;
  }

  publish(snapshot = {}) {
    if (!this.started || this.applyingRemote) {
      return { ok: false, reason: "sync_inactive" };
    }

    const message = {
      type: "dashboard-state",
      origin: this.origin,
      revision: ++this.lastRevision,
      timestamp: Date.now(),
      state: this.sanitize(snapshot),
    };

    try {
      this.channel?.postMessage(message);
    } catch (error) {
      this.emit("error", { error, operation: "publish" });
    }

    try {
      this.persistence?.save?.(message.state);
    } catch (error) {
      this.emit("error", { error, operation: "persist" });
    }

    return {
      ok: true,
      revision: message.revision,
    };
  }

  handleMessage(event) {
    this.applyMessage(event?.data);
  }

  handleStorage(event) {
    if (!event || event.key !== this.storageKey || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue);

      if (payload?.state) {
        this.applyMessage({
          type: "dashboard-state",
          origin: "storage",
          revision: Number(payload.revision) || Date.now(),
          timestamp: payload.timestamp ?? Date.now(),
          state: payload.state,
        });
      }
    } catch (error) {
      this.emit("error", { error, operation: "storage-parse" });
    }
  }

  applyMessage(message) {
    if (!this.started || !message || typeof message !== "object") {
      return false;
    }

    if (message.type !== "dashboard-state") return false;
    if (message.origin === this.origin) return false;

    const revision = Number(message.revision) || 0;

    if (revision > 0 && revision <= this.lastRevision) {
      return false;
    }

    if (!message.state || typeof message.state !== "object") {
      return false;
    }

    this.lastRevision = Math.max(this.lastRevision, revision);
    this.applyingRemote = true;

    try {
      if (typeof this.state?.applyDashboardData === "function") {
        this.state.applyDashboardData(this.sanitize(message.state));
      } else if (typeof this.state?.update === "function") {
        this.state.update(this.sanitize(message.state));
      } else {
        return false;
      }

      this.emit("synced", {
        origin: message.origin,
        revision,
        timestamp: message.timestamp ?? null,
      });

      return true;
    } catch (error) {
      this.emit("error", { error, operation: "apply" });
      return false;
    } finally {
      this.applyingRemote = false;
    }
  }

  sanitize(state) {
    const source =
      state && typeof state === "object" && !Array.isArray(state)
        ? state
        : {};

    return {
      status: String(source.status ?? "unknown"),
      loading: Boolean(source.loading),
      error: source.error == null ? null : String(source.error),
      metrics:
        source.metrics &&
        typeof source.metrics === "object" &&
        !Array.isArray(source.metrics)
          ? { ...source.metrics }
          : {},
      notifications: Array.isArray(source.notifications)
        ? source.notifications.slice(0, 500)
        : [],
      lastUpdated: source.lastUpdated ?? null,
      history: Array.isArray(source.history)
        ? source.history.slice(0, 100)
        : [],
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(type, detail = {}) {
    for (const listener of this.listeners) {
      try {
        listener({ type, ...detail });
      } catch (error) {
        console.error("Dashboard sync listener failed:", error);
      }
    }
  }

  createOrigin() {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
    } catch {
      // Fall back to a timestamp-based identifier.
    }

    return `dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  stop() {
    if (!this.started) return;

    this.started = false;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.window?.removeEventListener?.("storage", this.handleStorage);

    if (this.channel) {
      this.channel.removeEventListener("message", this.handleMessage);
      this.channel.close();
      this.channel = null;
    }

    this.listeners.clear();
  }
}