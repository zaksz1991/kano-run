export default class Observable {
  #value;
  #listeners = new Set();
  #disposed = false;
  #version = 0;

  constructor(initialValue) {
    this.#value = initialValue;
  }

  get value() {
    return this.#value;
  }

  get version() {
    return this.#version;
  }

  get disposed() {
    return this.#disposed;
  }

  set value(nextValue) {
    this.set(nextValue);
  }

  set(nextValue, options = {}) {
    this.#assertActive();

    const { force = false } = options;
    const previousValue = this.#value;

    if (!force && Object.is(previousValue, nextValue)) {
      return false;
    }

    this.#value = nextValue;
    this.#version += 1;

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
      throw new TypeError("Observable.update requires a function.");
    }

    return this.set(updater(this.#value));
  }

  subscribe(listener, options = {}) {
    this.#assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Observable.subscribe requires a function.");
    }

    const { immediate = false, signal } = options;

    if (signal?.aborted) {
      return () => {};
    }

    const entry = { listener, active: true };

    this.#listeners.add(entry);

    const unsubscribe = () => {
      if (!entry.active) return;

      entry.active = false;
      this.#listeners.delete(entry);
      signal?.removeEventListener("abort", unsubscribe);
    };

    signal?.addEventListener("abort", unsubscribe, { once: true });

    if (immediate) {
      listener({
        value: this.#value,
        previousValue: undefined,
        version: this.#version,
      });
    }

    return unsubscribe;
  }

  once(listener) {
    this.#assertActive();

    let unsubscribe = () => {};

    unsubscribe = this.subscribe((change) => {
      unsubscribe();
      listener(change);
    });

    return unsubscribe;
  }

  map(project) {
    this.#assertActive();

    if (typeof project !== "function") {
      throw new TypeError("Observable.map requires a function.");
    }

    const derived = new Observable(project(this.#value));

    const unsubscribe = this.subscribe(({ value }) => {
      derived.set(project(value));
    });

    const originalDispose = derived.dispose.bind(derived);

    derived.dispose = () => {
      unsubscribe();
      originalDispose();
    };

    return derived;
  }

  #notify(change) {
    for (const entry of [...this.#listeners]) {
      if (!entry.active) continue;

      try {
        entry.listener(change);
      } catch (error) {
        console.error("[Observable] Subscriber error:", error);
      }
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("Observable has been disposed.");
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;

    for (const entry of this.#listeners) {
      entry.active = false;
    }

    this.#listeners.clear();
  }
}