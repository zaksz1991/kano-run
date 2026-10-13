class VisibilityManager {
  constructor(options = {}) {
    this.options = {
      pauseWhenHidden: true,
      onHidden: null,
      onVisible: null,
      ...options,
    };

    this.isVisible = true;
    this.listeners = new Set();
    this.started = false;
    this.handleVisibilityChange =
      this.handleVisibilityChange.bind(this);
    this.handlePageHide = this.handlePageHide.bind(this);
    this.handlePageShow = this.handlePageShow.bind(this);
  }

  start() {
    if (this.started || typeof document === "undefined") return;

    this.started = true;
    this.isVisible = !document.hidden;

    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );

    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("pageshow", this.handlePageShow);
  }

  handleVisibilityChange() {
    this.setVisibility(!document.hidden);
  }

  handlePageHide() {
    if (this.options.pauseWhenHidden) {
      this.setVisibility(false);
    }
  }

  handlePageShow() {
    if (!document.hidden) {
      this.setVisibility(true);
    }
  }

  setVisibility(visible) {
    if (this.isVisible === visible) return;

    this.isVisible = visible;

    const event = {
      visible,
      hidden: !visible,
      timestamp: Date.now(),
    };

    const callback = visible
      ? this.options.onVisible
      : this.options.onHidden;

    if (typeof callback === "function") {
      try {
        callback(event);
      } catch (error) {
        console.error("Visibility callback failed:", error);
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Visibility listener failed:", error);
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Visibility listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getVisible() {
    return this.isVisible;
  }

  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );

      window.removeEventListener("pagehide", this.handlePageHide);
      window.removeEventListener("pageshow", this.handlePageShow);
    }

    this.listeners.clear();
    this.started = false;
  }
}

export default VisibilityManager;