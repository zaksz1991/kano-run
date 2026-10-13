class EventEmitter {
  #events = new Map();
  #maxListeners;
  #destroyed = false;
  #logger;

  constructor(options = {}) {
    const { maxListeners = 100, logger = null } = options;

    this.#maxListeners = Math.max(
      1,
      Math.floor(Number(maxListeners) || 100)
    );

    this.#logger = logger;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get eventNames() {
    return [...this.#events.keys()];
  }

  get listenerCount() {
    let count = 0;

    for (const listeners of this.#events.values()) {
      count += listeners.size;
    }

    return count;
  }

  on(event, listener, options = {}) {
    this.#assertActive();
    this.#validate(event, listener);

    const { once = false, signal = null } = options;

    if (signal?.aborted) {
      return () => {};
    }

    const eventName = String(event);

    if (!this.#events.has(eventName)) {
      this.#events.set(eventName, new Set());
    }

    const listeners = this.#events.get(eventName);

    const record = {
      listener,
      once: Boolean(once),
      active: true,
      abortHandler: null,
    };

    const unsubscribe = () => {
      if (!record.active) {
        return false;
      }

      record.active = false;
      listeners.delete(record);

      if (signal && record.abortHandler) {
        signal.removeEventListener("abort", record.abortHandler);
      }

      if (listeners.size === 0) {
        this.#events.delete(eventName);
      }

      return true;
    };

    record.unsubscribe = unsubscribe;
    listeners.add(record);

    if (signal) {
      record.abortHandler = unsubscribe;
      signal.addEventListener("abort", record.abortHandler, {
        once: true,
      });
    }

    if (listeners.size > this.#maxListeners) {
      this.#logWarning(
        `Event "${eventName}" has ${listeners.size} listeners.`
      );
    }

    return unsubscribe;
  }

  once(event, listener, options = {}) {
    return this.on(event, listener, {
      ...options,
      once: true,
    });
  }

  emit(event, ...args) {
    this.#assertActive();

    const eventName = String(event);
    const listeners = this.#events.get(eventName);

    if (!listeners || listeners.size === 0) {
      return false;
    }

    for (const record of [...listeners]) {
      if (!record.active) {
        continue;
      }

      if (record.once) {
        record.unsubscribe();
      }

      try {
        record.listener(...args);
      } catch (error) {
        this.#logError(
          `Listener failed for event "${eventName}".`,
          error
        );
      }
    }

    return true;
  }

  async emitAsync(event, ...args) {
    this.#assertActive();

    const eventName = String(event);
    const listeners = this.#events.get(eventName);

    if (!listeners || listeners.size === 0) {
      return [];
    }

    const pending = [];

    for (const record of [...listeners]) {
      if (!record.active) {
        continue;
      }

      if (record.once) {
        record.unsubscribe();
      }

      try {
        pending.push(Promise.resolve(record.listener(...args)));
      } catch (error) {
        pending.push(Promise.reject(error));
      }
    }

    return Promise.allSettled(pending);
  }

  off(event, listener) {
    this.#assertActive();

    const listeners = this.#events.get(String(event));

    if (!listeners) {
      return 0;
    }

    let removed = 0;

    for (const record of [...listeners]) {
      if (record.listener === listener && record.unsubscribe()) {
        removed++;
      }
    }

    return removed;
  }

  removeAllListeners(event = null) {
    this.#assertActive();

    if (event !== null) {
      const listeners = this.#events.get(String(event));

      if (!listeners) {
        return 0;
      }

      const count = listeners.size;

      for (const record of [...listeners]) {
        record.unsubscribe();
      }

      this.#events.delete(String(event));

      return count;
    }

    const count = this.listenerCount;

    for (const listeners of this.#events.values()) {
      for (const record of [...listeners]) {
        record.unsubscribe();
      }
    }

    this.#events.clear();

    return count;
  }

  hasListeners(event) {
    return (this.#events.get(String(event))?.size || 0) > 0;
  }

  listeners(event) {
    return [...(this.#events.get(String(event)) || [])]
      .filter((record) => record.active)
      .map((record) => record.listener);
  }

  waitFor(event, options = {}) {
    this.#assertActive();

    const { signal = null, timeout = 0 } = options;

    return new Promise((resolve, reject) => {
      let timer = null;
      let settled = false;
      let unsubscribe = () => {};

      const cleanup = () => {
        unsubscribe();

        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }

        signal?.removeEventListener("abort", onAbort);
      };

      const finish = (callback, value) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback(value);
      };

      const onAbort = () => {
        finish(
          reject,
          signal.reason || new Error("Waiting for event was aborted.")
        );
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      unsubscribe = this.once(event, (...args) => {
        finish(resolve, args);
      });

      signal?.addEventListener("abort", onAbort, { once: true });

      if (Number(timeout) > 0) {
        timer = setTimeout(() => {
          finish(
            reject,
            new Error(`Timed out waiting for event "${String(event)}".`)
          );
        }, Number(timeout));
      }
    });
  }

  #validate(event, listener) {
    if (event === undefined || event === null || event === "") {
      throw new TypeError("An event name is required.");
    }

    if (typeof listener !== "function") {
      throw new TypeError("Event listener must be a function.");
    }
  }

  #logWarning(message) {
    if (this.#logger?.warn) {
      this.#logger.warn(message);
    } else if (typeof console !== "undefined" && console.warn) {
      console.warn(message);
    }
  }

  #logError(message, error) {
    if (this.#logger?.error) {
      this.#logger.error(message, error);
    } else if (typeof console !== "undefined" && console.error) {
      console.error(message, error);
    }
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error("EventEmitter has been destroyed.");
    }
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }

    this.removeAllListeners();
    this.#events.clear();
    this.#destroyed = true;
  }
}

export { EventEmitter };
export default EventEmitter;