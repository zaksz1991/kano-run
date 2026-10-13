export default class CommandBus {
  #commands = new Map();
  #middleware = [];
  #history = [];
  #maxHistory;
  #disposed = false;
  #executing = new Set();

  constructor(options = {}) {
    this.#maxHistory = Math.max(
      0,
      Number.isInteger(options.maxHistory) ? options.maxHistory : 100
    );
  }

  register(name, handler, options = {}) {
    this.#assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Command name must be a non-empty string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Command handler must be a function.");
    }

    if (this.#commands.has(name)) {
      throw new Error(`Command "${name}" is already registered.`);
    }

    const entry = {
      handler,
      description: options.description ?? "",
      validate: options.validate ?? null,
    };

    this.#commands.set(name, entry);

    return () => {
      if (this.#commands.get(name) === entry) {
        this.#commands.delete(name);
      }
    };
  }

  has(name) {
    return this.#commands.has(name);
  }

  addMiddleware(middleware) {
    this.#assertActive();

    if (typeof middleware !== "function") {
      throw new TypeError("Middleware must be a function.");
    }

    this.#middleware.push(middleware);

    return () => {
      const index = this.#middleware.indexOf(middleware);

      if (index !== -1) {
        this.#middleware.splice(index, 1);
      }
    };
  }

  async execute(name, payload = {}, context = {}) {
    this.#assertActive();

    const command = this.#commands.get(name);

    if (!command) {
      throw new Error(`Unknown command: "${name}".`);
    }

    if (this.#executing.has(name)) {
      throw new Error(`Command "${name}" is already executing.`);
    }

    if (
      command.validate &&
      command.validate(payload, context) === false
    ) {
      throw new Error(`Validation failed for command "${name}".`);
    }

    const record = {
      name,
      payload,
      startedAt: Date.now(),
      completedAt: null,
      status: "running",
      result: undefined,
      error: null,
    };

    this.#executing.add(name);

    try {
      let index = -1;

      const dispatch = async (middlewareIndex, currentPayload) => {
        if (middlewareIndex <= index) {
          throw new Error("Command middleware called next() more than once.");
        }

        index = middlewareIndex;

        if (middlewareIndex === this.#middleware.length) {
          return command.handler(currentPayload, context);
        }

        const middleware = this.#middleware[middlewareIndex];

        return middleware(
          {
            name,
            context,
            command,
          },
          currentPayload,
          (nextPayload = currentPayload) =>
            dispatch(middlewareIndex + 1, nextPayload)
        );
      };

      record.result = await dispatch(0, payload);
      record.status = "success";

      return record.result;
    } catch (error) {
      record.status = "failed";
      record.error = error?.message ?? String(error);

      throw error;
    } finally {
      record.completedAt = Date.now();
      this.#executing.delete(name);
      this.#recordHistory(record);
    }
  }

  executeSync(name, payload = {}, context = {}) {
    this.#assertActive();

    const command = this.#commands.get(name);

    if (!command) {
      throw new Error(`Unknown command: "${name}".`);
    }

    if (this.#executing.has(name)) {
      throw new Error(`Command "${name}" is already executing.`);
    }

    if (this.#middleware.length > 0) {
      throw new Error(
        "executeSync() does not support asynchronous middleware."
      );
    }

    if (
      command.validate &&
      command.validate(payload, context) === false
    ) {
      throw new Error(`Validation failed for command "${name}".`);
    }

    const record = {
      name,
      payload,
      startedAt: Date.now(),
      completedAt: null,
      status: "running",
      result: undefined,
      error: null,
    };

    this.#executing.add(name);

    try {
      record.result = command.handler(payload, context);

      if (
        record.result &&
        typeof record.result.then === "function"
      ) {
        throw new Error(
          `Command "${name}" returned a Promise; use execute().`
        );
      }

      record.status = "success";

      return record.result;
    } catch (error) {
      record.status = "failed";
      record.error = error?.message ?? String(error);

      throw error;
    } finally {
      record.completedAt = Date.now();
      this.#executing.delete(name);
      this.#recordHistory(record);
    }
  }

  getHistory(limit = this.#maxHistory) {
    if (!Number.isInteger(limit) || limit <= 0) {
      return [];
    }

    return this.#history.slice(-limit).map((record) => ({
      ...record,
    }));
  }

  clearHistory() {
    this.#history.length = 0;
  }

  listCommands() {
    return [...this.#commands.entries()].map(([name, command]) => ({
      name,
      description: command.description,
    }));
  }

  #recordHistory(record) {
    if (this.#maxHistory === 0) return;

    this.#history.push({ ...record });

    if (this.#history.length > this.#maxHistory) {
      this.#history.splice(
        0,
        this.#history.length - this.#maxHistory
      );
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("CommandBus has been disposed.");
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#commands.clear();
    this.#middleware.length = 0;
    this.#history.length = 0;
    this.#executing.clear();
  }
}