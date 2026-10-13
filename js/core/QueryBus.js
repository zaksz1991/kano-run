export default class QueryBus {
  #queries = new Map();
  #middleware = [];
  #disposed = false;
  #executing = new Set();

  register(name, handler, options = {}) {
    this.#assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Query name must be a non-empty string.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Query handler must be a function.");
    }

    if (this.#queries.has(name)) {
      throw new Error(`Query "${name}" is already registered.`);
    }

    const entry = {
      handler,
      description: options.description ?? "",
      validate: options.validate ?? null,
      cache: options.cache === true,
      cacheKey: options.cacheKey ?? null,
    };

    this.#queries.set(name, entry);

    return () => {
      if (this.#queries.get(name) === entry) {
        this.#queries.delete(name);
      }
    };
  }

  has(name) {
    return this.#queries.has(name);
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

  async execute(name, params = {}, context = {}) {
    this.#assertActive();

    const query = this.#queries.get(name);

    if (!query) {
      throw new Error(`Unknown query: "${name}".`);
    }

    if (
      query.validate &&
      query.validate(params, context) === false
    ) {
      throw new Error(`Validation failed for query "${name}".`);
    }

    const cacheKey = query.cache
      ? this.#createCacheKey(name, params, query.cacheKey)
      : null;

    if (cacheKey !== null && this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey);
    }

    const executionKey = cacheKey ?? `${name}:${this.#nextExecutionId++}`;

    if (this.#executing.has(executionKey)) {
      throw new Error(`Query "${name}" is already executing.`);
    }

    this.#executing.add(executionKey);

    try {
      let index = -1;

      const dispatch = async (middlewareIndex, currentParams) => {
        if (middlewareIndex <= index) {
          throw new Error("Query middleware called next() more than once.");
        }

        index = middlewareIndex;

        if (middlewareIndex === this.#middleware.length) {
          return query.handler(currentParams, context);
        }

        return this.#middleware[middlewareIndex](
          { name, context, query },
          currentParams,
          (nextParams = currentParams) =>
            dispatch(middlewareIndex + 1, nextParams)
        );
      };

      const result = await dispatch(0, params);

      if (cacheKey !== null) {
        this.#cache.set(cacheKey, result);
      }

      return result;
    } finally {
      this.#executing.delete(executionKey);
    }
  }

  executeSync(name, params = {}, context = {}) {
    this.#assertActive();

    const query = this.#queries.get(name);

    if (!query) {
      throw new Error(`Unknown query: "${name}".`);
    }

    if (this.#middleware.length > 0) {
      throw new Error(
        "executeSync() does not support middleware."
      );
    }

    if (
      query.validate &&
      query.validate(params, context) === false
    ) {
      throw new Error(`Validation failed for query "${name}".`);
    }

    const cacheKey = query.cache
      ? this.#createCacheKey(name, params, query.cacheKey)
      : null;

    if (cacheKey !== null && this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey);
    }

    const result = query.handler(params, context);

    if (result && typeof result.then === "function") {
      throw new Error(
        `Query "${name}" returned a Promise; use execute().`
      );
    }

    if (cacheKey !== null) {
      this.#cache.set(cacheKey, result);
    }

    return result;
  }

  invalidate(name) {
    if (name === undefined) {
      this.#cache.clear();
      return;
    }

    const prefix = `${name}:`;

    for (const key of this.#cache.keys()) {
      if (key.startsWith(prefix)) {
        this.#cache.delete(key);
      }
    }
  }

  listQueries() {
    return [...this.#queries.entries()].map(([name, query]) => ({
      name,
      description: query.description,
      cache: query.cache,
    }));
  }

  #cache = new Map();
  #nextExecutionId = 1;

  #createCacheKey(name, params, customKey) {
    try {
      const key =
        typeof customKey === "function"
          ? customKey(params)
          : JSON.stringify(params);

      if (key === undefined) return null;

      return `${name}:${String(key)}`;
    } catch {
      return null;
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("QueryBus has been disposed.");
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#queries.clear();
    this.#middleware.length = 0;
    this.#cache.clear();
    this.#executing.clear();
  }
}