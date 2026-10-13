import { KANO_DISTRICTS } from "./RouteSystem.js";

const ROUTE_TEMPLATES = Object.freeze([
  {
    id: "quick_trip",
    name: "Quick Trip",
    minStops: 1,
    maxStops: 2,
    minDistance: 1,
    maxDistance: 5,
    fareMultiplier: 1,
    difficulty: 1,
  },
  {
    id: "city_run",
    name: "City Run",
    minStops: 2,
    maxStops: 4,
    minDistance: 3,
    maxDistance: 10,
    fareMultiplier: 1.2,
    difficulty: 2,
  },
  {
    id: "cross_city",
    name: "Cross-City Journey",
    minStops: 3,
    maxStops: 5,
    minDistance: 7,
    maxDistance: 18,
    fareMultiplier: 1.5,
    difficulty: 3,
  },
  {
    id: "long_distance",
    name: "Long-Distance Run",
    minStops: 4,
    maxStops: 7,
    minDistance: 12,
    maxDistance: 25,
    fareMultiplier: 1.8,
    difficulty: 4,
  },
]);

const ROUTE_NAMES = Object.freeze([
  "Market Express",
  "Northern Circuit",
  "City Connector",
  "Commercial Run",
  "Heritage Trail",
  "Sunset Route",
  "Daily Hustle",
  "Capital Circuit",
  "Neighbourhood Link",
  "Kano Discovery",
]);

export default class RouteGenerationSystem {
  constructor({
    routeSystem = null,
    gameState = null,
    eventBus = null,
    random = Math.random,
  } = {}) {
    this.routeSystem = routeSystem;
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.random = random;

    this.routes = new Map();
    this.activeRouteId = null;
    this.completedRouteIds = new Set();
    this.nextRouteNumber = 1;
  }

  generateRoute(options = {}) {
    const template = this.chooseTemplate(options.difficulty);
    const districts = this.getDistricts();

    if (districts.length < 2) {
      throw new Error(
        "RouteGenerationSystem requires at least two Kano districts."
      );
    }

    const stopsCount = this.randomInt(
      template.minStops,
      Math.min(template.maxStops, districts.length - 1)
    );

    const stops = this.chooseDistricts(districts, stopsCount);

    const start = stops[0];
    const destination = stops[stops.length - 1];

    const route = {
      id: `route_${this.nextRouteNumber++}_${Date.now()}`,
      name: this.createRouteName(start, destination),
      templateId: template.id,
      templateName: template.name,
      start,
      destination,
      stops,
      distance: this.randomInt(
        template.minDistance,
        template.maxDistance
      ),
      fareMultiplier: template.fareMultiplier,
      difficulty: template.difficulty,
      estimatedMinutes: 3 + template.difficulty * 2,
      baseFare: this.calculateBaseFare(
        template,
        stops.length
      ),
      rewardXP: 20 + template.difficulty * 15,
      status: "available",
      progress: 0,
      createdAt: Date.now(),
      completedAt: null,
    };

    this.routes.set(route.id, route);

    this.emit("route:generated", this.clone(route));

    return this.clone(route);
  }

  generateRoutes(count = 5, options = {}) {
    const total = Math.max(1, Math.min(20, Math.floor(count)));
    const generated = [];

    for (let i = 0; i < total; i += 1) {
      generated.push(this.generateRoute(options));
    }

    this.emit("routes:generated", {
      count: generated.length,
      routes: generated.map((route) => this.clone(route)),
    });

    return generated;
  }

  chooseTemplate(difficulty = null) {
    const candidates = difficulty == null
      ? ROUTE_TEMPLATES
      : ROUTE_TEMPLATES.filter(
          (template) => template.difficulty === difficulty
        );

    const pool = candidates.length ? candidates : ROUTE_TEMPLATES;

    return pool[this.randomInt(0, pool.length - 1)];
  }

  getDistricts() {
    const configured =
      this.routeSystem?.getDistricts?.() ??
      this.routeSystem?.getAllDistricts?.() ??
      KANO_DISTRICTS;

    return configured
      .map((district) => {
        if (typeof district === "string") {
          return { id: district, name: district };
        }

        return {
          ...district,
          id: district.id ?? district.slug ?? district.name,
          name: district.name ?? district.title ?? district.id,
        };
      })
      .filter((district) => district.id && district.name);
  }

  chooseDistricts(districts, count) {
    const shuffled = [...districts];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = this.randomInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count).map((district) => ({
      id: district.id,
      name: district.name,
      coordinates: district.coordinates ?? null,
    }));
  }

  createRouteName(start, destination) {
    const prefix =
      ROUTE_NAMES[this.randomInt(0, ROUTE_NAMES.length - 1)];

    return `${prefix}: ${start.name} – ${destination.name}`;
  }

  calculateBaseFare(template, stopsCount) {
    return Math.round(
      (500 + template.difficulty * 250 + stopsCount * 100) *
      template.fareMultiplier
    );
  }

  startRoute(routeId) {
    const route = this.routes.get(routeId);

    if (!route) {
      return this.fail("route_not_found", "Route does not exist.");
    }

    if (route.status === "completed") {
      return this.fail(
        "route_completed",
        "This route has already been completed."
      );
    }

    if (this.activeRouteId) {
      const active = this.routes.get(this.activeRouteId);

      if (active && active.status === "active") {
        return this.fail(
          "route_already_active",
          "Finish or cancel the active route first."
        );
      }
    }

    route.status = "active";
    route.progress = 0;
    this.activeRouteId = routeId;

    this.emit("route:started", this.clone(route));

    return { ok: true, route: this.clone(route) };
  }

  updateProgress(progress) {
    if (!this.activeRouteId) {
      return null;
    }

    const route = this.routes.get(this.activeRouteId);

    if (!route || route.status !== "active") {
      return null;
    }

    route.progress = Math.max(
      0,
      Math.min(1, Number(progress) || 0)
    );

    this.emit("route:progress", {
      routeId: route.id,
      progress: route.progress,
    });

    if (route.progress >= 1) {
      return this.completeRoute(route.id);
    }

    return this.clone(route);
  }

  completeRoute(routeId = this.activeRouteId) {
    const route = this.routes.get(routeId);

    if (!route || route.status !== "active") {
      return this.fail(
        "route_not_active",
        "This route is not active."
      );
    }

    route.status = "completed";
    route.progress = 1;
    route.completedAt = Date.now();

    this.completedRouteIds.add(route.id);
    this.activeRouteId = null;

    const reward = {
      money: route.baseFare,
      xp: route.rewardXP,
    };

    this.emit("route:completed", {
      route: this.clone(route),
      reward,
    });

    return {
      ok: true,
      route: this.clone(route),
      reward,
    };
  }

  cancelActiveRoute() {
    if (!this.activeRouteId) {
      return {
        ok: false,
        code: "no_active_route",
        message: "There is no active route.",
      };
    }

    const route = this.routes.get(this.activeRouteId);

    if (route) {
      route.status = "cancelled";

      this.emit("route:cancelled", this.clone(route));
    }

    this.activeRouteId = null;

    return { ok: true };
  }

  getRoute(routeId) {
    const route = this.routes.get(routeId);

    return route ? this.clone(route) : null;
  }

  getAvailableRoutes() {
    return [...this.routes.values()]
      .filter((route) => route.status === "available")
      .map((route) => this.clone(route));
  }

  getCompletedRoutes() {
    return [...this.routes.values()]
      .filter((route) => route.status === "completed")
      .map((route) => this.clone(route));
  }

  getActiveRoute() {
    return this.activeRouteId
      ? this.getRoute(this.activeRouteId)
      : null;
  }

  getSnapshot() {
    return {
      activeRoute: this.getActiveRoute(),
      availableRoutes: this.getAvailableRoutes(),
      completedRoutes: this.getCompletedRoutes(),
      totalGenerated: this.routes.size,
      totalCompleted: this.completedRouteIds.size,
    };
  }

  randomInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  clone(value) {
    return structuredClone(value);
  }

  emit(eventName, payload) {
    this.eventBus?.emit?.(eventName, payload);
  }

  fail(code, message) {
    const result = { ok: false, code, message };

    this.emit("route:error", result);

    return result;
  }

  destroy() {
    this.routes.clear();
    this.completedRouteIds.clear();
    this.activeRouteId = null;
    this.eventBus = null;
    this.routeSystem = null;
    this.gameState = null;
  }
}

export { ROUTE_TEMPLATES, ROUTE_NAMES };