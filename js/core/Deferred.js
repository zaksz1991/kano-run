class Deferred {
  #resolvePromise;
  #rejectPromise;
  #settled = false;
  #state = "pending";
  #value;
  #reason;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.#resolvePromise = resolve;
      this.#rejectPromise = reject;
    });
  }

  get state() {
    return this.#state;
  }

  get settled() {
    return this.#settled;
  }

  get pending() {
    return !this.#settled;
  }

  get value() {
    return this.#value;
  }

  get reason() {
    return this.#reason;
  }

  resolve(value) {
    if (this.#settled) {
      return false;
    }

    if (value === this.promise) {
      return this.reject(
        new TypeError("A Deferred cannot resolve to its own promise.")
      );
    }

    this.#settled = true;
    this.#state = "fulfilled";
    this.#value = value;

    this.#resolvePromise(value);

    return true;
  }

  reject(reason) {
    if (this.#settled) {
      return false;
    }

    this.#settled = true;
    this.#state = "rejected";
    this.#reason = reason;

    this.#rejectPromise(reason);

    return true;
  }

  wait() {
    return this.promise;
  }

  reset() {
    if (this.#settled) {
      return new Deferred();
    }

    return this;
  }

  static resolved(value) {
    const deferred = new Deferred();
    deferred.resolve(value);
    return deferred;
  }

  static rejected(reason) {
    const deferred = new Deferred();
    deferred.reject(reason);
    return deferred;
  }

  static from(promise) {
    const deferred = new Deferred();

    Promise.resolve(promise).then(
      (value) => deferred.resolve(value),
      (error) => deferred.reject(error)
    );

    return deferred;
  }
}

export { Deferred };
export default Deferred;