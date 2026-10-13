class AccessibilityManager {
  constructor(options = {}) {
    this.options = {
      announceChanges: true,
      reducedMotion: null,
      highContrast: null,
      largeText: null,
      ...options,
    };

    this.preferences = {
      reducedMotion: false,
      highContrast: false,
      largeText: false,
    };

    this.listeners = new Set();
    this.mediaQueries = [];
    this.liveRegion = null;
    this.started = false;
    this.announcementTimer = null;

    this.handlePreferenceChange =
      this.handlePreferenceChange.bind(this);
  }

  start() {
    if (this.started || typeof window === "undefined") return;

    this.started = true;

    this.watchPreference(
      "(prefers-reduced-motion: reduce)",
      "reducedMotion"
    );

    this.watchPreference(
      "(prefers-contrast: more)",
      "highContrast"
    );

    this.applyPreferences();
    this.createLiveRegion();
  }

  watchPreference(query, preference) {
    const media = window.matchMedia(query);

    const update = () => {
      if (this.options[preference] !== null) return;

      this.preferences[preference] = media.matches;
      this.applyPreferences();
      this.notifyListeners();
    };

    if (this.options[preference] === null) {
      this.preferences[preference] = media.matches;
    } else {
      this.preferences[preference] =
        Boolean(this.options[preference]);
    }

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      this.mediaQueries.push(() => {
        media.removeEventListener("change", update);
      });
    } else if (typeof media.addListener === "function") {
      media.addListener(update);
      this.mediaQueries.push(() => {
        media.removeListener(update);
      });
    }
  }

  handlePreferenceChange() {
    this.applyPreferences();
    this.notifyListeners();
  }

  applyPreferences() {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    root.classList.toggle(
      "accessibility-reduced-motion",
      this.preferences.reducedMotion
    );

    root.classList.toggle(
      "accessibility-high-contrast",
      this.preferences.highContrast
    );

    root.classList.toggle(
      "accessibility-large-text",
      this.preferences.largeText
    );

    root.dataset.reducedMotion =
      String(this.preferences.reducedMotion);
    root.dataset.highContrast =
      String(this.preferences.highContrast);
    root.dataset.largeText =
      String(this.preferences.largeText);
  }

  setPreference(name, value) {
    if (!(name in this.preferences)) {
      throw new Error(`Unknown accessibility preference: ${name}`);
    }

    this.preferences[name] = Boolean(value);
    this.options[name] = Boolean(value);

    this.applyPreferences();
    this.notifyListeners();

    return this.preferences[name];
  }

  getPreference(name) {
    return this.preferences[name] ?? false;
  }

  getPreferences() {
    return { ...this.preferences };
  }

  createLiveRegion() {
    if (
      !this.options.announceChanges ||
      typeof document === "undefined"
    ) {
      return;
    }

    if (document.getElementById("game-live-region")) {
      this.liveRegion = document.getElementById("game-live-region");
      return;
    }

    const region = document.createElement("div");

    region.id = "game-live-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("role", "status");

    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });

    document.body.appendChild(region);
    this.liveRegion = region;
  }

  announce(message, priority = "polite") {
    if (!this.options.announceChanges || !this.liveRegion) {
      return;
    }

    this.liveRegion.setAttribute(
      "aria-live",
      priority === "assertive" ? "assertive" : "polite"
    );

    this.liveRegion.textContent = "";

    clearTimeout(this.announcementTimer);

    this.announcementTimer = setTimeout(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = String(message ?? "");
      }
    }, 50);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Accessibility listener must be a function."
      );
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    const preferences = this.getPreferences();

    for (const listener of this.listeners) {
      try {
        listener(preferences);
      } catch (error) {
        console.error(
          "Accessibility preference listener failed:",
          error
        );
      }
    }
  }

  destroy() {
    for (const cleanup of this.mediaQueries) {
      cleanup();
    }

    this.mediaQueries = [];
    clearTimeout(this.announcementTimer);

    if (
      this.liveRegion &&
      this.liveRegion.id === "game-live-region"
    ) {
      this.liveRegion.remove();
    }

    this.liveRegion = null;
    this.listeners.clear();
    this.started = false;
  }
}

export default AccessibilityManager;