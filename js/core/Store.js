class Store {
  #state;
  #initialState;
  #listeners = new Set();
  #middleware = [];
  #history = [];
  #maxHistory;
  #version = 0;
  #destroyed = false;
  #dispatching = false;
  #pendingActions = [];

  constructor(initialState = {}, options = {}) {
    const { maxHistory = 100, middleware = [] } = options;

    this.#initialState = this.#clone(initialState);
    this.#state = this.#clone(initialState);
    this.#maxHistory = Math.max(0, Math.floor(maxHistory) || 0);

    if (Array.isArray(middleware)) {
      this.#middleware = [...middleware].filter(
        (item) => typeof item === "function"
      );
    }
  }

  get state() {
    return this.#state;
  }

  get version() {
    return this.#version;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get history() {
    return this.#history.map((entry) => ({ ...entry }));
  }

  get(path, fallback = undefined) {
    if (path === undefined || path === null || path === "") {
      return this.#state;
    }

    const keys = Array.isArray(path)
      ? path
      : String(path).split(".");

    let value = this.#state;

    for (const key of keys) {
      if (
        value === null ||
        value === undefined ||
        !Object.prototype.hasOwnProperty.call(Object(value), key)
      ) {
        return fallback;
      }

      value = value[key];
    }

    return value === undefined ? fallback : value;
  }

  set(path, value, metadata = {}) {
    this.#assertActive();

    if (typeof path !== "string" && !Array.isArray(path)) {
      throw new TypeError("Store.set expects a string or array path.");
    }

    const keys = Array.isArray(path) ? path : path.split(".");

    if (
      keys.length === 0 ||
      keys.some((key) => String(key).length === 0)
    ) {
      throw new TypeError("Store.set requires a valid path.");
    }

    const nextState = this.#clone(this.#state);
    let cursor = nextState;

    for (let index = 0; index < keys.length - 1; index++) {
      const key = keys[index];

      if (
        cursor[key] === null ||
        typeof cursor[key] !== "object"
      ) {
        cursor[key] = {};
      } else {
        cursor[key] = this.#clone(cursor[key]);
      }

      cursor = cursor[key];
    }

    const finalKey = keys[keys.length - 1];

    if (Object.is(cursor[finalKey], value)) {
      return false;
    }

    cursor[finalKey] = value;

    return this.#commit(nextState, {
      type: "SET",
      path: keys.join("."),
      ...metadata,
    });
  }

  update(updater, metadata = {}) {
    this.#assertActive();

    if (typeof updater !== "function") {
      throw new TypeError("Store.update expects a function.");
    }

    const result = updater(this.#state);

    if (result === undefined) {
      return false;
    }

    return this.#commit(result, {
      type: "UPDATE",
      ...metadata,
    });
  }

  patch(partialState, metadata = {}) {
    this.#assertActive();

    if (
      partialState === null ||
      typeof partialState !== "object" ||
      Array.isArray(partialState)
    ) {
      throw new TypeError("Store.patch expects a plain object.");
    }

    return this.#commit(
      {
        ...this.#state,
        ...partialState,
      },
      {
        type: "PATCH",
        ...metadata,
      }
    );
  }

  dispatch(action, payload = {}) {
    this.#assertActive();

    if (typeof action !== "string" || !action.trim()) {
      throw new TypeError("Store.dispatch requires an action name.");
    }

    this.#pendingActions.push({
      action,
      payload,
    });

    if (this.#dispatching) {
      return true;
    }

    this.#dispatching = true;

    try {
      while (this.#pendingActions.length > 0) {
        const current = this.#pendingActions.shift();

        let nextState = this.#state;

        for (const middleware of this.#middleware) {
          const result = middleware({
            action: current.action,
            payload: current.payload,
            state: nextState,
            store: this,
          });

          if (result === false) {
            nextState = null;
            break;
          }

          if (result !== undefined && result !== true) {
            nextState = result;
          }
        }

        if (nextState !== null && nextState !== this.#state) {
          this.#commit(nextState, {
            type: current.action,
            payload: current.payload,
          });
        }
      }
    } finally {
      this.#dispatching = false;
    }

    return true;
  }

  subscribe(listener, options = {}) {
    this.#assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Store.subscribe expects a function.");
    }

    const { immediate = false, signal = null } = options;

    if (signal?.aborted) {
      return () => false;
    }

    const record = {
      listener,
      active: true,
      abortHandler: null,
    };

    this.#listeners.add(record);

    const unsubscribe = () => {
      if (!record.active) {
        return false;
      }

      record.active = false;
      this.#listeners.delete(record);

      if (signal && record.abortHandler) {
        signal.removeEventListener("abort", record.abortHandler);
      }

      return true;
    };

    record.unsubscribe = unsubscribe;

    if (signal) {
      record.abortHandler = unsubscribe;
      signal.addEventListener("abort", unsubscribe, { once: true });
    }

    if (immediate) {
      this.#notifyListener(record, {
        state: this.#state,
        previousState: undefined,
        action: { type: "INITIAL" },
        version: this.#version,
      });
    }

    return unsubscribe;
  }

  addMiddleware(middleware) {
    this.#assertActive();

    if (typeof middleware !== "function") {
      throw new TypeError("Middleware must be a function.");
    }

    this.#middleware.push(middleware);

    return () => {
      const index = this.#middleware.indexOf(middleware);

      if (index === -1) {
        return false;
      }

      this.#middleware.splice(index, 1);
      return true;
    };
  }

  undo() {
    this.#assertActive();

    if (this.#history.length === 0) {
      return false;
    }

    const previousEntry = this.#history.pop();

    return this.#commit(
      this.#clone(previousEntry.previousState),
      { type: "UNDO" },
      false
    );
  }

  reset() {
    this.#assertActive();

    return this.#commit(
      this.#clone(this.#initialState),
      { type: "RESET" }
    );
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }

    this.#listeners.clear();
    this.#middleware.length = 0;
    this.#history.length = 0;
    this.#pendingActions.length = 0;
    this.#destroyed = true;
  }

  #commit(nextState, action, recordHistory = true) {
    if (
      nextState === null ||
      typeof nextState !== "object" ||
      Array.isArray(nextState)
    ) {
      throw new TypeError("Store state must be an object.");
    }

    const previousState = this.#state;

    if (Object.is(previousState, nextState)) {
      return false;
    }

    if (recordHistory && this.#maxHistory > 0) {
      this.#history.push({
        previousState: this.#clone(previousState),
        action: { ...action },
        version: this.#version,
        timestamp: Date.now(),
      });

      if (this.#history.length > this.#maxHistory) {
        this.#history.shift();
      }
    }

    this.#state = nextState;
    this.#version++;

    const event = {
      state: this.#state,
      previousState,
      action,
      version: this.#version,
    };

    for (const record of [...this.#listeners]) {
      if (record.active) {
        this.#notifyListener(record, event);
      }
    }

    return true;
  }

  #notifyListener(record, event) {
    try {
      record.listener(
        event.state,
        event.previousState,
        event.action,
        event.version
      );
    } catch (error) {
      if (typeof console !== "undefined" && console.error) {
        console.error("Store subscriber failed:", error);
      }
    }
  }

  #clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall back for values structuredClone cannot handle.
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.#clone(item));
    }

    if (value && typeof value === "object") {
      const result = {};

      for (const [key, item] of Object.entries(value)) {
        result[key] = this.#clone(item);
      }

      return result;
    }

    return value;
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error("Store has been destroyed.");
    }
  }
}

export { Store };
export default Store;