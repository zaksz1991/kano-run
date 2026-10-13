const EnvironmentUtils = {
  isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  },

  isNode() {
    return (
      typeof process !== "undefined" &&
      Boolean(process.versions?.node)
    );
  },

  isSecureContext() {
    return this.isBrowser() && window.isSecureContext === true;
  },

  getEnvironment() {
    if (this.isBrowser()) return "browser";
    if (this.isNode()) return "node";
    return "unknown";
  },

  getViewport() {
    if (!this.isBrowser()) {
      return { width: 0, height: 0 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  getPixelRatio(max = 2) {
    if (!this.isBrowser()) return 1;

    const ratio = Number(window.devicePixelRatio) || 1;
    return Math.min(Math.max(ratio, 1), max);
  },

  isPortrait() {
    const { width, height } = this.getViewport();
    return height > width;
  },

  isLandscape() {
    const { width, height } = this.getViewport();
    return width >= height;
  },

  prefersReducedMotion() {
    return (
      this.isBrowser() &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  },

  prefersDarkMode() {
    return (
      this.isBrowser() &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  },

  isOnline() {
    return !this.isBrowser() || navigator.onLine;
  },

  getLanguage() {
    if (!this.isBrowser()) return "en";
    return navigator.language || "en";
  },

  getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  },

  onResize(callback) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    window.addEventListener("resize", callback);

    return () => {
      window.removeEventListener("resize", callback);
    };
  },

  onOnlineChange(callback) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);

    return () => {
      window.removeEventListener("online", callback);
      window.removeEventListener("offline", callback);
    };
  },
};

export default EnvironmentUtils;