export class EventBus {
  constructor() {
    this.events = new Map();
    this.onceEvents = new WeakSet();
    this.destroyed = false;
  }

  on(eventName, callback) {
    this.assertActive();

    if (typeof eventName !== "string" || !eventName.trim()) {
      throw new TypeError("Event name must be a non-empty string.");
    }

    if (typeof callback !== "function") {
      throw new TypeError("Event callback must be a function.");
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    const listeners = this.events.get(eventName);
    listeners.add(callback);

    return () => this.off(eventName, callback);
  }

  once(eventName, callback) {
    this.assertActive();

    if (typeof callback !== "function") {
      throw new TypeError("Event callback must be a function.");
    }

    const wrapper = (payload) => {
      this.off(eventName, wrapper);
      callback(payload);
    };

    this.onceEvents.add(wrapper);

    return this.on(eventName, wrapper);
  }

  off(eventName, callback) {
    const listeners = this.events.get(eventName);

    if (!listeners) return false;

    const removed = listeners.delete(callback);

    if (listeners.size === 0) {
      this.events.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    this.assertActive();

    const listeners = this.events.get(eventName);

    if (!listeners?.size) return 0;

    let delivered = 0;

    for (const callback of [...listeners]) {
      // A listener may have been removed by an earlier callback.
      if (!listeners.has(callback)) continue;

      try {
        callback(payload);
        delivered += 1;
      } catch (error) {
        console.error(
          `[EventBus] Listener failed for "${eventName}":`,
          error,
        );
      }
    }

    return delivered;
  }

  listenerCount(eventName) {
    return this.events.get(eventName)?.size ?? 0;
  }

  eventNames() {
    return [...this.events.keys()];
  }

  removeAllListeners(eventName) {
    if (eventName !== undefined) {
      this.events.delete(eventName);
      return;
    }

    this.events.clear();
  }

  waitFor(eventName, options = {}) {
    this.assertActive();

    const { signal, timeout = 0 } = options;

    if (signal?.aborted) {
      return Promise.reject(
        new Error("Event wait was aborted."),
      );
    }

    return new Promise((resolve, reject) => {
      let timer = null;

      const cleanup = () => {
        unsubscribe();

        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }

        signal?.removeEventListener("abort", handleAbort);
      };

      const unsubscribe = this.on(eventName, (payload) => {
        cleanup();
        resolve(payload);
      });

      const handleAbort = () => {
        cleanup();
        reject(new Error("Event wait was aborted."));
      };

      signal?.addEventListener("abort", handleAbort, {
        once: true,
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(
            new Error(`Timed out waiting for "${eventName}".`),
          );
        }, timeout);
      }
    });
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("EventBus has been destroyed.");
    }
  }

  destroy() {
    this.events.clear();
    this.destroyed = true;
  }
}

export default EventBus;