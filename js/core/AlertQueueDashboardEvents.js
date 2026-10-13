export class AlertQueueDashboardEvents {
  constructor(options = {}) {
    this.maxHistory = this.normalizeLimit(options.maxHistory ?? 200);
    this.listeners = new Map();
    this.history = [];
    this.sequence = 0;
    this.destroyed = false;
  }

  on(eventName, listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    const name = this.normalizeEventName(eventName);

    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }

    this.listeners.get(name).add(listener);

    return () => this.off(name, listener);
  }

  once(eventName, listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    let unsubscribe;

    const wrapped = (event) => {
      unsubscribe?.();
      listener(event);
    };

    unsubscribe = this.on(eventName, wrapped);

    return unsubscribe;
  }

  off(eventName, listener) {
    const name = this.normalizeEventName(eventName);
    const group = this.listeners.get(name);

    if (!group) return false;

    const removed = group.delete(listener);

    if (group.size === 0) {
      this.listeners.delete(name);
    }

    return removed;
  }

  emit(eventName, detail = {}) {
    this.assertActive();

    const name = this.normalizeEventName(eventName);

    const event = Object.freeze({
      id: ++this.sequence,
      type: name,
      timestamp: new Date().toISOString(),
      detail: this.cloneDetail(detail),
    });

    this.history.push(event);

    if (this.history.length > this.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.maxHistory
      );
    }

    const callbacks = [
      ...(this.listeners.get(name) ?? []),
      ...(this.listeners.get("*") ?? []),
    ];

    const results = [];

    for (const callback of callbacks) {
      try {
        callback(event);
        results.push({ ok: true });
      } catch (error) {
        results.push({
          ok: false,
          error: error instanceof Error
            ? error.message
            : String(error),
        });
      }
    }

    return {
      event,
      delivered: callbacks.length,
      results,
    };
  }

  subscribe(listener) {
    return this.on("*", listener);
  }

  listenerCount(eventName) {
    if (eventName === undefined) {
      let count = 0;

      for (const group of this.listeners.values()) {
        count += group.size;
      }

      return count;
    }

    return this.listeners.get(
      this.normalizeEventName(eventName)
    )?.size ?? 0;
  }

  getHistory(options = {}) {
    const limit = this.normalizeLimit(
      options.limit ?? this.maxHistory
    );

    let events = [...this.history];

    if (options.eventName) {
      const name = this.normalizeEventName(options.eventName);

      events = events.filter((event) => event.type === name);
    }

    if (options.since) {
      const since = new Date(options.since).getTime();

      if (Number.isFinite(since)) {
        events = events.filter(
          (event) => new Date(event.timestamp).getTime() >= since
        );
      }
    }

    return events.slice(-limit).map((event) => ({
      ...event,
      detail: this.cloneDetail(event.detail),
    }));
  }

  clearHistory() {
    const count = this.history.length;
    this.history = [];

    return count;
  }

  normalizeEventName(eventName) {
    const name = String(eventName ?? "").trim();

    if (!name) {
      throw new TypeError("Event name cannot be empty.");
    }

    return name;
  }

  normalizeLimit(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 200;

    return Math.min(5000, Math.max(1, Math.floor(number)));
  }

  cloneDetail(detail) {
    try {
      const serialized = JSON.stringify(detail ?? {});

      return serialized === undefined
        ? {}
        : JSON.parse(serialized);
    } catch {
      return {
        serializationError: true,
        value: String(detail),
      };
    }
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("Dashboard events instance has been destroyed.");
    }
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    this.history = [];
  }
}