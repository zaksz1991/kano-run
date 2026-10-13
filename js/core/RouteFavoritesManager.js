import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const STORAGE_KEY = "kanoRunRouteFavorites";
const STORAGE_VERSION = 1;

export class RouteFavoritesManager {
  constructor({
    saveManager = null,
    storage = globalThis.localStorage,
    eventBus = EventBus,
    logger = Logger,
    routeManager = null,
    routeDatabase = null,
    maxFavorites = 100,
  } = {}) {
    this.saveManager = saveManager;
    this.storage = storage;
    this.eventBus = eventBus;
    this.logger = logger;
    this.routeManager = routeManager;
    this.routeDatabase = routeDatabase;

    this.maxFavorites = Math.max(
      1,
      Math.floor(Number(maxFavorites) || 100),
    );

    this.favorites = new Map();
    this.disposed = false;

    this.load();
  }

  getAvailableRoutes() {
    let routes = [];

    if (
      typeof this.routeDatabase?.getAllRoutes === "function"
    ) {
      routes = this.routeDatabase.getAllRoutes();
    } else if (
      typeof this.routeDatabase?.getRoutes === "function"
    ) {
      routes = this.routeDatabase.getRoutes();
    } else if (
      typeof this.routeManager?.getRoutes === "function"
    ) {
      routes = this.routeManager.getRoutes();
    } else if (Array.isArray(this.routeManager?.routes)) {
      routes = this.routeManager.routes;
    }

    return Array.isArray(routes) ? routes : [];
  }

  hasRoute(routeId) {
    return this.getAvailableRoutes().some(
      (route) => route?.id === routeId,
    );
  }

  add(routeId, metadata = {}) {
    this.assertActive();

    if (routeId == null || routeId === "") {
      return {
        success: false,
        reason: "invalid_route_id",
      };
    }

    if (this.favorites.has(routeId)) {
      return {
        success: true,
        alreadyFavorite: true,
        routeId,
      };
    }

    if (this.favorites.size >= this.maxFavorites) {
      return {
        success: false,
        reason: "favorites_limit_reached",
        limit: this.maxFavorites,
      };
    }

    const route = this.getAvailableRoutes().find(
      (item) => item?.id === routeId,
    );

    const favorite = {
      routeId,
      name: String(
        metadata.name ??
          route?.name ??
          route?.title ??
          routeId,
      ),
      addedAt: Date.now(),
      notes: String(metadata.notes ?? "").slice(0, 500),
    };

    this.favorites.set(routeId, favorite);
    this.persist();

    this.emit("route-favorites:added", {
      routeId,
      favorite: { ...favorite },
    });

    return {
      success: true,
      routeId,
      favorite: { ...favorite },
    };
  }

  remove(routeId) {
    this.assertActive();

    const favorite = this.favorites.get(routeId);

    if (!favorite) {
      return {
        success: false,
        reason: "not_favorite",
        routeId,
      };
    }

    this.favorites.delete(routeId);
    this.persist();

    this.emit("route-favorites:removed", {
      routeId,
      favorite: { ...favorite },
    });

    return {
      success: true,
      routeId,
    };
  }

  toggle(routeId, metadata = {}) {
    this.assertActive();

    if (this.favorites.has(routeId)) {
      return this.remove(routeId);
    }

    return this.add(routeId, metadata);
  }

  isFavorite(routeId) {
    this.assertActive();
    return this.favorites.has(routeId);
  }

  getFavorite(routeId) {
    this.assertActive();

    const favorite = this.favorites.get(routeId);

    return favorite ? { ...favorite } : null;
  }

  getFavoriteIds() {
    this.assertActive();
    return [...this.favorites.keys()];
  }

  getFavorites() {
    this.assertActive();

    const routes = this.getAvailableRoutes();
    const routeMap = new Map(
      routes
        .filter((route) => route?.id != null)
        .map((route) => [route.id, route]),
    );

    return [...this.favorites.values()].map((favorite) => {
      const route = routeMap.get(favorite.routeId) ?? null;

      return {
        ...favorite,
        route: route ? { ...route } : null,
        routeAvailable: Boolean(route),
      };
    });
  }

  getCount() {
    this.assertActive();
    return this.favorites.size;
  }

  updateNotes(routeId, notes) {
    this.assertActive();

    const favorite = this.favorites.get(routeId);

    if (!favorite) {
      return {
        success: false,
        reason: "not_favorite",
      };
    }

    favorite.notes = String(notes ?? "").slice(0, 500);
    this.favorites.set(routeId, favorite);

    this.persist();

    this.emit("route-favorites:updated", {
      routeId,
      favorite: { ...favorite },
    });

    return {
      success: true,
      favorite: { ...favorite },
    };
  }

  clear() {
    this.assertActive();

    const previousCount = this.favorites.size;

    this.favorites.clear();
    this.persist();

    this.emit("route-favorites:cleared", {
      previousCount,
    });

    return {
      success: true,
      removedCount: previousCount,
    };
  }

  exportData() {
    this.assertActive();

    return {
      version: STORAGE_VERSION,
      exportedAt: Date.now(),
      favorites: [...this.favorites.values()].map(
        (favorite) => ({ ...favorite }),
      ),
    };
  }

  importData(data, { merge = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.favorites)) {
      return {
        success: false,
        reason: "invalid_import_data",
      };
    }

    const imported = new Map();

    for (const item of data.favorites) {
      if (
        !item ||
        (typeof item.routeId !== "string" &&
          typeof item.routeId !== "number")
      ) {
        continue;
      }

      imported.set(item.routeId, {
        routeId: item.routeId,
        name: String(item.name ?? item.routeId),
        addedAt: Number(item.addedAt) || Date.now(),
        notes: String(item.notes ?? "").slice(0, 500),
      });
    }

    if (!merge) {
      this.favorites.clear();
    }

    for (const [routeId, favorite] of imported) {
      if (
        !this.favorites.has(routeId) &&
        this.favorites.size >= this.maxFavorites
      ) {
        break;
      }

      this.favorites.set(routeId, favorite);
    }

    this.persist();

    this.emit("route-favorites:imported", {
      count: this.favorites.size,
    });

    return {
      success: true,
      count: this.favorites.size,
    };
  }

  load() {
    this.assertActive();

    try {
      const raw = this.storage?.getItem(STORAGE_KEY);

      if (!raw) {
        this.loadFromSaveManager();
        return false;
      }

      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        !Array.isArray(parsed.favorites) ||
        parsed.version !== STORAGE_VERSION
      ) {
        this.logger?.warn?.(
          "RouteFavoritesManager: saved favorites have an unsupported format.",
        );

        this.loadFromSaveManager();
        return false;
      }

      this.favorites.clear();

      for (const item of parsed.favorites) {
        if (
          !item ||
          (typeof item.routeId !== "string" &&
            typeof item.routeId !== "number")
        ) {
          continue;
        }

        if (this.favorites.size >= this.maxFavorites) break;

        this.favorites.set(item.routeId, {
          routeId: item.routeId,
          name: String(item.name ?? item.routeId),
          addedAt: Number(item.addedAt) || Date.now(),
          notes: String(item.notes ?? "").slice(0, 500),
        });
      }

      return true;
    } catch (error) {
      this.logger?.warn?.(
        "RouteFavoritesManager: could not load local favorites.",
        error,
      );

      this.loadFromSaveManager();
      return false;
    }
  }

  loadFromSaveManager() {
    try {
      if (typeof this.saveManager?.get === "function") {
        const saved = this.saveManager.get(STORAGE_KEY);

        if (saved && Array.isArray(saved.favorites)) {
          this.importData(saved);
        }
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteFavoritesManager: save-manager fallback failed.",
        error,
      );
    }
  }

  persist() {
    const data = this.exportData();
    let savedLocally = false;

    try {
      if (this.storage) {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
        savedLocally = true;
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteFavoritesManager: local storage save failed.",
        error,
      );
    }

    try {
      if (typeof this.saveManager?.set === "function") {
        this.saveManager.set(STORAGE_KEY, data);
      } else if (
        typeof this.saveManager?.save === "function"
      ) {
        this.saveManager.save(STORAGE_KEY, data);
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteFavoritesManager: save-manager persistence failed.",
        error,
      );
    }

    return savedLocally;
  }

  emit(eventName, payload) {
    if (typeof this.eventBus?.emit === "function") {
      this.eventBus.emit(eventName, payload);
    } else if (typeof this.eventBus?.publish === "function") {
      this.eventBus.publish(eventName, payload);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteFavoritesManager has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.favorites.clear();
    this.saveManager = null;
    this.routeManager = null;
    this.routeDatabase = null;
    this.eventBus = null;
    this.logger = null;
    this.storage = null;
    this.disposed = true;
  }
}

export default RouteFavoritesManager;