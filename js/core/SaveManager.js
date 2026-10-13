import GAME_CONFIG from "./config.js";

const DEFAULT_STORAGE_KEY =
  GAME_CONFIG?.storage?.profileKey ?? "kanoRunProfile";

const SAVE_VERSION = 1;

const DEFAULT_PROFILE = {
  version: SAVE_VERSION,
  createdAt: null,
  updatedAt: null,

  wallet: 2500,
  totalEarnings: 0,
  totalSpent: 0,

  xp: 0,
  level: 1,
  score: 0,
  highScore: 0,

  selectedDriver: "ruffneck",
  selectedVehicle: "standard",
  selectedPaint: "classic",

  ownedVehicles: ["standard"],
  ownedPaints: ["classic"],
  ownedDecals: [],
  ownedAccessories: [],

  upgrades: {
    engine: 0,
    handling: 0,
    brakes: 0,
    fuelTank: 0,
  },

  completedMissions: [],
  completedRoutes: [],
  achievements: [],
  unlockedDistricts: ["city-centre"],

  statistics: {
    trips: 0,
    deliveries: 0,
    passengersDelivered: 0,
    distance: 0,
    nearMisses: 0,
    collisions: 0,
    playTime: 0,
  },

  settings: {
    soundEnabled: true,
    musicEnabled: true,
    soundVolume: 0.7,
    musicVolume: 0.35,
    vibrationEnabled: true,
    reducedMotion: false,
  },
};

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

function mergeObjects(defaultValue, savedValue) {
  if (!isObject(defaultValue) || !isObject(savedValue)) {
    return savedValue === undefined
      ? clone(defaultValue)
      : savedValue;
  }

  const result = clone(defaultValue);

  for (const key of Object.keys(savedValue)) {
    if (Object.prototype.hasOwnProperty.call(defaultValue, key)) {
      result[key] =
        isObject(defaultValue[key]) && isObject(savedValue[key])
          ? mergeObjects(defaultValue[key], savedValue[key])
          : savedValue[key];
    }
  }

  return result;
}

export default class SaveManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.backupKey = `${this.storageKey}:backup`;
    this.storage = options.storage ?? this.getStorage();

    this.profile = clone(DEFAULT_PROFILE);
    this.dirty = false;
    this.lastSavedAt = null;
    this.saveTimer = null;
    this.destroyed = false;

    this.autosaveDelay = Math.max(
      250,
      Number(options.autosaveDelay ?? 1500)
    );
  }

  getStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }

      const testKey = "__kano_run_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);

      return window.localStorage;
    } catch {
      return null;
    }
  }

  createDefaultProfile() {
    const profile = clone(DEFAULT_PROFILE);
    profile.createdAt = new Date().toISOString();
    profile.updatedAt = profile.createdAt;
    return profile;
  }

  load() {
    if (this.destroyed) {
      return this.getProfile();
    }

    let savedData = null;

    try {
      savedData = this.readRecord(this.storageKey);

      if (!savedData) {
        savedData = this.readRecord(this.backupKey);
      }
    } catch (error) {
      console.warn("[Kano Run] Save loading failed:", error);
    }

    if (savedData && isObject(savedData.profile)) {
      this.profile = this.validateProfile(savedData.profile);
    } else {
      this.profile = this.createDefaultProfile();
    }

    this.dirty = false;
    this.lastSavedAt = this.profile.updatedAt ?? null;

    return this.getProfile();
  }

  readRecord(key) {
    if (!this.storage) return null;

    const raw = this.storage.getItem(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      if (!isObject(parsed)) return null;
      if (!isObject(parsed.profile)) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  validateProfile(profile) {
    const merged = mergeObjects(DEFAULT_PROFILE, profile);

    merged.version = SAVE_VERSION;
    merged.wallet = this.nonNegativeNumber(merged.wallet);
    merged.totalEarnings = this.nonNegativeNumber(
      merged.totalEarnings
    );
    merged.totalSpent = this.nonNegativeNumber(merged.totalSpent);
    merged.xp = this.nonNegativeNumber(merged.xp);
    merged.level = Math.max(
      1,
      Math.floor(this.nonNegativeNumber(merged.level))
    );
    merged.score = this.nonNegativeNumber(merged.score);
    merged.highScore = this.nonNegativeNumber(merged.highScore);

    merged.ownedVehicles = this.uniqueStrings(merged.ownedVehicles);
    merged.ownedPaints = this.uniqueStrings(merged.ownedPaints);
    merged.ownedDecals = this.uniqueStrings(merged.ownedDecals);
    merged.ownedAccessories = this.uniqueStrings(
      merged.ownedAccessories
    );

    merged.completedMissions = this.uniqueStrings(
      merged.completedMissions
    );
    merged.completedRoutes = this.uniqueStrings(
      merged.completedRoutes
    );
    merged.achievements = this.uniqueStrings(merged.achievements);
    merged.unlockedDistricts = this.uniqueStrings(
      merged.unlockedDistricts
    );

    merged.statistics = this.validateStatistics(merged.statistics);
    merged.settings = this.validateSettings(merged.settings);

    if (!merged.ownedVehicles.includes("standard")) {
      merged.ownedVehicles.unshift("standard");
    }

    if (!merged.ownedPaints.includes("classic")) {
      merged.ownedPaints.unshift("classic");
    }

    if (!merged.ownedVehicles.includes(merged.selectedVehicle)) {
      merged.selectedVehicle = "standard";
    }

    if (!merged.ownedPaints.includes(merged.selectedPaint)) {
      merged.selectedPaint = "classic";
    }

    return merged;
  }

  validateStatistics(statistics) {
    const result = clone(DEFAULT_PROFILE.statistics);

    if (!isObject(statistics)) return result;

    for (const key of Object.keys(result)) {
      result[key] = this.nonNegativeNumber(statistics[key]);
    }

    return result;
  }

  validateSettings(settings) {
    const result = clone(DEFAULT_PROFILE.settings);

    if (!isObject(settings)) return result;

    result.soundEnabled = settings.soundEnabled !== false;
    result.musicEnabled = settings.musicEnabled !== false;
    result.vibrationEnabled = settings.vibrationEnabled !== false;
    result.reducedMotion = settings.reducedMotion === true;

    result.soundVolume = this.clamp(
      Number(settings.soundVolume ?? result.soundVolume),
      0,
      1
    );

    result.musicVolume = this.clamp(
      Number(settings.musicVolume ?? result.musicVolume),
      0,
      1
    );

    return result;
  }

  getProfile() {
    return clone(this.profile);
  }

  getValue(path, fallback = undefined) {
    const keys = String(path).split(".");
    let current = this.profile;

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

  setValue(path, value, options = {}) {
    if (this.destroyed || typeof path !== "string" || !path.trim()) {
      return false;
    }

    const keys = path.split(".");
    let current = this.profile;

    for (const key of keys.slice(0, -1)) {
      if (!isObject(current[key])) {
        current[key] = {};
      }

      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
    this.markDirty(options.autosave !== false);

    return true;
  }

  updateProfile(updates, options = {}) {
    if (this.destroyed || !isObject(updates)) return false;

    this.profile = this.validateProfile(
      mergeObjects(this.profile, updates)
    );

    this.markDirty(options.autosave !== false);
    return true;
  }

  updateStatistics(updates, options = {}) {
    if (!isObject(updates)) return false;

    const next = { ...this.profile.statistics };

    for (const [key, value] of Object.entries(updates)) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        next[key] = this.nonNegativeNumber(value);
      }
    }

    this.profile.statistics = next;
    this.markDirty(options.autosave !== false);

    return true;
  }

  addToStatistic(key, amount = 1, options = {}) {
    if (
      !Object.prototype.hasOwnProperty.call(
        this.profile.statistics,
        key
      )
    ) {
      return false;
    }

    const current = this.profile.statistics[key];
    const increment = Number(amount);

    if (!Number.isFinite(increment)) return false;

    return this.updateStatistics(
      { [key]: Math.max(0, current + increment) },
      options
    );
  }

  updateSetting(key, value, options = {}) {
    if (
      !Object.prototype.hasOwnProperty.call(
        this.profile.settings,
        key
      )
    ) {
      return false;
    }

    const next = { ...this.profile.settings };

    if (key.endsWith("Volume")) {
      next[key] = this.clamp(Number(value), 0, 1);
    } else {
      next[key] = Boolean(value);
    }

    this.profile.settings = next;
    this.markDirty(options.autosave !== false);

    return true;
  }

  addOwnedItem(collection, itemId, options = {}) {
    const allowed = [
      "ownedVehicles",
      "ownedPaints",
      "ownedDecals",
      "ownedAccessories",
    ];

    if (
      !allowed.includes(collection) ||
      typeof itemId !== "string" ||
      !itemId.trim()
    ) {
      return false;
    }

    if (!this.profile[collection].includes(itemId)) {
      this.profile[collection].push(itemId);
      this.markDirty(options.autosave !== false);
    }

    return true;
  }

  addAchievement(achievementId, options = {}) {
    if (
      typeof achievementId !== "string" ||
      !achievementId.trim()
    ) {
      return false;
    }

    if (!this.profile.achievements.includes(achievementId)) {
      this.profile.achievements.push(achievementId);
      this.markDirty(options.autosave !== false);
    }

    return true;
  }

  markDirty(autosave = true) {
    this.dirty = true;

    if (autosave) {
      this.scheduleSave();
    }
  }

  scheduleSave() {
    if (this.destroyed || !this.storage) return;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, this.autosaveDelay);
  }

  save() {
    if (this.destroyed || !this.storage) {
      return false;
    }

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const now = new Date().toISOString();

    this.profile.version = SAVE_VERSION;
    this.profile.updatedAt = now;

    if (!this.profile.createdAt) {
      this.profile.createdAt = now;
    }

    const record = {
      schema: SAVE_VERSION,
      savedAt: now,
      profile: this.profile,
    };

    try {
      const previous = this.storage.getItem(this.storageKey);

      if (previous) {
        this.storage.setItem(this.backupKey, previous);
      }

      this.storage.setItem(
        this.storageKey,
        JSON.stringify(record)
      );

      this.lastSavedAt = now;
      this.dirty = false;

      return true;
    } catch (error) {
      console.warn("[Kano Run] Save failed:", error);
      return false;
    }
  }

  reset(options = {}) {
    if (this.destroyed) return false;

    this.profile = this.createDefaultProfile();
    this.dirty = true;

    if (options.save === false) {
      return true;
    }

    return this.save();
  }

  exportSave() {
    return JSON.stringify(
      {
        game: "Kano Run",
        schema: SAVE_VERSION,
        exportedAt: new Date().toISOString(),
        profile: this.profile,
      },
      null,
      2
    );
  }

  importSave(serialized, options = {}) {
    if (this.destroyed || typeof serialized !== "string") {
      return false;
    }

    try {
      const parsed = JSON.parse(serialized);
      const candidate = isObject(parsed.profile)
        ? parsed.profile
        : parsed;

      if (!isObject(candidate)) return false;

      this.profile = this.validateProfile(candidate);
      this.markDirty(false);

      return options.save === false ? true : this.save();
    } catch (error) {
      console.warn("[Kano Run] Import failed:", error);
      return false;
    }
  }

  removeSavedData() {
    if (!this.storage) return false;

    try {
      this.storage.removeItem(this.storageKey);
      this.storage.removeItem(this.backupKey);
      return true;
    } catch {
      return false;
    }
  }

  getStatus() {
    return {
      available: Boolean(this.storage),
      dirty: this.dirty,
      lastSavedAt: this.lastSavedAt,
      storageKey: this.storageKey,
    };
  }

  nonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, number)
      : 0;
  }

  uniqueStrings(value) {
    if (!Array.isArray(value)) return [];

    return [
      ...new Set(
        value.filter(
          (item) =>
            typeof item === "string" && item.trim().length > 0
        )
      ),
    ];
  }

  clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  destroy() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.dirty) {
      this.save();
    }

    this.destroyed = true;
  }
}