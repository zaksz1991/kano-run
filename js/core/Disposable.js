class Disposable {
  #disposers = [];
  #disposed = false;
  #disposing = false;
  #errors = [];

  get disposed() {
    return this.#disposed;
  }

  get disposing() {
    return this.#disposing;
  }

  get size() {
    return this.#disposers.length;
  }

  get errors() {
    return [...this.#errors];
  }

  add(disposer) {
    if (typeof disposer !== "function") {
      if (disposer && typeof disposer.dispose === "function") {
        disposer = () => disposer.dispose();
      } else if (disposer && typeof disposer.destroy === "function") {
        disposer = () => disposer.destroy();
      } else if (disposer && typeof disposer.abort === "function") {
        disposer = () => disposer.abort();
      } else if (disposer && typeof disposer.unsubscribe === "function") {
        disposer = () => disposer.unsubscribe();
      } else if (disposer && typeof disposer.close === "function") {
        disposer = () => disposer.close();
      } else {
        throw new TypeError(
          "Disposable.add expects a cleanup function or disposable resource."
        );
      }
    }

    if (this.#disposed || this.#disposing) {
      this.#execute(disposer);
      return () => false;
    }

    this.#disposers.push(disposer);

    let active = true;

    return () => {
      if (!active) {
        return false;
      }

      active = false;

      const index = this.#disposers.indexOf(disposer);

      if (index === -1) {
        return false;
      }

      this.#disposers.splice(index, 1);
      this.#execute(disposer);

      return true;
    };
  }

  defer(disposer) {
    return this.add(disposer);
  }

  use(resource) {
    this.add(resource);
    return resource;
  }

  moveTo(target) {
    if (!(target instanceof Disposable)) {
      throw new TypeError("Target must be a Disposable instance.");
    }

    if (target === this) {
      return target;
    }

    if (this.#disposed || target.#disposed || target.#disposing) {
      throw new Error("Cannot transfer resources to a disposed container.");
    }

    for (const disposer of this.#disposers) {
      target.add(disposer);
    }

    this.#disposers.length = 0;
    this.#disposed = true;

    return target;
  }

  dispose() {
    if (this.#disposed || this.#disposing) {
      return;
    }

    this.#disposing = true;

    while (this.#disposers.length > 0) {
      const disposer = this.#disposers.pop();
      this.#execute(disposer);
    }

    this.#disposing = false;
    this.#disposed = true;
  }

  destroy() {
    this.dispose();
  }

  clear() {
    this.dispose();
  }

  #execute(disposer) {
    try {
      const result = disposer();

      if (result && typeof result.then === "function") {
        result.catch((error) => {
          this.#errors.push(error);
          this.#report(error);
        });
      }
    } catch (error) {
      this.#errors.push(error);
      this.#report(error);
    }
  }

  #report(error) {
    if (typeof console !== "undefined" && console.error) {
      console.error("Disposable cleanup failed:", error);
    }
  }
}

export { Disposable };
export default Disposable;