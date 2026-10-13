export default class MessageBus {
  #channels = new Map();
  #history = [];
  #maxHistory;
  #sequence = 0;
  #disposed = false;

  constructor(options = {}) {
    this.#maxHistory = Math.max(
      0,
      Number.isInteger(options.maxHistory)
        ? options.maxHistory
        : 100
    );
  }

  subscribe(channel, handler, options = {}) {
    this.#assertActive();

    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("Channel must be a non-empty string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Message handler must be a function.");
    }

    const { once = false, signal } = options;

    if (signal?.aborted) {
      return () => {};
    }

    if (!this.#channels.has(channel)) {
      this.#channels.set(channel, new Set());
    }

    const entry = {
      handler,
      once,
      active: true,
    };

    this.#channels.get(channel).add(entry);

    const unsubscribe = () => {
      if (!entry.active) return;

      entry.active = false;
      this.#channels.get(channel)?.delete(entry);

      if (this.#channels.get(channel)?.size === 0) {
        this.#channels.delete(channel);
      }

      signal?.removeEventListener("abort", unsubscribe);
    };

    signal?.addEventListener("abort", unsubscribe, {
      once: true,
    });

    return unsubscribe;
  }

  publish(channel, payload = {}, options = {}) {
    this.#assertActive();

    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("Channel must be a non-empty string.");
    }

    const message = Object.freeze({
      id: ++this.#sequence,
      channel,
      payload,
      timestamp: Date.now(),
      source: options.source ?? "game",
    });

    this.#record(message);

    const subscribers = [
      ...(this.#channels.get(channel) ?? []),
      ...(this.#channels.get("*") ?? []),
    ];

    for (const entry of subscribers) {
      if (!entry.active) continue;

      if (entry.once) {
        this.#removeEntry(entry);
      }

      try {
        entry.handler(message);
      } catch (error) {
        console.error(
          `[MessageBus] Handler error on "${channel}":`,
          error
        );
      }
    }

    return message;
  }

  async publishAsync(channel, payload = {}, options = {}) {
    this.#assertActive();

    if (typeof channel !== "string" || !channel.trim()) {
      throw new TypeError("Channel must be a non-empty string.");
    }

    const message = Object.freeze({
      id: ++this.#sequence,
      channel,
      payload,
      timestamp: Date.now(),
      source: options.source ?? "game",
    });

    this.#record(message);

    const subscribers = [
      ...(this.#channels.get(channel) ?? []),
      ...(this.#channels.get("*") ?? []),
    ];

    const tasks = [];

    for (const entry of subscribers) {
      if (!entry.active) continue;

      if (entry.once) {
        this.#removeEntry(entry);
      }

      tasks.push(
        Promise.resolve().then(() => entry.handler(message))
      );
    }

    const results = await Promise.allSettled(tasks);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          `[MessageBus] Async handler error on "${channel}":`,
          result.reason
        );
      }
    }

    return message;
  }

  waitFor(channel, options = {}) {
    this.#assertActive();

    const { timeout = 0, signal } = options;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Waiting for message was aborted."));
        return;
      }

      let timer = null;

      const cleanup = () => {
        unsubscribe();
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new Error("Waiting for message was aborted."));
      };

      const unsubscribe = this.subscribe(
        channel,
        (message) => {
          cleanup();
          resolve(message);
        },
        { once: true }
      );

      signal?.addEventListener("abort", onAbort, {
        once: true,
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(
            new Error(`Timed out waiting for "${channel}".`)
          );
        }, timeout);
      }
    });
  }

  unsubscribe(channel) {
    if (channel === undefined) {
      for (const subscribers of this.#channels.values()) {
        for (const entry of subscribers) {
          entry.active = false;
        }
      }

      this.#channels.clear();
      return;
    }

    const subscribers = this.#channels.get(channel);

    if (!subscribers) return;

    for (const entry of subscribers) {
      entry.active = false;
    }

    this.#channels.delete(channel);
  }

  getHistory(options = {}) {
    const { channel, limit = this.#maxHistory } = options;

    let history = this.#history;

    if (channel !== undefined) {
      history = history.filter(
        (message) => message.channel === channel
      );
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      return [];
    }

    return history.slice(-limit);
  }

  clearHistory() {
    this.#history.length = 0;
  }

  #removeEntry(entry) {
    entry.active = false;

    for (const [channel, subscribers] of this.#channels) {
      subscribers.delete(entry);

      if (subscribers.size === 0) {
        this.#channels.delete(channel);
      }
    }
  }

  #record(message) {
    if (this.#maxHistory === 0) return;

    this.#history.push(message);

    if (this.#history.length > this.#maxHistory) {
      this.#history.splice(
        0,
        this.#history.length - this.#maxHistory
      );
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("MessageBus has been disposed.");
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;
    this.unsubscribe();
    this.#history.length = 0;
  }
}