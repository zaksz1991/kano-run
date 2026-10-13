const DEFAULT_SETTINGS = Object.freeze({
  audio: {
    enabled: true,
    musicEnabled: true,
    soundEnabled: true,
    masterVolume: 0.7,
    musicVolume: 0.35,
    soundVolume: 0.8,
  },

  controls: {
    steeringSensitivity: 1,
    steeringAssist: true,
    invertSteering: false,
    vibrationEnabled: true,
  },

  gameplay: {
    difficulty: "normal",
    trafficDensity: 1,
    showMinimap: true,
    showSpeedometer: true,
    showMissionHints: true,
    cameraMode: "chase",
    autoAccelerate: false,
  },

  graphics: {
    quality: "high",
    shadows: true,
    particles: true,
    reducedMotion: false,
    screenShake: true,
    fieldOfView: 70,
  },

  accessibility: {
    highContrast: false,
    largerText: false,
    colorblindMode: "none",
  },
});

const STORAGE_KEY = "kanoRunSettings";
const SETTINGS_VERSION = 1;

const VALID_VALUES = Object.freeze({
  "gameplay.difficulty": ["easy", "normal", "hard"],
  "gameplay.cameraMode": ["chase", "close", "cinematic", "overhead"],
  "graphics.quality": ["low", "medium", "high"],
  "accessibility.colorblindMode": [
    "none",
    "protanopia",
    "deuteranopia",
    "tritanopia",
  ],
});

const NUMERIC_RANGES = Object.freeze({
  "audio.masterVolume": [0, 1],
  "audio.musicVolume": [0, 1],
  "audio.soundVolume": [0, 1],
  "controls.steeringSensitivity": [0.25, 2],
  "gameplay.trafficDensity": [0.25, 1.5],
  "graphics.fieldOfView": [50, 100],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function mergeDefaults(defaults, saved) {
  const result = clone(defaults);

  if (!isObject(saved)) return result;

  for (const [key, value] of Object.entries(saved)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
      continue;
    }

    if (isObject(defaults[key]) && isObject(value)) {
      result[key] = mergeDefaults(defaults[key], value);
    } else if (typeof value === typeof defaults[key]) {
      result[key] = value;
    }
  }

  return result;
}

export default class SettingsManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? STORAGE_KEY;
    this.storage = options.storage ?? this.getStorage();
    this.settings = clone(DEFAULT_SETTINGS);
    this.listeners = new Set();
    this.eventBus = options.eventBus ?? null;
    this.destroyed = false;

    this.load();
  }

  getStorage() {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage;
    } catch {
      return null;
    }
  }

  load() {
    if (!this.storage) {
      this.settings = clone(DEFAULT_SETTINGS);
      return this.getAll();
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        this.settings = clone(DEFAULT_SETTINGS);
        return this.getAll();
      }

      const parsed = JSON.parse(raw);

      const savedSettings = isObject(parsed.settings)
        ? parsed.settings
        : parsed;

      this.settings = mergeDefaults(
        DEFAULT_SETTINGS,
        savedSettings
      );

      this.validateAll();
    } catch (error) {
      console.warn("[Kano Run] Could not load settings:", error);
      this.settings = clone(DEFAULT_SETTINGS);
    }

    return this.getAll();
  }

  save() {
    if (this.destroyed || !this.storage) return false;

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: SETTINGS_VERSION,
          updatedAt: new Date().toISOString(),
          settings: this.settings,
        })
      );

      return true;
    } catch (error) {
      console.warn("[Kano Run] Could not save settings:", error);
      return false;
    }
  }

  getAll() {
    return clone(this.settings);
  }

  get(path, fallback = undefined) {
    if (typeof path !== "string" || !path.trim()) {
      return fallback;
    }

    const keys = path.split(".");
    let current = this.settings;

    for (const key of keys) {
      if (
        current === null ||
        current === undefined ||
        !Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return fallback;
      }

      current = current[key];
    }

    return current;
  }

  set(path, value, options = {}) {
    if (
      this.destroyed ||
      typeof path !== "string" ||
      !path.trim()
    ) {
      return false;
    }

    const keys = path.split(".");
    let current = this.settings;

    for (const key of keys.slice(0, -1)) {
      if (!isObject(current[key])) return false;
      current = current[key];
    }

    const key = keys[keys.length - 1];

    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return false;
    }

    const normalized = this.normalizeValue(path, value);

    if (normalized === undefined) return false;

    const previous = current[key];

    if (previous === normalized) return true;

    current[key] = normalized;

    if (options.save !== false) {
      this.save();
    }

    this.notify(path, normalized, previous);
    return true;
  }

  setMany(updates, options = {}) {
    if (this.destroyed || !isObject(updates)) return false;

    const changes = [];

    for (const [path, value] of Object.entries(updates)) {
      const previous = this.get(path);
      const normalized = this.normalizeValue(path, value);

      if (normalized === undefined) continue;
      if (previous === undefined || previous === normalized) continue;

      if (this.set(path, normalized, { save: false })) {
        changes.push({ path, value: normalized, previous });
      }
    }

    if (changes.length === 0) return true;

    if (options.save !== false) {
      this.save();
    }

    for (const change of changes) {
      this.notify(change.path, change.value, change.previous);
    }

    return true;
  }

  normalizeValue(path, value) {
    const allowed = VALID_VALUES[path];

    if (allowed) {
      return allowed.includes(value) ? value : undefined;
    }

    const range = NUMERIC_RANGES[path];

    if (range) {
      const number = Number(value);

      if (!Number.isFinite(number)) return undefined;

      return Math.max(range[0], Math.min(range[1], number));
    }

    const existing = this.get(path);

    if (typeof existing === "boolean") {
      return typeof value === "boolean" ? value : undefined;
    }

    if (typeof existing === "string") {
      return typeof value === "string" ? value : undefined;
    }

    return undefined;
  }

  validateAll() {
    for (const [path, range] of Object.entries(NUMERIC_RANGES)) {
      const value = Number(this.get(path));

      this.setDirect(
        path,
        Number.isFinite(value)
          ? Math.max(range[0], Math.min(range[1], value))
          : this.getDefault(path)
      );
    }

    for (const [path, allowed] of Object.entries(VALID_VALUES)) {
      if (!allowed.includes(this.get(path))) {
        this.setDirect(path, this.getDefault(path));
      }
    }
  }

  setDirect(path, value) {
    const keys = path.split(".");
    let current = this.settings;

    for (const key of keys.slice(0, -1)) {
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  getDefault(path) {
    const keys = path.split(".");
    let current = DEFAULT_SETTINGS;

    for (const key of keys) {
      current = current?.[key];
    }

    return current;
  }

  reset(options = {}) {
    if (this.destroyed) return false;

    const previous = this.getAll();
    this.settings = clone(DEFAULT_SETTINGS);

    if (options.save !== false) {
      this.save();
    }

    this.notify("*", this.getAll(), previous);
    return true;
  }

  subscribe(listener) {
    if (this.destroyed || typeof listener !== "function") {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(path, value, previous) {
    for (const listener of this.listeners) {
      try {
        listener({
          path,
          value: clone(value),
          previous: clone(previous),
          settings: this.getAll(),
        });
      } catch (error) {
        console.error(
          "[Kano Run] Settings listener failed:",
          error
        );
      }
    }

    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit("settings:changed", {
        path,
        value: clone(value),
        previous: clone(previous),
      });
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.save();
    this.listeners.clear();
    this.destroyed = true;
  }
}