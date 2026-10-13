import EnvironmentUtils from "./EnvironmentUtils.js";

class OrientationManager {
  constructor(options = {}) {
    this.options = {
      lockLandscape: false,
      onChange: null,
      ...options,
    };

    this.orientation = this.getOrientation();
    this.listeners = new Set();
    this.cleanupHandlers = [];
    this.started = false;
  }

  start() {
    if (this.started || !EnvironmentUtils.isBrowser()) return;

    this.started = true;

    const handleChange = () => {
      const nextOrientation = this.getOrientation();

      if (nextOrientation === this.orientation) return;

      this.orientation = nextOrientation;

      for (const listener of this.listeners) {
        try {
          listener(nextOrientation);
        } catch (error) {
          console.error("Orientation listener failed:", error);
        }
      }

      if (typeof this.options.onChange === "function") {
        this.options.onChange(nextOrientation);
      }
    };

    window.addEventListener("resize", handleChange);
    window.addEventListener("orientationchange", handleChange);

    this.cleanupHandlers.push(() => {
      window.removeEventListener("resize", handleChange);
      window.removeEventListener("orientationchange", handleChange);
    });

    if (this.options.lockLandscape) {
      this.lockLandscape().catch(() => {});
    }

    handleChange();
  }

  getOrientation() {
    const { width, height } = EnvironmentUtils.getViewport();

    if (width === height) return "square";
    return width > height ? "landscape" : "portrait";
  }

  isLandscape() {
    return this.getOrientation() === "landscape";
  }

  isPortrait() {
    return this.getOrientation() === "portrait";
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Orientation listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async lockLandscape() {
    if (!EnvironmentUtils.isBrowser()) return false;

    const orientation = screen.orientation;

    if (!orientation || typeof orientation.lock !== "function") {
      return false;
    }

    try {
      await orientation.lock("landscape");
      return true;
    } catch {
      return false;
    }
  }

  async unlock() {
    if (!EnvironmentUtils.isBrowser()) return false;

    try {
      screen.orientation?.unlock?.();
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    for (const cleanup of this.cleanupHandlers) {
      cleanup();
    }

    this.cleanupHandlers = [];
    this.listeners.clear();
    this.started = false;
  }
}

export default OrientationManager;