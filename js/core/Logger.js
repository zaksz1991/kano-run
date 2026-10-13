const LOG_LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
});

const MAX_HISTORY = 1000;

function safeSerialize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

class Logger {
  static #minimumLevel = LOG_LEVELS.debug;
  static #consoleEnabled = true;
  static #historyEnabled = true;
  static #history = [];
  static #listeners = new Set();

  constructor(namespace = "KanoRun") {
    this.namespace = String(namespace || "KanoRun");
  }

  static configure(options = {}) {
    if (typeof options.level === "string") {
      const level = options.level.toLowerCase();

      if (Object.prototype.hasOwnProperty.call(LOG_LEVELS, level)) {
        Logger.#minimumLevel = LOG_LEVELS[level];
      }
    }

    if (typeof options.console === "boolean") {
      Logger.#consoleEnabled = options.console;
    }

    if (typeof options.history === "boolean") {
      Logger.#historyEnabled = options.history;
    }

    return Logger;
  }

  static setLevel(level) {
    return Logger.configure({ level });
  }

  static enableConsole(enabled = true) {
    Logger.#consoleEnabled = Boolean(enabled);
    return Logger;
  }

  static enableHistory(enabled = true) {
    Logger.#historyEnabled = Boolean(enabled);
    return Logger;
  }

  static subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Logger.subscribe expects a function.");
    }

    Logger.#listeners.add(listener);

    return () => {
      Logger.#listeners.delete(listener);
    };
  }

  static getHistory(options = {}) {
    const { level, namespace, limit } = options;

    let entries = Logger.#history;

    if (typeof level === "string" && level in LOG_LEVELS) {
      entries = entries.filter(
        (entry) => entry.level === level.toLowerCase()
      );
    }

    if (namespace) {
      entries = entries.filter((entry) =>
        entry.namespace.includes(String(namespace))
      );
    }

    if (Number.isInteger(limit) && limit >= 0) {
      entries = entries.slice(-limit);
    }

    return entries.map((entry) => ({
      ...entry,
      args: [...entry.args],
    }));
  }

  static clearHistory() {
    Logger.#history.length = 0;
  }

  static exportHistory() {
    return JSON.stringify(Logger.#history, null, 2);
  }

  static getLevels() {
    return { ...LOG_LEVELS };
  }

  scope(childNamespace) {
    return new Logger(
      `${this.namespace}:${String(childNamespace || "Child")}`
    );
  }

  debug(...args) {
    this.#write("debug", args);
  }

  info(...args) {
    this.#write("info", args);
  }

  warn(...args) {
    this.#write("warn", args);
  }

  error(...args) {
    this.#write("error", args);
  }

  log(...args) {
    this.info(...args);
  }

  #write(level, args) {
    const numericLevel = LOG_LEVELS[level];

    if (numericLevel < Logger.#minimumLevel) {
      return;
    }

    const entry = {
      timestamp: getTimestamp(),
      level,
      namespace: this.namespace,
      args: args.map(safeSerialize),
    };

    if (Logger.#historyEnabled) {
      Logger.#history.push(entry);

      if (Logger.#history.length > MAX_HISTORY) {
        Logger.#history.splice(
          0,
          Logger.#history.length - MAX_HISTORY
        );
      }
    }

    if (Logger.#consoleEnabled && typeof console !== "undefined") {
      const method =
        level === "debug"
          ? typeof console.debug === "function"
            ? console.debug
            : console.log
          : typeof console[level] === "function"
            ? console[level]
            : console.log;

      if (typeof method === "function") {
        method.call(
          console,
          `[${entry.timestamp}] [${level.toUpperCase()}] [${this.namespace}]`,
          ...args
        );
      }
    }

    for (const listener of Logger.#listeners) {
      try {
        listener({ ...entry, args: [...entry.args] });
      } catch (error) {
        if (typeof console !== "undefined" && console.error) {
          console.error("Logger listener failed:", error);
        }
      }
    }
  }
}

export { Logger, LOG_LEVELS };
export default Logger;