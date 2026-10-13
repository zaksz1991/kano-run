/**
 * Device Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const DeviceUtils = {
  getEnvironment() {
    if (typeof window === "undefined") {
      return "server";
    }

    return this.isMobile() ? "mobile" : "desktop";
  },

  isMobile() {
    if (typeof navigator === "undefined") return false;

    return (
      navigator.userAgentData?.mobile ??
      /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
    );
  },

  isTablet() {
    if (typeof navigator === "undefined") return false;

    const ua = navigator.userAgent;

    return (
      /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
      (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
      (navigator.maxTouchPoints > 1 &&
        typeof window !== "undefined" &&
        window.innerWidth >= 768)
    );
  },

  isDesktop() {
    return (
      typeof window !== "undefined" &&
      !this.isMobile() &&
      !this.isTablet()
    );
  },

  hasTouch() {
    return (
      typeof window !== "undefined" &&
      (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0
      )
    );
  },

  getScreenSize() {
    if (typeof window === "undefined") {
      return { width: 0, height: 0 };
    }

    return {
      width: window.screen.width,
      height: window.screen.height,
    };
  },

  getViewportSize() {
    if (typeof window === "undefined") {
      return { width: 0, height: 0 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  getOrientation() {
    if (typeof window === "undefined") return "unknown";

    if (screen.orientation?.type) {
      return screen.orientation.type.startsWith("portrait")
        ? "portrait"
        : "landscape";
    }

    return window.innerHeight >= window.innerWidth
      ? "portrait"
      : "landscape";
  },

  getPixelRatio() {
    if (typeof window === "undefined") return 1;

    return Math.max(1, window.devicePixelRatio || 1);
  },

  getRecommendedPixelRatio(maxRatio = 2) {
    const ratio = this.getPixelRatio();

    return Math.min(ratio, Math.max(1, maxRatio));
  },

  getPlatform() {
    if (typeof navigator === "undefined") return "unknown";

    return (
      navigator.userAgentData?.platform ||
      navigator.platform ||
      "unknown"
    );
  },

  getBrowserName() {
    if (typeof navigator === "undefined") return "unknown";

    const ua = navigator.userAgent;

    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\//i.test(ua)) return "Opera";
    if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
      return "Chrome";
    }
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
      return "Safari";
    }

    return "unknown";
  },

  getConnectionType() {
    if (typeof navigator === "undefined") return "unknown";

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    return connection?.effectiveType || "unknown";
  },

  prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  },

  prefersDarkMode() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  },

  isLowPowerDevice() {
    if (typeof navigator === "undefined") return false;

    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    const connection = this.getConnectionType();

    return (
      cores <= 4 ||
      memory <= 2 ||
      connection === "slow-2g" ||
      connection === "2g"
    );
  },

  getPerformanceProfile() {
    const mobile = this.isMobile();
    const tablet = this.isTablet();
    const lowPower = this.isLowPowerDevice();

    if (lowPower) {
      return {
        profile: "low",
        pixelRatio: 1,
        shadows: false,
        antialias: false,
        particles: false,
        trafficDensity: 0.45,
        renderScale: 0.7,
      };
    }

    if (mobile || tablet) {
      return {
        profile: "medium",
        pixelRatio: this.getRecommendedPixelRatio(1.5),
        shadows: true,
        antialias: false,
        particles: true,
        trafficDensity: 0.7,
        renderScale: 0.85,
      };
    }

    return {
      profile: "high",
      pixelRatio: this.getRecommendedPixelRatio(2),
      shadows: true,
      antialias: true,
      particles: true,
      trafficDensity: 1,
      renderScale: 1,
    };
  },

  getHardwareConcurrency() {
    if (typeof navigator === "undefined") return 2;

    return navigator.hardwareConcurrency || 2;
  },

  getDeviceMemory() {
    if (typeof navigator === "undefined") return null;

    return navigator.deviceMemory || null;
  },

  canUseWebGL2() {
    if (typeof document === "undefined") return false;

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");

      context?.getExtension("WEBGL_lose_context")?.loseContext();

      return Boolean(context);
    } catch {
      return false;
    }
  },

  getCapabilities() {
    return {
      mobile: this.isMobile(),
      tablet: this.isTablet(),
      desktop: this.isDesktop(),
      touch: this.hasTouch(),
      webgl2: this.canUseWebGL2(),
      browser: this.getBrowserName(),
      platform: this.getPlatform(),
      orientation: this.getOrientation(),
      pixelRatio: this.getPixelRatio(),
      cores: this.getHardwareConcurrency(),
      memory: this.getDeviceMemory(),
      connection: this.getConnectionType(),
      reducedMotion: this.prefersReducedMotion(),
    };
  },
};

export default DeviceUtils;