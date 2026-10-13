import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = {
  ROUTE_SELECTED: "route:selected",
  ROUTE_CLEARED: "route:cleared",
  ROUTE_SELECTION_CHANGED: "route:selection-changed",
};

export class RouteSelector {
  constructor({
    routeManager,
    routeDatabase,
    routeUnlockManager,
    eventBus = EventBus,
    logger = Logger,
    initialRouteId = "citycenter",
  } = {}) {
    if (!routeManager) {
      throw new Error("RouteSelector requires a routeManager.");
    }

    this.routeManager = routeManager;
    this.routeDatabase = routeDatabase;
    this.routeUnlockManager = routeUnlockManager;
    this.eventBus = eventBus;
    this.logger = logger;

    this.selectedRouteId = null;
    this.filters = {
      search: "",
      district: "all",
      difficulty: "all",
      unlockedOnly: false,
    };

    this.routes = [];
    this.disposed = false;

    this.refreshRoutes();

    if (initialRouteId) {
      this.selectRoute(initialRouteId, { silent: true });
    }
  }

  refreshRoutes() {
    this.assertActive();

    const source = this.getRouteSource();

    this.routes = source
      .filter((route) => route && route.id)
      .map((route) => ({ ...route }));

    if (
      this.selectedRouteId &&
      !this.routes.some((route) => route.id === this.selectedRouteId)
    ) {
      this.selectedRouteId = null;
    }

    return this.getRoutes();
  }

  getRouteSource() {
    if (
      this.routeDatabase &&
      typeof this.routeDatabase.getAllRoutes === "function"
    ) {
      return this.routeDatabase.getAllRoutes();
    }

    if (
      this.routeDatabase &&
      typeof this.routeDatabase.getRoutes === "function"
    ) {
      return this.routeDatabase.getRoutes();
    }

    if (typeof this.routeManager.getRoutes === "function") {
      return this.routeManager.getRoutes();
    }

    if (Array.isArray(this.routeManager.routes)) {
      return this.routeManager.routes;
    }

    return [];
  }

  getRoutes() {
    this.assertActive();
    return this.routes.map((route) => ({ ...route }));
  }

  getRoute(routeId) {
    this.assertActive();

    const route = this.routes.find((item) => item.id === routeId);
    return route ? { ...route } : null;
  }

  getSelectedRoute() {
    return this.getRoute(this.selectedRouteId);
  }

  getSelectedRouteId() {
    return this.selectedRouteId;
  }

  selectRoute(routeId, { silent = false, allowLocked = false } = {}) {
    this.assertActive();

    if (!routeId) {
      return this.clearSelection({ silent });
    }

    const route = this.routes.find((item) => item.id === routeId);

    if (!route) {
      this.logger?.warn?.(`RouteSelector: route "${routeId}" was not found.`);
      return {
        success: false,
        reason: "route_not_found",
        routeId,
      };
    }

    if (!allowLocked && !this.isRouteUnlocked(route)) {
      const result = {
        success: false,
        reason: "route_locked",
        routeId,
        route: { ...route },
      };

      this.emit("route:locked", result);
      return result;
    }

    const previousRouteId = this.selectedRouteId;
    this.selectedRouteId = route.id;

    const result = {
      success: true,
      route: { ...route },
      routeId: route.id,
      previousRouteId,
    };

    if (!silent) {
      this.emit(EVENTS.ROUTE_SELECTED, result);

      if (previousRouteId !== route.id) {
        this.emit(EVENTS.ROUTE_SELECTION_CHANGED, result);
      }
    }

    return result;
  }

  clearSelection({ silent = false } = {}) {
    this.assertActive();

    const previousRouteId = this.selectedRouteId;
    this.selectedRouteId = null;

    const result = {
      success: true,
      previousRouteId,
    };

    if (!silent && previousRouteId !== null) {
      this.emit(EVENTS.ROUTE_CLEARED, result);
      this.emit(EVENTS.ROUTE_SELECTION_CHANGED, {
        ...result,
        routeId: null,
        route: null,
      });
    }

    return result;
  }

  isRouteUnlocked(routeOrId) {
    const route =
      typeof routeOrId === "string"
        ? this.routes.find((item) => item.id === routeOrId)
        : routeOrId;

    if (!route) return false;

    if (route.unlocked === true || route.isUnlocked === true) {
      return true;
    }

    if (route.locked === true || route.isLocked === true) {
      return false;
    }

    if (this.routeUnlockManager) {
      if (
        typeof this.routeUnlockManager.isRouteUnlocked === "function"
      ) {
        return Boolean(
          this.routeUnlockManager.isRouteUnlocked(route.id),
        );
      }

      if (typeof this.routeUnlockManager.isUnlocked === "function") {
        return Boolean(this.routeUnlockManager.isUnlocked(route.id));
      }

      if (typeof this.routeUnlockManager.canAccessRoute === "function") {
        return Boolean(
          this.routeUnlockManager.canAccessRoute(route.id),
        );
      }
    }

    const requiredLevel = Number(
      route.requiredLevel ?? route.unlockLevel ?? 1,
    );

    return requiredLevel <= 1;
  }

  setSearch(search = "") {
    this.assertActive();
    this.filters.search = String(search).trim().toLowerCase();
    return this.getFilteredRoutes();
  }

  setDistrict(district = "all") {
    this.assertActive();
    this.filters.district = String(district || "all").toLowerCase();
    return this.getFilteredRoutes();
  }

  setDifficulty(difficulty = "all") {
    this.assertActive();
    this.filters.difficulty = String(difficulty || "all").toLowerCase();
    return this.getFilteredRoutes();
  }

  setUnlockedOnly(enabled = true) {
    this.assertActive();
    this.filters.unlockedOnly = Boolean(enabled);
    return this.getFilteredRoutes();
  }

  setFilters(filters = {}) {
    this.assertActive();

    if (Object.hasOwn(filters, "search")) {
      this.filters.search = String(filters.search ?? "")
        .trim()
        .toLowerCase();
    }

    if (Object.hasOwn(filters, "district")) {
      this.filters.district = String(filters.district || "all").toLowerCase();
    }

    if (Object.hasOwn(filters, "difficulty")) {
      this.filters.difficulty = String(filters.difficulty || "all")
        .toLowerCase();
    }

    if (Object.hasOwn(filters, "unlockedOnly")) {
      this.filters.unlockedOnly = Boolean(filters.unlockedOnly);
    }

    return this.getFilteredRoutes();
  }

  resetFilters() {
    this.assertActive();

    this.filters = {
      search: "",
      district: "all",
      difficulty: "all",
      unlockedOnly: false,
    };

    return this.getFilteredRoutes();
  }

  getFilters() {
    return { ...this.filters };
  }

  getFilteredRoutes() {
    this.assertActive();

    const { search, district, difficulty, unlockedOnly } = this.filters;

    return this.routes
      .filter((route) => {
        if (unlockedOnly && !this.isRouteUnlocked(route)) {
          return false;
        }

        if (district !== "all") {
          const routeDistrict = String(
            route.district ?? route.region ?? "unknown",
          ).toLowerCase();

          if (routeDistrict !== district) {
            return false;
          }
        }

        if (difficulty !== "all") {
          const routeDifficulty = String(
            route.difficulty ?? "normal",
          ).toLowerCase();

          if (routeDifficulty !== difficulty) {
            return false;
          }
        }

        if (search) {
          const searchableText = [
            route.id,
            route.name,
            route.title,
            route.description,
            route.district,
            route.region,
            route.startPoint,
            route.endPoint,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!searchableText.includes(search)) {
            return false;
          }
        }

        return true;
      })
      .map((route) => ({
        ...route,
        unlocked: this.isRouteUnlocked(route),
        selected: route.id === this.selectedRouteId,
      }));
  }

  getDistricts() {
    this.assertActive();

    const districts = new Set(
      this.routes
        .map((route) => route.district ?? route.region)
        .filter(Boolean)
        .map((value) => String(value)),
    );

    return [...districts].sort((a, b) => a.localeCompare(b));
  }

  getDifficulties() {
    this.assertActive();

    const difficulties = new Set(
      this.routes
        .map((route) => String(route.difficulty ?? "normal"))
        .filter(Boolean),
    );

    return [...difficulties].sort((a, b) => a.localeCompare(b));
  }

  getSelectionSummary() {
    this.assertActive();

    const route = this.getSelectedRoute();

    return {
      selectedRouteId: this.selectedRouteId,
      selectedRoute: route,
      totalRoutes: this.routes.length,
      unlockedRoutes: this.routes.filter((item) =>
        this.isRouteUnlocked(item),
      ).length,
      filteredRoutes: this.getFilteredRoutes().length,
    };
  }

  startSelectedRoute() {
    this.assertActive();

    if (!this.selectedRouteId) {
      return {
        success: false,
        reason: "no_route_selected",
      };
    }

    const route = this.getRoute(this.selectedRouteId);

    if (!route) {
      return {
        success: false,
        reason: "route_not_found",
      };
    }

    if (!this.isRouteUnlocked(route)) {
      return {
        success: false,
        reason: "route_locked",
        routeId: route.id,
      };
    }

    if (typeof this.routeManager.startRoute === "function") {
      const result = this.routeManager.startRoute(route.id);

      return {
        success: result !== false,
        route: { ...route },
        result,
      };
    }

    if (typeof this.routeManager.selectRoute === "function") {
      const result = this.routeManager.selectRoute(route.id);

      return {
        success: result !== false,
        route: { ...route },
        result,
      };
    }

    return {
      success: false,
      reason: "route_manager_cannot_start_route",
      routeId: route.id,
    };
  }

  emit(eventName, payload) {
    if (!this.eventBus) return;

    if (typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
      return;
    }

    if (typeof this.eventBus.publish === "function") {
      this.eventBus.publish(eventName, payload);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteSelector has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.routes.length = 0;
    this.selectedRouteId = null;
    this.disposed = true;
  }
}

export default RouteSelector;