class Signal {
  #value;
  #listeners = new Set();
  #equals;
  #destroyed = false;
  #version = 0;
  #notifying = false;
  #pendingNotifications = [];

  constructor(initialValue, options = {}) {
    const { equals = Object.is } = options;

    this.#value = initialValue;
    this.#equals = typeof equals === "function" ? equals : Object.is;
  }

  get value() {
    return this.#value;
  }

  set value(nextValue) {
    this.set(nextValue);
  }

  get version() {
    return this.#version;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get subscriberCount() {
    return this.#listeners.size;
  }

  set(nextValue) {
    this.#assertActive();

    if (this.#equals(this.#value, nextValue)) {
      return false;
    }

    const previousValue = this.#value;

    this.#value = nextValue;
    this.#version++;

    this.#notify({
      value: nextValue,
      previousValue,
      version: this.#version,
    });

    return true;
  }

  update(updater) {
    this.#assertActive();

    if (typeof updater !== "function") {
      throw new TypeError("Signal.update expects a function.");
    }

    return this.set(updater(this.#value));
  }

  subscribe(listener, options = {}) {
    this.#assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Signal.subscribe expects a function.");
    }

    const { immediate = true, signal = null } = options;

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
      this.#invoke(record, {
        value: this.#value,
        previousValue: undefined,
        version: this.#version,
        initial: true,
      });
    }

    return unsubscribe;
  }

  once(listener) {
    let unsubscribe = () => {};

    unsubscribe = this.subscribe((value, previousValue, metadata) => {
      unsubscribe();
      listener(value, previousValue, metadata);
    }, { immediate: false });

    return unsubscribe;
  }

  mutate(mutator) {
    this.#assertActive();

    if (typeof mutator !== "function") {
      throw new TypeError("Signal.mutate expects a function.");
    }

    const result = mutator(this.#value);

    this.#version++;

    this.#notify({
      value: this.#value,
      previousValue: this.#value,
      version: this.#version,
      mutated: true,
    });

    return result;
  }

  notify() {
    this.#assertActive();

    this.#version++;

    this.#notify({
      value: this.#value,
      previousValue: this.#value,
      version: this.#version,
      forced: true,
    });
  }

  unsubscribeAll() {
    for (const record of [...this.#listeners]) {
      record.unsubscribe();
    }

    this.#listeners.clear();
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }

    this.unsubscribeAll();
    this.#pendingNotifications.length = 0;
    this.#destroyed = true;
  }

  #notify(change) {
    this.#pendingNotifications.push(change);

    if (this.#notifying) {
      return;
    }

    this.#notifying = true;

    try {
      while (this.#pendingNotifications.length > 0) {
        const current = this.#pendingNotifications.shift();

        for (const record of [...this.#listeners]) {
          if (!record.active) {
            continue;
          }

          this.#invoke(record, current);
        }
      }
    } finally {
      this.#notifying = false;
    }
  }

  #invoke(record, change) {
    try {
      record.listener(
        change.value,
        change.previousValue,
        {
          version: change.version,
          initial: Boolean(change.initial),
          mutated: Boolean(change.mutated),
          forced: Boolean(change.forced),
        }
      );
    } catch (error) {
      if (typeof console !== "undefined" && console.error) {
        console.error("Signal subscriber failed:", error);
      }
    }
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error("Signal has been destroyed.");
    }
  }
}

export { Signal };
export default Signal;