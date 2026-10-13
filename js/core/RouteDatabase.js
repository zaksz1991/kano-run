import { DEFAULT_ROUTES } from "./RouteManager.js";

const STORAGE_KEY = "kanoRun.routeDatabase.v1";
const DATABASE_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export class RouteDatabase {
  constructor({
    storage = null,
    storageKey = STORAGE_KEY,
    routes = DEFAULT_ROUTES,
    logger = console,
  } = {}) {
    this.storage = storage ?? this.getDefaultStorage();
    this.storageKey = storageKey;
    this.logger = logger;
    this.routes = new Map();
    this.revision = 0;
    this.disposed = false;

    this.registerMany(routes);

    this.load();
  }

  getDefaultStorage() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch {
      // Storage may be blocked by browser privacy settings.
    }

    return null;
  }

  register(route) {
    this.assertActive();

    if (!route || typeof route !== "object") {
      throw new TypeError("A route object is required.");
    }

    const id = normalizeId(route.id);

    if (!id) {
      throw new Error("A route must have a non-empty id.");
    }

    if (this.routes.has(id)) {
      throw new Error(`Route "${id}" already exists.`);
    }

    const normalized = this.normalizeRoute({
      ...route,
      id,
    });

    this.routes.set(id, normalized);
    this.revision += 1;

    return clone(normalized);
  }

  registerMany(routes = []) {
    this.assertActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    const registered = [];

    for (const route of routes) {
      const id = normalizeId(route?.id);

      if (!id || this.routes.has(id)) {
        continue;
      }

      registered.push(this.register(route));
    }

    return registered;
  }

  normalizeRoute(route) {
    return {
      id: normalizeId(route.id),
      name: String(route.name ?? route.id),
      district: String(route.district ?? "Kano"),
      description: String(route.description ?? ""),
      difficulty: this.clampNumber(route.difficulty, 1, 5, 1),
      unlockLevel: Math.max(
        1,
        Math.floor(Number(route.unlockLevel) || 1),
      ),
      length: Math.max(100, Number(route.length) || 1800),
      trafficDensity: this.clampNumber(
        route.trafficDensity,
        0,
        1,
        0.5,
      ),
      passengerDemand: this.clampNumber(
        route.passengerDemand,
        0,
        1,
        0.5,
      ),
      roadWidth: this.clampNumber(route.roadWidth, 6, 24, 12),
      speedLimit: Math.max(10, Number(route.speedLimit) || 40),
      scenery: String(route.scenery ?? "urban"),
      weather: Array.isArray(route.weather)
        ? [...new Set(route.weather.map(String))]
        : ["clear"],
      landmarks: Array.isArray(route.landmarks)
        ? route.landmarks.map(String)
        : [],
      rewardMultiplier: Math.max(
        0.1,
        Number(route.rewardMultiplier) || 1,
      ),
      forcedNight: Boolean(route.forcedNight),
      forcedWeather: route.forcedWeather
        ? String(route.forcedWeather)
        : null,
    };
  }

  clampNumber(value, min, max, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, number));
  }

  get(id) {
    this.assertActive();

    const route = this.routes.get(normalizeId(id));

    return route ? clone(route) : null;
  }

  has(id) {
    this.assertActive();

    return this.routes.has(normalizeId(id));
  }

  getAll() {
    this.assertActive();

    return [...this.routes.values()].map(clone);
  }

  getIds() {
    this.assertActive();

    return [...this.routes.keys()];
  }

  getByDistrict(district) {
    this.assertActive();

    const target = normalizeId(district);

    return [...this.routes.values()]
      .filter((route) => normalizeId(route.district) === target)
      .map(clone);
  }

  getByDifficulty(difficulty) {
    this.assertActive();

    const target = Number(difficulty);

    return [...this.routes.values()]
      .filter((route) => route.difficulty === target)
      .map(clone);
  }

  getUnlocked(playerLevel = 1) {
    this.assertActive();

    const level = Math.max(1, Number(playerLevel) || 1);

    return [...this.routes.values()]
      .filter((route) => route.unlockLevel <= level)
      .map(clone);
  }

  getLocked(playerLevel = 1) {
    this.assertActive();

    const level = Math.max(1, Number(playerLevel) || 1);

    return [...this.routes.values()]
      .filter((route) => route.unlockLevel > level)
      .map(clone);
  }

  search(query, { district = null, difficulty = null } = {}) {
    this.assertActive();

    const term = normalizeId(query);
    const districtFilter = district ? normalizeId(district) : null;
    const difficultyFilter =
      difficulty === null || difficulty === undefined
        ? null
        : Number(difficulty);

    return [...this.routes.values()]
      .filter((route) => {
        const matchesQuery =
          !term ||
          normalizeId(route.id).includes(term) ||
          normalizeId(route.name).includes(term) ||
          normalizeId(route.district).includes(term) ||
          normalizeId(route.description).includes(term);

        const matchesDistrict =
          !districtFilter ||
          normalizeId(route.district) === districtFilter;

        const matchesDifficulty =
          difficultyFilter === null ||
          route.difficulty === difficultyFilter;

        return (
          matchesQuery &&
          matchesDistrict &&
          matchesDifficulty
        );
      })
      .map(clone);
  }

  update(id, changes) {
    this.assertActive();

    const key = normalizeId(id);
    const existing = this.routes.get(key);

    if (!existing) {
      return null;
    }

    if (!changes || typeof changes !== "object") {
      throw new TypeError("Route changes must be an object.");
    }

    const updatedId = normalizeId(changes.id ?? key);

    if (updatedId !== key) {
      throw new Error("Route IDs cannot be changed.");
    }

    const updated = this.normalizeRoute({
      ...existing,
      ...changes,
      id: key,
    });

    this.routes.set(key, updated);
    this.revision += 1;

    return clone(updated);
  }

  remove(id) {
    this.assertActive();

    const removed = this.routes.delete(normalizeId(id));

    if (removed) {
      this.revision += 1;
    }

    return removed;
  }

  replaceAll(routes) {
    this.assertActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be provided as an array.");
    }

    const next = new Map();

    for (const route of routes) {
      const normalized = this.normalizeRoute(route);

      if (next.has(normalized.id)) {
        throw new Error(
          `Duplicate route "${normalized.id}" in replacement data.`,
        );
      }

      next.set(normalized.id, normalized);
    }

    if (next.size === 0) {
      throw new Error("The route database cannot be empty.");
    }

    this.routes = next;
    this.revision += 1;

    return this.getAll();
  }

  exportData() {
    this.assertActive();

    return {
      version: DATABASE_VERSION,
      revision: this.revision,
      exportedAt: new Date().toISOString(),
      routes: this.getAll(),
    };
  }

  importData(data, { merge = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.routes)) {
      throw new TypeError("Invalid route database export.");
    }

    if (
      data.version !== undefined &&
      Number(data.version) > DATABASE_VERSION
    ) {
      throw new Error(
        `Unsupported route database version: ${data.version}`,
      );
    }

    const imported = data.routes.map((route) =>
      this.normalizeRoute(route),
    );

    const ids = new Set();

    for (const route of imported) {
      if (ids.has(route.id)) {
        throw new Error(
          `Duplicate route "${route.id}" in imported data.`,
        );
      }

      ids.add(route.id);
    }

    if (!merge && imported.length === 0) {
      throw new Error("Cannot import an empty route database.");
    }

    const next = merge ? new Map(this.routes) : new Map();

    for (const route of imported) {
      next.set(route.id, route);
    }

    if (next.size === 0) {
      throw new Error("The route database cannot be empty.");
    }

    this.routes = next;
    this.revision += 1;

    return this.getAll();
  }

  save() {
    this.assertActive();

    if (!this.storage || typeof this.storage.setItem !== "function") {
      return {
        success: false,
        reason: "storage_unavailable",
      };
    }

    try {
      const payload = JSON.stringify(this.exportData());

      this.storage.setItem(this.storageKey, payload);

      return {
        success: true,
        revision: this.revision,
        count: this.routes.size,
      };
    } catch (error) {
      this.logError("Failed to save route database.", error);

      return {
        success: false,
        reason: "storage_error",
        error,
      };
    }
  }

  load() {
    this.assertActive();

    if (!this.storage || typeof this.storage.getItem !== "function") {
      return {
        success: false,
        reason: "storage_unavailable",
      };
    }

    let raw;

    try {
      raw = this.storage.getItem(this.storageKey);
    } catch (error) {
      this.logError("Failed to read route database storage.", error);

      return {
        success: false,
        reason: "storage_error",
        error,
      };
    }

    if (!raw) {
      return {
        success: false,
        reason: "not_found",
      };
    }

    try {
      const data = JSON.parse(raw);

      if (!data || !Array.isArray(data.routes)) {
        throw new Error("Stored route database has an invalid format.");
      }

      const next = new Map();

      for (const route of data.routes) {
        const normalized = this.normalizeRoute(route);

        if (next.has(normalized.id)) {
          throw new Error(
            `Duplicate stored route "${normalized.id}".`,
          );
        }

        next.set(normalized.id, normalized);
      }

      if (next.size === 0) {
        throw new Error("Stored route database is empty.");
      }

      this.routes = next;
      this.revision = Math.max(
        this.revision,
        Number(data.revision) || 0,
      );

      return {
        success: true,
        revision: this.revision,
        count: this.routes.size,
      };
    } catch (error) {
      this.logError("Failed to load route database.", error);

      return {
        success: false,
        reason: "invalid_data",
        error,
      };
    }
  }

  resetToDefaults() {
    this.assertActive();

    const defaults = DEFAULT_ROUTES.map((route) =>
      this.normalizeRoute(route),
    );

    this.routes = new Map(
      defaults.map((route) => [route.id, route]),
    );

    this.revision += 1;

    return this.getAll();
  }

  getStats() {
    this.assertActive();

    const routes = [...this.routes.values()];
    const totalLength = routes.reduce(
      (sum, route) => sum + route.length,
      0,
    );

    const difficultyCounts = {};

    for (const route of routes) {
      const key = String(route.difficulty);
      difficultyCounts[key] = (difficultyCounts[key] ?? 0) + 1;
    }

    return {
      count: routes.length,
      totalLength,
      averageLength:
        routes.length > 0 ? totalLength / routes.length : 0,
      averageDifficulty:
        routes.length > 0
          ? routes.reduce((sum, route) => sum + route.difficulty, 0) /
            routes.length
          : 0,
      districts: [...new Set(routes.map((route) => route.district))],
      difficultyCounts,
      revision: this.revision,
    };
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(message, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteDatabase has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.routes.clear();
    this.storage = null;
    this.logger = null;
    this.disposed = true;
  }
}

export { DATABASE_VERSION, STORAGE_KEY };

export default RouteDatabase;