export default class ResourceTracker {
  constructor() {
    this.resources = new Set();
    this.disposers = new Set();
    this.destroyed = false;
  }

  track(resource) {
    if (this.destroyed) {
      throw new Error("ResourceTracker has been destroyed.");
    }

    if (!resource) return resource;

    this.resources.add(resource);
    return resource;
  }

  trackDisposable(disposer) {
    if (this.destroyed) {
      throw new Error("ResourceTracker has been destroyed.");
    }

    if (typeof disposer !== "function") {
      throw new TypeError("Disposer must be a function.");
    }

    this.disposers.add(disposer);
    return disposer;
  }

  trackEvent(target, eventName, handler, options) {
    if (!target?.addEventListener || !target?.removeEventListener) {
      throw new TypeError("Target must support event listeners.");
    }

    target.addEventListener(eventName, handler, options);

    return this.trackDisposable(() => {
      target.removeEventListener(eventName, handler, options);
    });
  }

  trackInterval(callback, delay, ...args) {
    const id = setInterval(callback, delay, ...args);

    this.trackDisposable(() => clearInterval(id));

    return id;
  }

  trackTimeout(callback, delay, ...args) {
    const id = setTimeout(callback, delay, ...args);

    this.trackDisposable(() => clearTimeout(id));

    return id;
  }

  trackAnimationFrame(callback) {
    const id = requestAnimationFrame(callback);

    this.trackDisposable(() => cancelAnimationFrame(id));

    return id;
  }

  release(resource) {
    if (!resource || !this.resources.has(resource)) {
      return false;
    }

    this.resources.delete(resource);
    this.disposeResource(resource);

    return true;
  }

  disposeResource(resource) {
    try {
      if (typeof resource.dispose === "function") {
        resource.dispose();
      } else if (typeof resource.destroy === "function") {
        resource.destroy();
      } else if (typeof resource.disconnect === "function") {
        resource.disconnect();
      } else if (typeof resource.terminate === "function") {
        resource.terminate();
      } else if (typeof resource.close === "function") {
        resource.close();
      }
    } catch (error) {
      console.error("[Kano Run] Resource cleanup failed:", error);
    }
  }

  disposeAll() {
    const errors = [];

    for (const disposer of [...this.disposers].reverse()) {
      try {
        disposer();
      } catch (error) {
        errors.push(error);
      }
    }

    this.disposers.clear();

    for (const resource of [...this.resources].reverse()) {
      try {
        this.disposeResource(resource);
      } catch (error) {
        errors.push(error);
      }
    }

    this.resources.clear();

    return errors;
  }

  get size() {
    return this.resources.size + this.disposers.size;
  }

  destroy() {
    if (this.destroyed) return;

    this.disposeAll();
    this.destroyed = true;
  }
}