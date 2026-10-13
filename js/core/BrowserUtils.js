/**
 * Browser Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const BrowserUtils = {
  isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  },

  isOnline() {
    return this.isBrowser()
      ? navigator.onLine
      : false;
  },

  isMobile() {
    if (!this.isBrowser()) return false;

    return (
      navigator.userAgentData?.mobile ??
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      )
    );
  },

  isTouchDevice() {
    if (!this.isBrowser()) return false;

    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0
    );
  },

  isPortrait() {
    if (!this.isBrowser()) return false;

    return window.matchMedia("(orientation: portrait)").matches;
  },

  isLandscape() {
    if (!this.isBrowser()) return false;

    return window.matchMedia("(orientation: landscape)").matches;
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

  getDevicePixelRatio() {
    if (!this.isBrowser()) return 1;

    return Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      2
    );
  },

  getReducedMotionPreference() {
    if (!this.isBrowser()) return false;

    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  },

  getColorScheme() {
    if (!this.isBrowser()) return "light";

    return window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "dark"
      : "light";
  },

  getLanguage() {
    if (!this.isBrowser()) return "en";

    return navigator.language || "en";
  },

  getLanguages() {
    if (!this.isBrowser()) return ["en"];

    return navigator.languages?.length
      ? [...navigator.languages]
      : [this.getLanguage()];
  },

  getUserAgent() {
    if (!this.isBrowser()) return "";

    return navigator.userAgent;
  },

  getPlatform() {
    if (!this.isBrowser()) return "unknown";

    return (
      navigator.userAgentData?.platform ||
      navigator.platform ||
      "unknown"
    );
  },

  getConnectionInfo() {
    if (!this.isBrowser()) {
      return {
        effectiveType: "unknown",
        downlink: null,
        saveData: false,
      };
    }

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    return {
      effectiveType: connection?.effectiveType ?? "unknown",
      downlink: connection?.downlink ?? null,
      saveData: connection?.saveData ?? false,
    };
  },

  requestFullscreen(element = document?.documentElement) {
    if (!element) {
      return Promise.reject(
        new Error("No element available for fullscreen.")
      );
    }

    if (document.fullscreenElement === element) {
      return Promise.resolve();
    }

    if (typeof element.requestFullscreen !== "function") {
      return Promise.reject(
        new Error("Fullscreen is not supported.")
      );
    }

    return element.requestFullscreen();
  },

  exitFullscreen() {
    if (
      !this.isBrowser() ||
      !document.fullscreenElement
    ) {
      return Promise.resolve();
    }

    if (typeof document.exitFullscreen !== "function") {
      return Promise.reject(
        new Error("Exiting fullscreen is not supported.")
      );
    }

    return document.exitFullscreen();
  },

  isFullscreen() {
    return this.isBrowser() &&
      Boolean(document.fullscreenElement);
  },

  requestPointerLock(element) {
    if (!element) {
      return Promise.reject(
        new Error("No element provided.")
      );
    }

    if (typeof element.requestPointerLock !== "function") {
      return Promise.reject(
        new Error("Pointer lock is not supported.")
      );
    }

    try {
      const result = element.requestPointerLock();

      return result instanceof Promise
        ? result
        : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  },

  getStorageAvailability(type = "localStorage") {
    if (!this.isBrowser()) return false;

    try {
      const storage = window[type];
      const key = "__ruffneck_storage_test__";

      storage.setItem(key, "1");
      storage.removeItem(key);

      return true;
    } catch {
      return false;
    }
  },

  getLocalStorage() {
    if (!this.getStorageAvailability("localStorage")) {
      return null;
    }

    return window.localStorage;
  },

  getSessionStorage() {
    if (!this.getStorageAvailability("sessionStorage")) {
      return null;
    }

    return window.sessionStorage;
  },

  onResize(callback, options = {}) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    window.addEventListener("resize", callback, options);

    return () => {
      window.removeEventListener("resize", callback, options);
    };
  },

  onOnlineChange(callback) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    const handleOnline = () => callback(navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  },

  onVisibilityChange(callback) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    const handler = () => {
      callback({
        hidden: document.hidden,
        state: document.visibilityState,
      });
    };

    document.addEventListener("visibilitychange", handler);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handler
      );
    };
  },

  onOrientationChange(callback) {
    if (!this.isBrowser() || typeof callback !== "function") {
      return () => {};
    }

    const media = window.matchMedia(
      "(orientation: portrait)"
    );

    const handler = () => {
      callback({
        portrait: media.matches,
        landscape: !media.matches,
      });
    };

    media.addEventListener?.("change", handler);

    return () => {
      media.removeEventListener?.("change", handler);
    };
  },

  observeElement(element, callback, options = {}) {
    if (
      typeof ResizeObserver === "undefined" ||
      !element ||
      typeof callback !== "function"
    ) {
      return () => {};
    }

    const observer = new ResizeObserver((entries) => {
      callback(entries);
    });

    observer.observe(element, options);

    return () => observer.disconnect();
  },

  observeIntersection(element, callback, options = {}) {
    if (
      typeof IntersectionObserver === "undefined" ||
      !element ||
      typeof callback !== "function"
    ) {
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => callback(entries),
      options
    );

    observer.observe(element);

    return () => observer.disconnect();
  },

  supportsWebGL() {
    if (!this.isBrowser()) return false;

    try {
      const canvas = document.createElement("canvas");

      return Boolean(
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
      );
    } catch {
      return false;
    }
  },

  supportsWebAudio() {
    return (
      this.isBrowser() &&
      Boolean(
        window.AudioContext ||
        window.webkitAudioContext
      )
    );
  },

  supportsGamepad() {
    return (
      this.isBrowser() &&
      typeof navigator.getGamepads === "function"
    );
  },

  getGamepads() {
    if (!this.supportsGamepad()) return [];

    return Array.from(navigator.getGamepads()).filter(Boolean);
  },

  getPerformanceMemory() {
    if (!this.isBrowser()) return null;

    const memory = performance.memory;

    if (!memory) return null;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  },
};

export default BrowserUtils;