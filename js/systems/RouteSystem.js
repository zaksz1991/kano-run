const KANO_DISTRICTS = [
  {
    id: "citycenter",
    name: "Kano City Centre",
    description: "Heart of Kano — Emir Palace approaches.",
    level: 1,
    fareMultiplier: 1,
    trafficDensity: 0.85,
    roadWidth: 3,
    distance: 3500,
    landmarks: ["Kofar Mata", "Kurmi Market", "Emir's Palace"],
    roads: ["Bompai Road", "Murtala Mohammed Way"],
    unlockedByDefault: true,
    theme: "city",
  },
  {
    id: "sabongari",
    name: "Sabon Gari",
    description: "Busy commercial streets and crowded junctions.",
    level: 1,
    fareMultiplier: 1.15,
    trafficDensity: 0.95,
    roadWidth: 3,
    distance: 4200,
    landmarks: ["Sabon Gari Market", "Church Road"],
    roads: ["France Road", "New Road"],
    unlockedByDefault: true,
    theme: "market",
  },
  {
    id: "kurmi",
    name: "Kurmi Market",
    description: "Ancient market — dense crowds and keke queues.",
    level: 2,
    fareMultiplier: 1.2,
    trafficDensity: 0.92,
    roadWidth: 2.9,
    distance: 4000,
    landmarks: ["Kurmi Market", "Kofar Wambai"],
    roads: ["Market Road", "Old City Lane"],
    unlockedByDefault: true,
    theme: "market",
  },
  {
    id: "kantinkwari",
    name: "Kantin Kwari",
    description: "Textile hub — traders and heavy pedestrian traffic.",
    level: 2,
    fareMultiplier: 1.25,
    trafficDensity: 0.9,
    roadWidth: 3,
    distance: 4500,
    landmarks: ["Kantin Kwari Market", "Warehouse Row"],
    roads: ["Kwari Road", "Trader Avenue"],
    unlockedByDefault: true,
    theme: "market",
  },
  {
    id: "fagge",
    name: "Fagge",
    description: "Dense urban Fagge — frequent roadside pickups.",
    level: 3,
    fareMultiplier: 1.15,
    trafficDensity: 0.88,
    roadWidth: 3,
    distance: 4800,
    landmarks: ["Fagge Market", "Airport Road Junction"],
    roads: ["Airport Road", "Fagge Main"],
    theme: "city",
  },
  {
    id: "tarauni",
    name: "Tarauni",
    description: "Mixed residential and commercial traffic.",
    level: 3,
    fareMultiplier: 1.2,
    trafficDensity: 0.7,
    roadWidth: 3.3,
    distance: 5200,
    landmarks: ["Tarauni Market", "Court Road"],
    roads: ["Tarauni Road", "Hadejia Road"],
    theme: "city",
  },
  {
    id: "hotoro",
    name: "Hotoro",
    description: "Zoo Road corridor toward Hotoro.",
    level: 4,
    fareMultiplier: 1.25,
    trafficDensity: 0.75,
    roadWidth: 3.4,
    distance: 6000,
    landmarks: ["Hotoro North", "Zoo Road"],
    roads: ["Zoo Road", "Hotoro Link"],
    theme: "city",
  },
  {
    id: "bompai",
    name: "Bompai",
    description: "Industrial mix — trucks and worker shifts.",
    level: 4,
    fareMultiplier: 1.2,
    trafficDensity: 0.8,
    roadWidth: 3.2,
    distance: 5500,
    landmarks: ["Bompai Industrial", "Police Barracks"],
    roads: ["Bompai Road", "Independence Road"],
    theme: "industrial",
  },
  {
    id: "zooroad",
    name: "Zoo Road",
    description: "Long corridor — steady fares, faster traffic.",
    level: 5,
    fareMultiplier: 1.3,
    trafficDensity: 0.78,
    roadWidth: 3.5,
    distance: 7000,
    landmarks: ["Zoo Junction", "Silver Jubilee"],
    roads: ["Zoo Road", "Maiduguri Road"],
    theme: "city",
  },
  {
    id: "nassarawa",
    name: "Nassarawa",
    description: "GRA and offices — longer trips, better fares.",
    level: 5,
    fareMultiplier: 1.35,
    trafficDensity: 0.65,
    roadWidth: 3.4,
    distance: 6500,
    landmarks: ["Nassarawa GRA", "Government House"],
    roads: ["Lagos Street", "Aminu Kano Way"],
    theme: "city",
  },
  {
    id: "kofarwambai",
    name: "Kofar Wambai",
    description: "Gate area — markets and old-city approaches.",
    level: 6,
    fareMultiplier: 1.2,
    trafficDensity: 0.85,
    roadWidth: 2.9,
    distance: 4300,
    landmarks: ["Kofar Wambai Gate", "Kurmi edge"],
    roads: ["Wambai Road", "City Wall Road"],
    theme: "market",
  },
];

const DEFAULT_ROUTE = "citycenter";

export default class RouteSystem {
  constructor({
    gameState,
    eventBus = null,
    progressionSystem = null,
    routes = [],
  } = {}) {
    if (!gameState) {
      throw new Error("RouteSystem requires gameState.");
    }

    this.gameState = gameState;
    this.eventBus = eventBus;
    this.progressionSystem = progressionSystem;

    this.routes = new Map();
    this.destroyed = false;
    this.listeners = [];

    for (const route of [...KANO_DISTRICTS, ...routes]) {
      this.registerRoute(route);
    }

    this.ensureRouteProgress();
    this.bindEvents();
  }

  async initialize() {
    // Data-only system — no network
    return this;
  }

  registerRoute(route) {
    if (!route || typeof route.id !== "string" || !route.id.trim()) {
      throw new Error("Every route must have a valid string id.");
    }

    const id = route.id.trim();

    this.routes.set(id, {
      id,
      name: route.name || id,
      description: route.description || "",
      level: Math.max(1, Number(route.level) || 1),
      fareMultiplier: Math.max(
        0.1,
        Number(route.fareMultiplier) || 1
      ),
      trafficDensity: this.clamp(
        Number(route.trafficDensity) || 0.5,
        0,
        1
      ),
      roadWidth: Math.max(1, Number(route.roadWidth) || 3),
      distance: Math.max(500, Number(route.distance) || 3000),
      landmarks: Array.isArray(route.landmarks)
        ? [...route.landmarks]
        : [],
      roads: Array.isArray(route.roads) ? [...route.roads] : [],
      unlockedByDefault: Boolean(route.unlockedByDefault),
      metadata: route.metadata ? { ...route.metadata } : {},
    });
  }

  ensureRouteProgress() {
    const profile = this.gameState.profile;

    if (!profile.routeProgress || typeof profile.routeProgress !== "object") {
      profile.routeProgress = {
        selectedRoute: DEFAULT_ROUTE,
        completedRoutes: [],
        routeStats: {},
      };
    }

    const progress = profile.routeProgress;

    if (!Array.isArray(progress.completedRoutes)) {
      progress.completedRoutes = [];
    }

    if (!progress.routeStats || typeof progress.routeStats !== "object") {
      progress.routeStats = {};
    }

    if (!this.routes.has(progress.selectedRoute)) {
      progress.selectedRoute = DEFAULT_ROUTE;
    }

    const progression = profile.progression;

    if (progression && Array.isArray(progression.unlockedRoutes)) {
      for (const route of this.routes.values()) {
        if (
          route.unlockedByDefault &&
          !progression.unlockedRoutes.includes(route.id)
        ) {
          progression.unlockedRoutes.push(route.id);
        }
      }
    }

    return progress;
  }

  bindEvents() {
    this.listen("run:finished", (payload = {}) => {
      if (payload.cancelled) return;

      const routeId =
        payload.routeId ?? this.getSelectedRouteId();

      this.recordRouteCompletion(routeId, payload);
    });

    this.listen("progression:level-up", () => {
      this.emit("routes:updated", this.getRoutes());
    });

    this.listen("progression:item-unlocked", (payload = {}) => {
      if (payload.type === "route") {
        this.emit("routes:updated", this.getRoutes());
      }
    });
  }

  listen(eventName, callback) {
    if (!this.eventBus || typeof this.eventBus.on !== "function") return;

    const unsubscribe = this.eventBus.on(eventName, callback);

    if (typeof unsubscribe === "function") {
      this.listeners.push(unsubscribe);
    } else if (typeof this.eventBus.off === "function") {
      this.listeners.push(() => this.eventBus.off(eventName, callback));
    }
  }

  getRoutes() {
    return [...this.routes.values()].map((route) => ({
      ...route,
      landmarks: [...route.landmarks],
      roads: [...route.roads],
      unlocked: this.isUnlocked(route.id),
      selected: route.id === this.getSelectedRouteId(),
      completed: this.isCompleted(route.id),
    }));
  }

  getRoute(routeId) {
    const route = this.routes.get(routeId);

    if (!route) return null;

    return {
      ...route,
      landmarks: [...route.landmarks],
      roads: [...route.roads],
      unlocked: this.isUnlocked(route.id),
      selected: route.id === this.getSelectedRouteId(),
      completed: this.isCompleted(route.id),
    };
  }

  getSelectedRouteId() {
    return this.gameState.profile.routeProgress.selectedRoute;
  }

  getSelectedRoute() {
    return this.getRoute(this.getSelectedRouteId());
  }

  isUnlocked(routeId) {
    const route = this.routes.get(routeId);

    if (!route) return false;
    if (route.unlockedByDefault) return true;

    if (
      this.progressionSystem &&
      typeof this.progressionSystem.isUnlocked === "function" &&
      this.progressionSystem.isUnlocked("route", routeId)
    ) {
      return true;
    }

    const progression = this.gameState.profile.progression;

    if (progression?.unlockedRoutes?.includes(routeId)) {
      return true;
    }

    const level = Math.max(1, Number(progression?.level) || 1);

    return level >= route.level;
  }

  isCompleted(routeId) {
    return this.gameState.profile.routeProgress.completedRoutes.includes(
      routeId
    );
  }

  selectRoute(routeId) {
    const route = this.routes.get(routeId);

    if (!route) {
      return {
        success: false,
        reason: "route_not_found",
      };
    }

    if (!this.isUnlocked(routeId)) {
      return {
        success: false,
        reason: "route_locked",
        requiredLevel: route.level,
        currentLevel: this.getCurrentLevel(),
      };
    }

    const previousRoute = this.getSelectedRouteId();

    this.gameState.profile.routeProgress.selectedRoute = routeId;

    this.persist();

    const result = {
      success: true,
      route: this.getRoute(routeId),
      previousRoute,
    };

    this.emit("routes:selected", result);

    return result;
  }

  getCurrentLevel() {
    return Math.max(
      1,
      Number(this.gameState.profile.progression?.level) || 1
    );
  }

  recordRouteCompletion(routeId, payload = {}) {
    const route = this.routes.get(routeId);

    if (!route) return null;

    const progress = this.gameState.profile.routeProgress;

    if (!progress.completedRoutes.includes(routeId)) {
      progress.completedRoutes.push(routeId);
    }

    if (!progress.routeStats[routeId]) {
      progress.routeStats[routeId] = {
        trips: 0,
        distance: 0,
        earnings: 0,
        bestDistance: 0,
      };
    }

    const stats = progress.routeStats[routeId];

    stats.trips += 1;
    stats.distance += Math.max(0, Number(payload.distance) || 0);
    stats.earnings += Math.max(0, Number(payload.earnings) || 0);
    stats.bestDistance = Math.max(
      stats.bestDistance,
      Math.max(0, Number(payload.distance) || 0)
    );

    this.persist();

    const result = {
      routeId,
      routeName: route.name,
      stats: { ...stats },
      newlyCompleted: progress.completedRoutes.length === 1,
    };

    this.emit("routes:completed", result);

    return result;
  }

  getRouteStats(routeId) {
    const stats =
      this.gameState.profile.routeProgress.routeStats[routeId];

    return stats ? { ...stats } : {
      trips: 0,
      distance: 0,
      earnings: 0,
      bestDistance: 0,
    };
  }

  getRouteModifiers(routeId = this.getSelectedRouteId()) {
    const route = this.routes.get(routeId);

    if (!route) {
      return {
        fareMultiplier: 1,
        trafficDensity: 0.5,
        roadWidth: 3,
        distance: 3000,
      };
    }

    return {
      fareMultiplier: route.fareMultiplier,
      trafficDensity: route.trafficDensity,
      roadWidth: route.roadWidth,
      distance: route.distance,
    };
  }

  getRouteNames() {
    return [...this.routes.values()].map((route) => ({
      id: route.id,
      name: route.name,
    }));
  }

  persist() {
    if (typeof this.gameState.emit === "function") {
      this.gameState.emit("profile:updated", this.gameState.profile);
    }

    this.emit("routes:updated", this.getRoutes());
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }

    if (typeof this.gameState.emit === "function") {
      this.gameState.emit(eventName, payload);
    }
  }

  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  reset() {
    this.gameState.profile.routeProgress = {
      selectedRoute: DEFAULT_ROUTE,
      completedRoutes: [],
      routeStats: {},
    };

    this.ensureRouteProgress();
    this.persist();
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Ignore listeners already removed.
      }
    }

    this.listeners.length = 0;
  }
}

export { KANO_DISTRICTS };