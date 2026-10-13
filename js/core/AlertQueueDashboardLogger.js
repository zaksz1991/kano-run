export class AlertQueueDashboardLogger {
  constructor(options = {}) {
    this.level = this.normalizeLevel(options.level ?? "info");
    this.maxEntries = this.normalizeLimit(options.maxEntries ?? 500);
    this.console = options.console ?? globalThis.console;
    this.events = options.events ?? null;
    this.persist = options.persist ?? null;
    this.entries = [];
    this.listeners = new Set();
    this.sequence = 0;
  }

  debug(message, context = {}) {
    return this.log("debug", message, context);
  }

  info(message, context = {}) {
    return this.log("info", message, context);
  }

  warn(message, context = {}) {
    return this.log("warn", message, context);
  }

  error(message, context = {}) {
    return this.log("error", message, context);
  }

  log(level, message, context = {}) {
    const normalizedLevel = this.normalizeLevel(level);

    if (!normalizedLevel) {
      throw new TypeError(`Invalid log level: ${level}`);
    }

    if (!this.shouldLog(normalizedLevel)) {
      return null;
    }

    const entry = Object.freeze({
      id: ++this.sequence,
      timestamp: new Date().toISOString(),
      level: normalizedLevel,
      message: String(message ?? ""),
      context: this.sanitizeContext(context),
    });

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(
        0,
        this.entries.length - this.maxEntries
      );
    }

    this.writeConsole(entry);
    this.emit(entry);

    try {
      this.persist?.(entry);
    } catch {
      // Logging must remain available if persistence fails.
    }

    try {
      this.events?.emit?.("dashboard:log", entry);
    } catch {
      // An event listener must not interrupt logging.
    }

    return entry;
  }

  shouldLog(level) {
    const priorities = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
    };

    return priorities[level] >= priorities[this.level];
  }

  writeConsole(entry) {
    if (!this.console) return;

    const method = entry.level === "debug"
      ? "debug"
      : entry.level === "warn"
        ? "warn"
        : entry.level === "error"
          ? "error"
          : "info";

    try {
      const writer = this.console[method] ?? this.console.log;

      writer?.call(
        this.console,
        `[AlertDashboard:${entry.level}] ${entry.message}`,
        entry.context
      );
    } catch {
      // Console implementations may be unavailable.
    }
  }

  getEntries(options = {}) {
    let results = [...this.entries];

    if (options.level) {
      const level = this.normalizeLevel(options.level);

      if (level) {
        results = results.filter((entry) => entry.level === level);
      }
    }

    if (options.search) {
      const query = String(options.search).toLowerCase();

      results = results.filter((entry) => {
        const content = [
          entry.message,
          JSON.stringify(entry.context),
        ].join(" ").toLowerCase();

        return content.includes(query);
      });
    }

    if (options.since) {
      const timestamp = new Date(options.since).getTime();

      if (Number.isFinite(timestamp)) {
        results = results.filter(
          (entry) => new Date(entry.timestamp).getTime() >= timestamp
        );
      }
    }

    const limit = this.normalizeLimit(
      options.limit ?? this.maxEntries
    );

    return results.slice(-limit);
  }

  getStats() {
    const stats = {
      total: this.entries.length,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    for (const entry of this.entries) {
      stats[entry.level] += 1;
    }

    return stats;
  }

  exportJSON(options = {}) {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        stats: this.getStats(),
        entries: this.getEntries(options),
      },
      null,
      2
    );
  }

  clear() {
    const removed = this.entries.length;
    this.entries = [];

    this.emit({
      id: ++this.sequence,
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Log history cleared.",
      context: { removed },
    });

    return removed;
  }

  setLevel(level) {
    const normalized = this.normalizeLevel(level);

    if (!normalized) {
      throw new TypeError(`Invalid log level: ${level}`);
    }

    this.level = normalized;
    return this.level;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // A failing subscriber must not interrupt other subscribers.
      }
    }
  }

  sanitizeContext(context) {
    if (!context || typeof context !== "object") {
      return { value: String(context ?? "") };
    }

    try {
      const serialized = JSON.stringify(context);

      if (serialized === undefined) return {};

      const parsed = JSON.parse(serialized);

      return parsed && typeof parsed === "object"
        ? parsed
        : { value: parsed };
    } catch {
      return { serializationError: true };
    }
  }

  normalizeLevel(level) {
    const normalized = String(level ?? "").toLowerCase();

    return ["debug", "info", "warn", "error"].includes(normalized)
      ? normalized
      : null;
  }

  normalizeLimit(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 500;

    return Math.min(10000, Math.max(1, Math.floor(number)));
  }

  destroy() {
    this.listeners.clear();
    this.entries = [];
  }
}