// js/core/ThemeManager.js

export class ThemeManager {
  constructor(options = {}) {
    this.options = {
      root: typeof document !== "undefined" ? document.documentElement : null,
      storageKey: "kanoRunTheme",
      defaultTheme: "dark",
      themes: ["dark", "light", "system"],
      observeSystem: true,
      ...options,
    };

    this.root = this.options.root;
    this.currentTheme = this.options.defaultTheme;
    this.listeners = new Set();
    this.mediaQuery = null;
    this.initialized = false;
    this.handleSystemChange = this.handleSystemChange.bind(this);
  }

  init() {
    if (this.initialized || typeof document === "undefined") {
      return this;
    }

    this.root ??= document.documentElement;

    if (
      this.options.observeSystem &&
      typeof window.matchMedia === "function"
    ) {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.mediaQuery.addEventListener?.("change", this.handleSystemChange);
    }

    const savedTheme = this.loadSavedTheme();
    const initialTheme = this.isValidTheme(savedTheme)
      ? savedTheme
      : this.options.defaultTheme;

    this.setTheme(initialTheme, { persist: false, emit: false });

    this.initialized = true;
    return this;
  }

  setTheme(theme, options = {}) {
    const { persist = true, emit = true } = options;

    if (!this.isValidTheme(theme)) {
      throw new Error(`Unsupported theme "${theme}".`);
    }

    const previousTheme = this.currentTheme;
    this.currentTheme = theme;

    const resolvedTheme = this.resolveTheme(theme);

    if (this.root) {
      this.root.dataset.theme = resolvedTheme;
      this.root.dataset.themePreference = theme;
      this.root.classList.toggle("theme-dark", resolvedTheme === "dark");
      this.root.classList.toggle("theme-light", resolvedTheme === "light");
      this.root.style.colorScheme = resolvedTheme;
    }

    if (persist) {
      this.saveTheme(theme);
    }

    if (emit && previousTheme !== theme) {
      this.notify({
        theme,
        resolvedTheme,
        previousTheme,
      });
    }

    return resolvedTheme;
  }

  toggle() {
    const resolved = this.resolveTheme(this.currentTheme);
    const nextTheme = resolved === "dark" ? "light" : "dark";

    this.setTheme(nextTheme);

    return nextTheme;
  }

  getTheme() {
    return this.currentTheme;
  }

  getResolvedTheme() {
    return this.resolveTheme(this.currentTheme);
  }

  resolveTheme(theme) {
    if (theme !== "system") {
      return theme;
    }

    return this.mediaQuery?.matches ? "dark" : "light";
  }

  isValidTheme(theme) {
    return typeof theme === "string" &&
      this.options.themes.includes(theme);
  }

  handleSystemChange() {
    if (this.currentTheme !== "system") {
      return;
    }

    const resolvedTheme = this.resolveTheme("system");

    if (this.root) {
      this.root.dataset.theme = resolvedTheme;
      this.root.classList.toggle("theme-dark", resolvedTheme === "dark");
      this.root.classList.toggle("theme-light", resolvedTheme === "light");
      this.root.style.colorScheme = resolvedTheme;
    }

    this.notify({
      theme: "system",
      resolvedTheme,
      systemChange: true,
    });
  }

  saveTheme(theme) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.options.storageKey, theme);
      }
    } catch (error) {
      console.warn("[ThemeManager] Unable to save theme:", error);
    }
  }

  loadSavedTheme() {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(this.options.storageKey);
      }
    } catch (error) {
      console.warn("[ThemeManager] Unable to load theme:", error);
    }

    return null;
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Theme subscriber must be a function.");
    }

    this.listeners.add(callback);

    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback) {
    return this.listeners.delete(callback);
  }

  notify(event) {
    for (const callback of [...this.listeners]) {
      try {
        callback(event);
      } catch (error) {
        console.error("[ThemeManager] Subscriber failed:", error);
      }
    }
  }

  destroy() {
    this.mediaQuery?.removeEventListener?.(
      "change",
      this.handleSystemChange
    );

    this.listeners.clear();
    this.mediaQuery = null;
    this.initialized = false;
  }
}

export default ThemeManager;