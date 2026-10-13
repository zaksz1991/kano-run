export class AlertQueueDashboardConfig {
  constructor(options = {}) {
    this.defaults = {
      refreshIntervalMs: 30000,
      maxHistory: 100,
      maxNotifications: 500,
      maxExportRows: 10000,
      storageKey: "kano-run-alert-dashboard",
      channelName: "kano-run-alert-dashboard",
      autoRefresh: true,
      refreshOnStart: true,
      persistState: true,
      syncAcrossTabs: true,
      logErrors: true,
    };

    this.config = this.validate({
      ...this.defaults,
      ...options,
    });

    this.listeners = new Set();
  }

  get(key) {
    return key === undefined
      ? this.getAll()
      : this.config[key];
  }

  getAll() {
    return { ...this.config };
  }

  set(key, value) {
    if (typeof key === "object" && key !== null) {
      return this.update(key);
    }

    return this.update({ [key]: value });
  }

  update(updates = {}) {
    const next = this.validate({
      ...this.config,
      ...updates,
    });

    const changed = {};

    for (const [key, value] of Object.entries(next)) {
      if (this.config[key] !== value) {
        changed[key] = {
          previous: this.config[key],
          current: value,
        };
      }
    }

    if (Object.keys(changed).length === 0) {
      return {
        changed: false,
        config: this.getAll(),
      };
    }

    this.config = next;

    this.notify({
      changed,
      config: this.getAll(),
    });

    return {
      changed: true,
      changedKeys: Object.keys(changed),
      config: this.getAll(),
    };
  }

  reset() {
    return this.update(this.defaults);
  }

  validate(input) {
    const result = { ...input };

    result.refreshIntervalMs = this.normalizeNumber(
      result.refreshIntervalMs,
      30000,
      1000,
      3600000
    );

    result.maxHistory = this.normalizeNumber(
      result.maxHistory,
      100,
      1,
      1000
    );

    result.maxNotifications = this.normalizeNumber(
      result.maxNotifications,
      500,
      1,
      5000
    );

    result.maxExportRows = this.normalizeNumber(
      result.maxExportRows,
      10000,
      1,
      100000
    );

    result.storageKey = this.normalizeString(
      result.storageKey,
      this.defaults.storageKey,
      150
    );

    result.channelName = this.normalizeString(
      result.channelName,
      this.defaults.channelName,
      150
    );

    for (const key of [
      "autoRefresh",
      "refreshOnStart",
      "persistState",
      "syncAcrossTabs",
      "logErrors",
    ]) {
      result[key] = Boolean(result[key]);
    }

    return result;
  }

  normalizeNumber(value, fallback, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      maximum,
      Math.max(minimum, Math.floor(number))
    );
  }

  normalizeString(value, fallback, maxLength) {
    const result = String(value ?? "").trim();

    return result
      ? result.slice(0, maxLength)
      : fallback;
  }

  subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    if (options.emitCurrent === true) {
      listener({
        changed: {},
        config: this.getAll(),
      });
    }

    return () => this.listeners.delete(listener);
  }

  notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          "Dashboard configuration listener failed:",
          error
        );
      }
    }
  }

  destroy() {
    this.listeners.clear();
  }
}