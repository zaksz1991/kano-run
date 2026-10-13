/**
 * Feature Detection
 * RuffNeck Entertainment — Kano Run
 */

export const FeatureDetection = {
  hasWindow() {
    return typeof window !== "undefined";
  },

  hasDocument() {
    return typeof document !== "undefined";
  },

  hasLocalStorage() {
    if (!this.hasWindow()) return false;

    try {
      const key = "__ruffneck_feature_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  hasSessionStorage() {
    if (!this.hasWindow()) return false;

    try {
      const key = "__ruffneck_feature_test__";
      window.sessionStorage.setItem(key, "1");
      window.sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  hasIndexedDB() {
    return this.hasWindow() && "indexedDB" in window;
  },

  hasWebGL2() {
    if (!this.hasDocument()) return false;

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      const supported = Boolean(context);

      context?.getExtension("WEBGL_lose_context")?.loseContext();

      return supported;
    } catch {
      return false;
    }
  },

  hasWebGL() {
    if (!this.hasDocument()) return false;

    try {
      const canvas = document.createElement("canvas");

      const context =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");

      const supported = Boolean(context);

      context?.getExtension?.("WEBGL_lose_context")?.loseContext();

      return supported;
    } catch {
      return false;
    }
  },

  hasWebAudio() {
    return (
      this.hasWindow() &&
      Boolean(window.AudioContext || window.webkitAudioContext)
    );
  },

  hasWebWorkers() {
    return this.hasWindow() && typeof Worker !== "undefined";
  },

  hasServiceWorkers() {
    return (
      this.hasWindow() &&
      "serviceWorker" in navigator
    );
  },

  hasWebSockets() {
    return this.hasWindow() && typeof WebSocket !== "undefined";
  },

  hasFetch() {
    return typeof fetch === "function";
  },

  hasAbortController() {
    return typeof AbortController !== "undefined";
  },

  hasResizeObserver() {
    return typeof ResizeObserver !== "undefined";
  },

  hasIntersectionObserver() {
    return typeof IntersectionObserver !== "undefined";
  },

  hasMutationObserver() {
    return typeof MutationObserver !== "undefined";
  },

  hasPointerEvents() {
    return this.hasWindow() && "PointerEvent" in window;
  },

  hasPointerLock() {
    return (
      this.hasDocument() &&
      "pointerLockElement" in document
    );
  },

  hasFullscreen() {
    return (
      this.hasDocument() &&
      Boolean(
        document.documentElement?.requestFullscreen ||
        document.documentElement?.webkitRequestFullscreen
      )
    );
  },

  hasGamepadAPI() {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.getGamepads === "function"
    );
  },

  hasVibration() {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  },

  hasCanvas2D() {
    if (!this.hasDocument()) return false;

    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("2d"));
    } catch {
      return false;
    }
  },

  hasOffscreenCanvas() {
    return typeof OffscreenCanvas !== "undefined";
  },

  hasWebAssembly() {
    return typeof WebAssembly !== "undefined";
  },

  hasCrypto() {
    return (
      typeof crypto !== "undefined" &&
      Boolean(crypto.getRandomValues)
    );
  },

  hasCryptoRandomUUID() {
    return (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    );
  },

  hasPerformanceObserver() {
    return typeof PerformanceObserver !== "undefined";
  },

  hasPerformanceMemory() {
    return (
      this.hasWindow() &&
      Boolean(window.performance?.memory)
    );
  },

  hasReducedMotionPreference() {
    return (
      this.hasWindow() &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  },

  hasWebGLTimerQuery() {
    if (!this.hasDocument()) return false;

    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl");

      if (!gl) return false;

      const extension = gl.getExtension(
        "EXT_disjoint_timer_query_webgl2"
      ) || gl.getExtension("EXT_disjoint_timer_query");

      gl.getExtension("WEBGL_lose_context")?.loseContext();

      return Boolean(extension);
    } catch {
      return false;
    }
  },

  getSupportedFeatures() {
    return {
      browser: this.hasWindow(),
      document: this.hasDocument(),
      localStorage: this.hasLocalStorage(),
      sessionStorage: this.hasSessionStorage(),
      indexedDB: this.hasIndexedDB(),
      webgl: this.hasWebGL(),
      webgl2: this.hasWebGL2(),
      webAudio: this.hasWebAudio(),
      webWorkers: this.hasWebWorkers(),
      serviceWorkers: this.hasServiceWorkers(),
      webSockets: this.hasWebSockets(),
      fetch: this.hasFetch(),
      abortController: this.hasAbortController(),
      resizeObserver: this.hasResizeObserver(),
      intersectionObserver: this.hasIntersectionObserver(),
      mutationObserver: this.hasMutationObserver(),
      pointerEvents: this.hasPointerEvents(),
      pointerLock: this.hasPointerLock(),
      fullscreen: this.hasFullscreen(),
      gamepad: this.hasGamepadAPI(),
      vibration: this.hasVibration(),
      canvas2D: this.hasCanvas2D(),
      offscreenCanvas: this.hasOffscreenCanvas(),
      webAssembly: this.hasWebAssembly(),
      crypto: this.hasCrypto(),
      cryptoRandomUUID: this.hasCryptoRandomUUID(),
      performanceObserver: this.hasPerformanceObserver(),
      performanceMemory: this.hasPerformanceMemory(),
      reducedMotion: this.hasReducedMotionPreference(),
      webGLTimerQuery: this.hasWebGLTimerQuery(),
    };
  },

  getMissingFeatures(required = ["webgl", "canvas2D"]) {
    const supported = this.getSupportedFeatures();

    return required.filter((feature) => supported[feature] !== true);
  },

  checkRequirements(required = ["webgl", "canvas2D"]) {
    const missing = this.getMissingFeatures(required);

    return {
      supported: missing.length === 0,
      missing,
    };
  },
};

export default FeatureDetection;