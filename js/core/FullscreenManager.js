class FullscreenManager {
  constructor(options = {}) {
    this.options = {
      element: null,
      onChange: null,
      onError: null,
      ...options,
    };

    this.element = null;
    this.started = false;
    this.listeners = new Set();

    this.handleChange = this.handleChange.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  start() {
    if (this.started || typeof document === "undefined") return;

    this.started = true;

    document.addEventListener("fullscreenchange", this.handleChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this.handleChange
    );
    document.addEventListener("fullscreenerror", this.handleError);

    this.element =
      typeof this.options.element === "string"
        ? document.querySelector(this.options.element)
        : this.options.element || document.getElementById("c")?.parentElement;
  }

  isSupported() {
    if (typeof document === "undefined") return false;

    const element = this.element || document.documentElement;

    return Boolean(
      element.requestFullscreen ||
      element.webkitRequestFullscreen
    );
  }

  isFullscreen() {
    if (typeof document === "undefined") return false;

    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
  }

  async enter(element = this.element) {
    if (typeof document === "undefined") return false;

    const target = element || document.documentElement;

    try {
      if (this.isFullscreen()) return true;

      const request =
        target.requestFullscreen ||
        target.webkitRequestFullscreen;

      if (typeof request !== "function") return false;

      await request.call(target);
      return true;
    } catch (error) {
      this.notifyError(error);
      return false;
    }
  }

  async exit() {
    if (typeof document === "undefined") return false;
    if (!this.isFullscreen()) return true;

    try {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen;

      if (typeof exit !== "function") return false;

      await exit.call(document);
      return true;
    } catch (error) {
      this.notifyError(error);
      return false;
    }
  }

  async toggle(element = this.element) {
    return this.isFullscreen()
      ? this.exit()
      : this.enter(element);
  }

  handleChange() {
    const state = {
      fullscreen: this.isFullscreen(),
      element:
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        null,
    };

    if (typeof this.options.onChange === "function") {
      this.options.onChange(state);
    }

    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error("Fullscreen listener failed:", error);
      }
    }
  }

  handleError(event) {
    this.notifyError(event);
  }

  notifyError(error) {
    if (typeof this.options.onError === "function") {
      this.options.onError(error);
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Fullscreen listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "fullscreenchange",
        this.handleChange
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        this.handleChange
      );
      document.removeEventListener(
        "fullscreenerror",
        this.handleError
      );
    }

    this.listeners.clear();
    this.started = false;
  }
}

export default FullscreenManager;