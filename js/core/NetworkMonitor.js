export default class NetworkMonitor {
  #online;
  #listeners = new Set();
  #connection;
  #disposed = false;
  #window;
  #navigator;

  constructor(options = {}) {
    this.#window = options.window ?? globalThis.window;
    this.#navigator = options.navigator ?? globalThis.navigator;

    this.#online = this.#navigator?.onLine ?? true;
    this.#connection =
      this.#navigator?.connection ??
      this.#navigator?.mozConnection ??
      this.#navigator?.webkitConnection ??
      null;

    this.#handleOnline = this.#handleOnline.bind(this);
    this.#handleOffline = this.#handleOffline.bind(this);
    this.#handleConnectionChange =
      this.#handleConnectionChange.bind(this);

    this.#window?.addEventListener(
      "online",
      this.#handleOnline
    );

    this.#window?.addEventListener(
      "offline",
      this.#handleOffline
    );

    this.#connection?.addEventListener(
      "change",
      this.#handleConnectionChange
    );
  }

  get isOnline() {
    return this.#online;
  }

  get isOffline() {
    return !this.#online;
  }

  get connectionType() {
    return this.#connection?.type ?? "unknown";
  }

  get effectiveType() {
    return this.#connection?.effectiveType ?? "unknown";
  }

  get downlink() {
    return this.#connection?.downlink ?? null;
  }

  get rtt() {
    return this.#connection?.rtt ?? null;
  }

  get saveData() {
    return this.#connection?.saveData ?? false;
  }

  getSnapshot() {
    return {
      online: this.#online,
      connectionType: this.connectionType,
      effectiveType: this.effectiveType,
      downlink: this.downlink,
      rtt: this.rtt,
      saveData: this.saveData,
      timestamp: Date.now(),
    };
  }

  subscribe(listener, options = {}) {
    this.#assertActive();

    if (typeof listener !== "function") {
      throw new TypeError(
        "NetworkMonitor.subscribe requires a function."
      );
    }

    if (options.signal?.aborted) {
      return () => {};
    }

    this.#listeners.add(listener);

    const unsubscribe = () => {
      this.#listeners.delete(listener);
      options.signal?.removeEventListener(
        "abort",
        unsubscribe
      );
    };

    options.signal?.addEventListener(
      "abort",
      unsubscribe,
      { once: true }
    );

    if (options.immediate) {
      listener(this.getSnapshot());
    }

    return unsubscribe;
  }

  async checkConnectivity(options = {}) {
    this.#assertActive();

    const {
      url = "/favicon.ico",
      timeout = 5000,
    } = options;

    if (typeof fetch !== "function") {
      return this.#online;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeout
    );

    try {
      const separator = url.includes("?") ? "&" : "?";

      const response = await fetch(
        `${url}${separator}_network_check=${Date.now()}`,
        {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        }
      );

      this.#setOnline(response.ok);
      return response.ok;
    } catch {
      this.#setOnline(false);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  #handleOnline() {
    this.#setOnline(true);
  }

  #handleOffline() {
    this.#setOnline(false);
  }

  #handleConnectionChange() {
    this.#notify();
  }

  #setOnline(online) {
    if (this.#online === online) return;

    this.#online = online;
    this.#notify();
  }

  #notify() {
    const snapshot = this.getSnapshot();

    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(
          "[NetworkMonitor] Listener error:",
          error
        );
      }
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error(
        "NetworkMonitor has been disposed."
      );
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;

    this.#window?.removeEventListener(
      "online",
      this.#handleOnline
    );

    this.#window?.removeEventListener(
      "offline",
      this.#handleOffline
    );

    this.#connection?.removeEventListener(
      "change",
      this.#handleConnectionChange
    );

    this.#listeners.clear();
  }
}