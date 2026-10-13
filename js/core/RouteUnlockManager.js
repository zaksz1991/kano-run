import { DEFAULT_ROUTES } from "./RouteManager.js";

const STORAGE_KEY = "kanoRun.routeUnlocks.v1";

const DEFAULT_UNLOCKS = {
  citycenter: true,
};

export class RouteUnlockManager {
  constructor({
    routes = DEFAULT_ROUTES,
    gameState = null,
    storage = null,
    storageKey = STORAGE_KEY,
    startingLevel = 1,
    startingRoutes = ["citycenter"],
  } = {}) {
    this.routes = new Map();
    this.gameState = gameState;
    this.storage = storage ?? this.getDefaultStorage();
    this.storageKey = storageKey;
    this.playerLevel = Math.max(1, Number(startingLevel) || 1);
    this.unlockedRoutes = new Set(startingRoutes);
    this.listeners = new Set();
    this.disposed = false;

    this.registerRoutes(routes);
    this.load();
    this.unlockRoutesForLevel(this.playerLevel, { silent: true });
  }

  getDefaultStorage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  registerRoutes(routes = []) {
    this.assertActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("Routes must be an array.");
    }

    for (const route of routes) {
      if (!route || !route.id) {
        continue;
      }

      const id = String(route.id);

      this.routes.set(id, {
        id,
        name: String(route.name ?? id),
        unlockLevel: Math.max(
          1,
          Math.floor(Number(route.unlockLevel) || 1),
        ),
        difficulty: Math.min(
          5,
          Math.max(1, Number(route.difficulty) || 1),
        ),
      });
    }
  }

  registerRoute(route) {
    this.assertActive();

    if (!route || !route.id) {
      throw new TypeError("A route with an id is required.");
    }

    const id = String(route.id);

    if (this.routes.has(id)) {
      throw new Error(`Route "${id}" is already registered.`);
    }

    this.routes.set(id, {
      id,
      name: String(route.name ?? id),
      unlockLevel: Math.max(
        1,
        Math.floor(Number(route.unlockLevel) || 1),
      ),
      difficulty: Math.min(
        5,
        Math.max(1, Number(route.difficulty) || 1),
      ),
    });

    const unlocked = this.unlockRoutesForLevel(this.playerLevel);

    return {
      route: this.getRoute(id),
      unlocked,
    };
  }

  getRoute(routeId) {
    const route = this.routes.get(String(routeId));
    return route ? { ...route } : null;
  }

  setPlayerLevel(level, { silent = false } = {}) {
    this.assertActive();

    const nextLevel = Math.max(
      1,
      Math.floor(Number(level) || 1),
    );

    const previousLevel = this.playerLevel;
    this.playerLevel = nextLevel;

    const newlyUnlocked = this.unlockRoutesForLevel(nextLevel, {
      silent: true,
    });

    if (!silent && previousLevel !== nextLevel) {
      this.emit("level:changed", {
        previousLevel,
        level: nextLevel,
        newlyUnlocked: [...newlyUnlocked],
      });
    }

    return {
      previousLevel,
      level: nextLevel,
      newlyUnlocked,
    };
  }

  syncPlayerLevel() {
    this.assertActive();

    const state = this.gameState;

    if (!state) {
      return this.playerLevel;
    }

    let level = null;

    if (typeof state.getLevel === "function") {
      level = state.getLevel();
    } else if (typeof state.get === "function") {
      level =
        state.get("player.level") ??
        state.get("progression.level") ??
        state.get("level");
    } else {
      level =
        state.player?.level ??
        state.progression?.level ??
        state.level;
    }

    if (Number.isFinite(Number(level))) {
      this.setPlayerLevel(Number(level));
    }

    return this.playerLevel;
  }

  unlockRoutesForLevel(level = this.playerLevel, { silent = false } = {}) {
    this.assertActive();

    const currentLevel = Math.max(
      1,
      Math.floor(Number(level) || 1),
    );

    const newlyUnlocked = [];

    for (const route of this.routes.values()) {
      if (
        route.unlockLevel <= currentLevel &&
        !this.unlockedRoutes.has(route.id)
      ) {
        this.unlockedRoutes.add(route.id);
        newlyUnlocked.push(route.id);
      }
    }

    if (newlyUnlocked.length > 0) {
      const details = newlyUnlocked.map((id) => this.getRoute(id));

      if (!silent) {
        this.emit("routes:unlocked", {
          routeIds: [...newlyUnlocked],
          routes: details,
          playerLevel: currentLevel,
        });
      }

      this.save();
    }

    return newlyUnlocked;
  }

  unlockRoute(routeId, { force = false, silent = false } = {}) {
    this.assertActive();

    const id = String(routeId);
    const route = this.routes.get(id);

    if (!route) {
      return {
        success: false,
        reason: "route_not_found",
        routeId: id,
      };
    }

    if (this.unlockedRoutes.has(id)) {
      return {
        success: true,
        alreadyUnlocked: true,
        route: { ...route },
      };
    }

    if (!force && this.playerLevel < route.unlockLevel) {
      return {
        success: false,
        reason: "level_too_low",
        requiredLevel: route.unlockLevel,
        playerLevel: this.playerLevel,
      };
    }

    this.unlockedRoutes.add(id);

    if (!silent) {
      this.emit("route:unlocked", {
        routeId: id,
        route: { ...route },
        playerLevel: this.playerLevel,
      });
    }

    this.save();

    return {
      success: true,
      alreadyUnlocked: false,
      route: { ...route },
    };
  }

  lockRoute(routeId, { silent = false } = {}) {
    this.assertActive();

    const id = String(routeId);

    if (!this.routes.has(id)) {
      return false;
    }

    if (id === "citycenter") {
      return false;
    }

    const removed = this.unlockedRoutes.delete(id);

    if (removed) {
      if (!silent) {
        this.emit("route:locked", {
          routeId: id,
          route: this.getRoute(id),
        });
      }

      this.save();
    }

    return removed;
  }

  isUnlocked(routeId) {
    this.assertActive();

    return this.unlockedRoutes.has(String(routeId));
  }

  canUnlock(routeId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    if (!route) {
      return {
        allowed: false,
        reason: "route_not_found",
      };
    }

    if (this.unlockedRoutes.has(route.id)) {
      return {
        allowed: true,
        alreadyUnlocked: true,
        route: { ...route },
      };
    }

    if (this.playerLevel < route.unlockLevel) {
      return {
        allowed: false,
        reason: "level_too_low",
        requiredLevel: route.unlockLevel,
        playerLevel: this.playerLevel,
        levelsRemaining: route.unlockLevel - this.playerLevel,
      };
    }

    return {
      allowed: true,
      alreadyUnlocked: false,
      route: { ...route },
    };
  }

  getUnlockedRoutes() {
    this.assertActive();

    return [...this.unlockedRoutes]
      .map((id) => this.getRoute(id))
      .filter(Boolean);
  }

  getLockedRoutes() {
    this.assertActive();

    return [...this.routes.values()]
      .filter((route) => !this.unlockedRoutes.has(route.id))
      .map((route) => ({
        ...route,
        levelsRemaining: Math.max(
          0,
          route.unlockLevel - this.playerLevel,
        ),
      }));
  }

  getNextUnlock() {
    this.assertActive();

    const next = [...this.routes.values()]
      .filter((route) => !this.unlockedRoutes.has(route.id))
      .sort((a, b) => {
        if (a.unlockLevel !== b.unlockLevel) {
          return a.unlockLevel - b.unlockLevel;
        }

        return a.name.localeCompare(b.name);
      })[0];

    if (!next) {
      return null;
    }

    return {
      ...next,
      levelsRemaining: Math.max(
        0,
        next.unlockLevel - this.playerLevel,
      ),
    };
  }

  getUnlockProgress() {
    this.assertActive();

    const next = this.getNextUnlock();

    if (!next) {
      return {
        complete: true,
        playerLevel: this.playerLevel,
        progress: 1,
        nextRoute: null,
      };
    }

    const previousUnlockLevel = Math.max(
      1,
      ...[...this.routes.values()]
        .filter(
          (route) =>
            route.unlockLevel < next.unlockLevel &&
            this.unlockedRoutes.has(route.id),
        )
        .map((route) => route.unlockLevel),
    );

    const range = Math.max(
      1,
      next.unlockLevel - previousUnlockLevel,
    );

    const progress = Math.max(
      0,
      Math.min(
        1,
        (this.playerLevel - previousUnlockLevel) / range,
      ),
    );

    return {
      complete: false,
      playerLevel: this.playerLevel,
      requiredLevel: next.unlockLevel,
      levelsRemaining: next.levelsRemaining,
      progress,
      nextRoute: next,
    };
  }

  getSnapshot() {
    this.assertActive();

    return {
      version: 1,
      playerLevel: this.playerLevel,
      unlockedRoutes: [...this.unlockedRoutes],
      savedAt: new Date().toISOString(),
    };
  }

  restoreSnapshot(snapshot, { silent = false } = {}) {
    this.assertActive();

    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }

    if (Array.isArray(snapshot.unlockedRoutes)) {
      const validRoutes = new Set();

      for (const id of snapshot.unlockedRoutes) {
        const routeId = String(id);

        if (this.routes.has(routeId)) {
          validRoutes.add(routeId);
        }
      }

      validRoutes.add("citycenter");
      this.unlockedRoutes = validRoutes;
    }

    if (Number.isFinite(Number(snapshot.playerLevel))) {
      this.playerLevel = Math.max(
        1,
        Math.floor(Number(snapshot.playerLevel)),
      );
    }

    this.unlockRoutesForLevel(this.playerLevel, { silent: true });

    if (!silent) {
      this.emit("route-unlocks:restored", this.getSnapshot());
    }

    return true;
  }

  save() {
    this.assertActive();

    if (!this.storage || typeof this.storage.setItem !== "function") {
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(this.getSnapshot()),
      );

      return true;
    } catch (error) {
      this.logError("Could not save route unlocks.", error);
      return false;
    }
  }

  load() {
    this.assertActive();

    if (!this.storage || typeof this.storage.getItem !== "function") {
      return false;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return false;
      }

      const snapshot = JSON.parse(raw);

      return this.restoreSnapshot(snapshot, { silent: true });
    } catch (error) {
      this.logError("Could not load route unlocks.", error);
      return false;
    }
  }

  reset({ silent = false } = {}) {
    this.assertActive();

    this.playerLevel = 1;
    this.unlockedRoutes = new Set(
      Object.keys(DEFAULT_UNLOCKS).filter((id) =>
        this.routes.has(id),
      ),
    );

    this.unlockRoutesForLevel(1, { silent: true });

    if (!silent) {
      this.emit("route-unlocks:reset", this.getSnapshot());
    }

    this.save();

    return this.getSnapshot();
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(type, payload = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      ...payload,
    };

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logError("Route unlock listener failed.", error);
      }
    }
  }

  logError(message, error) {
    if (typeof console !== "undefined" && console.error) {
      console.error(`[RouteUnlockManager] ${message}`, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteUnlockManager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.listeners.clear();
    this.routes.clear();
    this.unlockedRoutes.clear();
    this.gameState = null;
    this.storage = null;
    this.disposed = true;
  }
}

export default RouteUnlockManager;