export default class Diagnostics {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      captureErrors: true,
      historyLimit: 100,
      logToConsole: false,
      ...options,
    };

    this.entries = [];
    this.counters = {
      info: 0,
      warning: 0,
      error: 0,
      fatal: 0,
    };

    this.startedAt = Date.now();
    this.destroyed = false;

    this.handleWindowError = this.handleWindowError.bind(this);
    this.handleUnhandledRejection =
      this.handleUnhandledRejection.bind(this);

    if (this.options.captureErrors && typeof window !== "undefined") {
      window.addEventListener("error", this.handleWindowError);
      window.addEventListener(
        "unhandledrejection",
        this.handleUnhandledRejection
      );
    }
  }

  record(level, message, details = null) {
    if (!this.options.enabled || this.destroyed) {
      return null;
    }

    const normalizedLevel = String(level).toLowerCase();

    if (!(normalizedLevel in this.counters)) {
      throw new Error(`Unsupported diagnostic level: ${level}`);
    }

    const entry = {
      id: this.entries.length
        ? this.entries[this.entries.length - 1].id + 1
        : 1,
      level: normalizedLevel,
      message: String(message),
      details: this.normalizeDetails(details),
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
    };

    this.entries.push(entry);
    this.counters[normalizedLevel] += 1;

    if (this.entries.length > this.options.historyLimit) {
      this.entries.shift();
    }

    if (this.options.logToConsole) {
      this.writeToConsole(entry);
    }

    return entry;
  }

  info(message, details = null) {
    return this.record("info", message, details);
  }

  warn(message, details = null) {
    return this.record("warning", message, details);
  }

  error(message, details = null) {
    return this.record("error", message, details);
  }

  fatal(message, details = null) {
    return this.record("fatal", message, details);
  }

  normalizeDetails(details) {
    if (details == null) {
      return null;
    }

    if (details instanceof Error) {
      return {
        name: details.name,
        message: details.message,
        stack: details.stack ?? null,
      };
    }

    try {
      return JSON.parse(JSON.stringify(details));
    } catch {
      return String(details);
    }
  }

  writeToConsole(entry) {
    const method =
      entry.level === "fatal" || entry.level === "error"
        ? "error"
        : entry.level === "warning"
          ? "warn"
          : "info";

    console[method](
      `[Kano Run][${entry.level.toUpperCase()}] ${entry.message}`,
      entry.details ?? ""
    );
  }

  handleWindowError(event) {
    this.error(event.message || "Uncaught browser error", {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error
        ? {
            name: event.error.name,
            message: event.error.message,
          }
        : null,
    });
  }

  handleUnhandledRejection(event) {
    const reason = event.reason;

    this.error("Unhandled promise rejection", {
      reason:
        reason instanceof Error
          ? {
              name: reason.name,
              message: reason.message,
              stack: reason.stack,
            }
          : String(reason),
    });
  }

  getEntries(options = {}) {
    const { level, limit = this.entries.length } = options;

    let result = this.entries;

    if (level) {
      result = result.filter(
        (entry) => entry.level === String(level).toLowerCase()
      );
    }

    return result.slice(-Math.max(0, limit)).map((entry) => ({
      ...entry,
      details: entry.details,
    }));
  }

  getSummary() {
    return {
      uptimeMs: Date.now() - this.startedAt,
      totalEntries: this.entries.length,
      counters: { ...this.counters },
      enabled: this.options.enabled,
    };
  }

  clear() {
    this.entries.length = 0;

    for (const level of Object.keys(this.counters)) {
      this.counters[level] = 0;
    }
  }

  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);
  }

  exportJSON() {
    return JSON.stringify(
      {
        application: "Kano Run",
        exportedAt: new Date().toISOString(),
        summary: this.getSummary(),
        entries: this.entries,
      },
      null,
      2
    );
  }

  destroy() {
    if (this.destroyed) return;

    if (typeof window !== "undefined") {
      window.removeEventListener("error", this.handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        this.handleUnhandledRejection
      );
    }

    this.destroyed = true;
  }
}