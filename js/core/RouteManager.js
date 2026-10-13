import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_ROUTES = [
  {
    id: "citycenter",
    name: "Kano City Centre",
    district: "Fagge",
    description: "Navigate the busy streets around Kano's commercial centre.",
    difficulty: 1,
    unlockLevel: 1,
    length: 1800,
    trafficDensity: 0.55,
    passengerDemand: 0.85,
    roadWidth: 12,
    speedLimit: 40,
    scenery: "urban",
    weather: ["clear", "cloudy", "rain"],
    landmarks: ["city_gate", "market", "roundabout"],
    rewardMultiplier: 1,
  },
  {
    id: "kantin_kwari",
    name: "Kantin Kwari Market",
    district: "Kantin Kwari",
    description: "Work through crowded market roads and frequent passenger stops.",
    difficulty: 2,
    unlockLevel: 2,
    length: 2200,
    trafficDensity: 0.8,
    passengerDemand: 1,
    roadWidth: 10,
    speedLimit: 30,
    scenery: "market",
    weather: ["clear", "cloudy", "rain"],
    landmarks: ["market_gate", "textile_stalls", "bus_stop"],
    rewardMultiplier: 1.2,
  },
  {
    id: "sabongari",
    name: "Sabon Gari Run",
    district: "Sabon Gari",
    description: "A lively urban route with mixed traffic and frequent junctions.",
    difficulty: 2,
    unlockLevel: 3,
    length: 2600,
    trafficDensity: 0.7,
    passengerDemand: 0.9,
    roadWidth: 11,
    speedLimit: 40,
    scenery: "urban",
    weather: ["clear", "cloudy", "rain", "dust"],
    landmarks: ["junction", "shops", "motor_park"],
    rewardMultiplier: 1.3,
  },
  {
    id: "kumbotso",
    name: "Kumbotso Express",
    district: "Kumbotso",
    description: "Longer roads with faster traffic and fewer passenger stops.",
    difficulty: 2,
    unlockLevel: 4,
    length: 3400,
    trafficDensity: 0.45,
    passengerDemand: 0.65,
    roadWidth: 14,
    speedLimit: 60,
    scenery: "suburban",
    weather: ["clear", "cloudy", "dust"],
    landmarks: ["residential_area", "roadside_stalls", "checkpoint"],
    rewardMultiplier: 1.45,
  },
  {
    id: "tarauni",
    name: "Tarauni Connection",
    district: "Tarauni",
    description: "Connect residential neighbourhoods through busy intersections.",
    difficulty: 3,
    unlockLevel: 5,
    length: 3000,
    trafficDensity: 0.7,
    passengerDemand: 0.8,
    roadWidth: 11,
    speedLimit: 45,
    scenery: "suburban",
    weather: ["clear", "cloudy", "rain", "dust"],
    landmarks: ["residential_area", "junction", "school_zone"],
    rewardMultiplier: 1.55,
  },
  {
    id: "nassarawa",
    name: "Nassarawa Circuit",
    district: "Nassarawa",
    description: "A demanding circuit with dense traffic and tight junctions.",
    difficulty: 3,
    unlockLevel: 6,
    length: 3800,
    trafficDensity: 0.78,
    passengerDemand: 0.75,
    roadWidth: 10,
    speedLimit: 40,
    scenery: "urban",
    weather: ["clear", "cloudy", "rain", "dust"],
    landmarks: ["roundabout", "shopping_area", "bus_stop"],
    rewardMultiplier: 1.7,
  },
  {
    id: "dawakin_kudu",
    name: "Dawakin Kudu Road",
    district: "Dawakin Kudu",
    description: "An open suburban road where speed and traffic awareness matter.",
    difficulty: 3,
    unlockLevel: 7,
    length: 4200,
    trafficDensity: 0.4,
    passengerDemand: 0.55,
    roadWidth: 14,
    speedLimit: 65,
    scenery: "rural",
    weather: ["clear", "cloudy", "dust"],
    landmarks: ["village", "farm", "roadside_market"],
    rewardMultiplier: 1.85,
  },
  {
    id: "airport_road",
    name: "Airport Road",
    district: "Airport Road",
    description: "Cover long stretches while avoiding fast-moving traffic.",
    difficulty: 4,
    unlockLevel: 8,
    length: 4800,
    trafficDensity: 0.62,
    passengerDemand: 0.7,
    roadWidth: 15,
    speedLimit: 70,
    scenery: "highway",
    weather: ["clear", "cloudy", "rain", "dust"],
    landmarks: ["fuel_station", "checkpoint", "airport_sign"],
    rewardMultiplier: 2,
  },
  {
    id: "bompai",
    name: "Bompai Industrial Route",
    district: "Bompai",
    description: "Share the road with heavy vehicles around industrial areas.",
    difficulty: 4,
    unlockLevel: 9,
    length: 3900,
    trafficDensity: 0.68,
    passengerDemand: 0.6,
    roadWidth: 14,
    speedLimit: 50,
    scenery: "industrial",
    weather: ["clear", "cloudy", "dust"],
    landmarks: ["warehouse", "factory_gate", "truck_yard"],
    rewardMultiplier: 2.15,
  },
  {
    id: "dawakin_tofa",
    name: "Dawakin Tofa Journey",
    district: "Dawakin Tofa",
    description: "A long-distance route with changing scenery and sparse services.",
    difficulty: 4,
    unlockLevel: 10,
    length: 5200,
    trafficDensity: 0.35,
    passengerDemand: 0.5,
    roadWidth: 13,
    speedLimit: 65,
    scenery: "rural",
    weather: ["clear", "cloudy", "dust", "rain"],
    landmarks: ["village", "farm", "checkpoint"],
    rewardMultiplier: 2.3,
  },
  {
    id: "wudil",
    name: "Wudil Highway",
    district: "Wudil",
    description: "A challenging highway run with high-speed traffic.",
    difficulty: 5,
    unlockLevel: 12,
    length: 6200,
    trafficDensity: 0.55,
    passengerDemand: 0.45,
    roadWidth: 16,
    speedLimit: 80,
    scenery: "highway",
    weather: ["clear", "cloudy", "dust"],
    landmarks: ["highway_sign", "fuel_station", "roadside_market"],
    rewardMultiplier: 2.6,
  },
  {
    id: "night_market",
    name: "Night Market Run",
    district: "Kano Municipal",
    description: "Navigate crowded streets after dark with limited visibility.",
    difficulty: 5,
    unlockLevel: 14,
    length: 3600,
    trafficDensity: 0.85,
    passengerDemand: 1,
    roadWidth: 10,
    speedLimit: 35,
    scenery: "night_market",
    weather: ["clear", "cloudy"],
    landmarks: ["market_gate", "food_stalls", "bus_stop"],
    rewardMultiplier: 2.8,
    forcedNight: true,
  },
  {
    id: "dust_storm",
    name: "Harmattan Challenge",
    district: "Northern Outskirts",
    description: "Drive through reduced visibility and unpredictable traffic.",
    difficulty: 5,
    unlockLevel: 16,
    length: 5500,
    trafficDensity: 0.65,
    passengerDemand: 0.55,
    roadWidth: 13,
    speedLimit: 55,
    scenery: "rural",
    weather: ["dust"],
    landmarks: ["village", "checkpoint", "fuel_station"],
    rewardMultiplier: 3,
    forcedWeather: "dust",
  },
  {
    id: "championship",
    name: "Kano Road Championship",
    district: "Kano",
    description: "The ultimate driving challenge across demanding road conditions.",
    difficulty: 5,
    unlockLevel: 20,
    length: 7000,
    trafficDensity: 0.9,
    passengerDemand: 0.85,
    roadWidth: 12,
    speedLimit: 65,
    scenery: "mixed",
    weather: ["clear", "cloudy", "rain", "dust"],
    landmarks: [
      "city_gate",
      "market_gate",
      "roundabout",
      "checkpoint",
      "finish_gate",
    ],
    rewardMultiplier: 3.5,
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneRoute(route) {
  return {
    ...route,
    weather: [...(route.weather ?? [])],
    landmarks: [...(route.landmarks ?? [])],
  };
}

function normalizeRoute(route, index = 0) {
  if (!route || typeof route !== "object") {
    throw new TypeError(`Route at index ${index} must be an object.`);
  }

  const id = String(route.id ?? "").trim();
  const name = String(route.name ?? "").trim();

  if (!id) {
    throw new Error(`Route at index ${index} is missing an id.`);
  }

  if (!name) {
    throw new Error(`Route "${id}" is missing a name.`);
  }

  return {
    id,
    name,
    district: String(route.district ?? "Kano"),
    description: String(route.description ?? ""),
    difficulty: clamp(Number(route.difficulty) || 1, 1, 5),
    unlockLevel: Math.max(1, Math.floor(Number(route.unlockLevel) || 1)),
    length: Math.max(100, Number(route.length) || 1800),
    trafficDensity: clamp(Number(route.trafficDensity ?? 0.5), 0, 1),
    passengerDemand: clamp(Number(route.passengerDemand ?? 0.5), 0, 1),
    roadWidth: clamp(Number(route.roadWidth ?? 12), 6, 24),
    speedLimit: Math.max(10, Number(route.speedLimit) || 40),
    scenery: String(route.scenery ?? "urban"),
    weather: Array.isArray(route.weather)
      ? [...new Set(route.weather.map(String))]
      : ["clear"],
    landmarks: Array.isArray(route.landmarks)
      ? route.landmarks.map(String)
      : [],
    rewardMultiplier: Math.max(0.1, Number(route.rewardMultiplier) || 1),
    forcedNight: Boolean(route.forcedNight),
    forcedWeather: route.forcedWeather
      ? String(route.forcedWeather)
      : null,
    ...route,
    id,
    name,
  };
}

export class RouteManager {
  constructor({
    eventBus = null,
    logger = null,
    gameState = null,
    routes = DEFAULT_ROUTES,
    startingRouteId = "citycenter",
  } = {}) {
    this.eventBus = eventBus ?? EventBus;
    this.logger = logger ?? Logger;
    this.gameState = gameState;

    this.routes = new Map();
    this.currentRouteId = null;
    this.currentRoute = null;
    this.routeHistory = [];
    this.listeners = new Set();
    this.disposed = false;

    for (let index = 0; index < routes.length; index += 1) {
      this.registerRoute(routes[index], { silent: true, index });
    }

    if (this.routes.size === 0) {
      throw new Error("RouteManager requires at least one valid route.");
    }

    const initialRoute = this.routes.has(startingRouteId)
      ? startingRouteId
      : this.routes.keys().next().value;

    this.selectRoute(initialRoute, {
      force: true,
      silent: true,
    });
  }

  registerRoute(route, { silent = false, index = this.routes.size } = {}) {
    this.assertActive();

    const normalized = normalizeRoute(route, index);

    if (this.routes.has(normalized.id)) {
      throw new Error(`Route "${normalized.id}" is already registered.`);
    }

    this.routes.set(normalized.id, normalized);

    if (!silent) {
      this.emit("route:registered", {
        route: cloneRoute(normalized),
      });
    }

    return cloneRoute(normalized);
  }

  unregisterRoute(routeId) {
    this.assertActive();

    const id = String(routeId);

    if (!this.routes.has(id)) {
      return false;
    }

    if (this.currentRouteId === id) {
      throw new Error("Cannot unregister the currently selected route.");
    }

    this.routes.delete(id);

    this.emit("route:unregistered", { routeId: id });

    return true;
  }

  getRoutes() {
    this.assertActive();

    return [...this.routes.values()].map(cloneRoute);
  }

  getRoute(routeId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    return route ? cloneRoute(route) : null;
  }

  getCurrentRoute() {
    this.assertActive();

    return this.currentRoute ? cloneRoute(this.currentRoute) : null;
  }

  getCurrentRouteId() {
    return this.currentRouteId;
  }

  getRouteCount() {
    return this.routes.size;
  }

  selectRoute(routeId, { force = false, silent = false } = {}) {
    this.assertActive();

    const id = String(routeId);
    const route = this.routes.get(id);

    if (!route) {
      throw new Error(`Unknown route "${id}".`);
    }

    if (!force && !this.isRouteUnlocked(id)) {
      this.emit("route:locked", {
        routeId: id,
        route: cloneRoute(route),
        requiredLevel: route.unlockLevel,
        playerLevel: this.getPlayerLevel(),
      });

      return {
        success: false,
        reason: "locked",
        route: cloneRoute(route),
      };
    }

    if (this.currentRouteId === id) {
      return {
        success: true,
        unchanged: true,
        route: cloneRoute(route),
      };
    }

    const previousRouteId = this.currentRouteId;

    this.currentRouteId = id;
    this.currentRoute = route;

    this.routeHistory.push({
      routeId: id,
      previousRouteId,
      timestamp: Date.now(),
    });

    if (this.routeHistory.length > 100) {
      this.routeHistory.shift();
    }

    const result = {
      success: true,
      route: cloneRoute(route),
      previousRouteId,
    };

    if (!silent) {
      this.emit("route:selected", result);
      this.emit("route:changed", result);
    }

    return result;
  }

  isRouteUnlocked(routeId) {
    const route = this.routes.get(String(routeId));

    if (!route) {
      return false;
    }

    return this.getPlayerLevel() >= route.unlockLevel;
  }

  getUnlockedRoutes() {
    this.assertActive();

    return [...this.routes.values()]
      .filter((route) => this.isRouteUnlocked(route.id))
      .map(cloneRoute);
  }

  getLockedRoutes() {
    this.assertActive();

    return [...this.routes.values()]
      .filter((route) => !this.isRouteUnlocked(route.id))
      .map(cloneRoute);
  }

  getNextUnlock() {
    this.assertActive();

    const playerLevel = this.getPlayerLevel();

    const nextRoute = [...this.routes.values()]
      .filter((route) => route.unlockLevel > playerLevel)
      .sort((a, b) => a.unlockLevel - b.unlockLevel)[0];

    return nextRoute ? cloneRoute(nextRoute) : null;
  }

  getProgressToNextUnlock() {
    const nextRoute = this.getNextUnlock();

    if (!nextRoute) {
      return {
        complete: true,
        currentLevel: this.getPlayerLevel(),
        requiredLevel: null,
        progress: 1,
        route: null,
      };
    }

    const currentLevel = this.getPlayerLevel();
    const previousUnlockLevel = Math.max(
      1,
      ...[...this.routes.values()]
        .filter((route) => route.unlockLevel < nextRoute.unlockLevel)
        .map((route) => route.unlockLevel),
    );

    const levelRange = Math.max(
      1,
      nextRoute.unlockLevel - previousUnlockLevel,
    );

    return {
      complete: false,
      currentLevel,
      requiredLevel: nextRoute.unlockLevel,
      levelsRemaining: Math.max(0, nextRoute.unlockLevel - currentLevel),
      progress: clamp(
        (currentLevel - previousUnlockLevel) / levelRange,
        0,
        1,
      ),
      route: nextRoute,
    };
  }

  getAvailableWeather(routeId = this.currentRouteId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    if (!route) {
      return [];
    }

    if (route.forcedWeather) {
      return [route.forcedWeather];
    }

    return [...route.weather];
  }

  getRouteConditions(routeId = this.currentRouteId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    if (!route) {
      return null;
    }

    return {
      routeId: route.id,
      scenery: route.scenery,
      weather: route.forcedWeather ?? null,
      isNight: route.forcedNight,
      trafficDensity: route.trafficDensity,
      passengerDemand: route.passengerDemand,
      roadWidth: route.roadWidth,
      speedLimit: route.speedLimit,
    };
  }

  calculateReward(baseReward = 0, routeId = this.currentRouteId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    if (!route) {
      return Math.max(0, Number(baseReward) || 0);
    }

    return Math.max(
      0,
      Math.round((Number(baseReward) || 0) * route.rewardMultiplier),
    );
  }

  calculateRouteDifficulty(routeId = this.currentRouteId) {
    this.assertActive();

    const route = this.routes.get(String(routeId));

    if (!route) {
      return null;
    }

    const trafficScore = route.trafficDensity * 0.35;
    const demandScore = route.passengerDemand * 0.2;
    const distanceScore = clamp(route.length / 7000, 0, 1) * 0.2;
    const speedScore = clamp(route.speedLimit / 100, 0, 1) * 0.15;
    const weatherScore = route.weather.includes("dust") ? 0.1 : 0;

    const score = clamp(
      (route.difficulty - 1) / 4 +
        trafficScore +
        demandScore +
        distanceScore +
        speedScore +
        weatherScore,
      0,
      1,
    );

    return {
      level: route.difficulty,
      score,
      label:
        score < 0.2
          ? "Very Easy"
          : score < 0.4
            ? "Easy"
            : score < 0.6
              ? "Moderate"
              : score < 0.8
                ? "Hard"
                : "Expert",
    };
  }

  getRouteHistory(limit = 10) {
    this.assertActive();

    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));

    if (safeLimit === 0) {
      return [];
    }

    return this.routeHistory
      .slice(-safeLimit)
      .reverse()
      .map((entry) => ({ ...entry }));
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("RouteManager.subscribe requires a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(eventName, payload = {}) {
    const event = {
      type: eventName,
      timestamp: Date.now(),
      ...payload,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logError("RouteManager subscriber failed.", error);
      }
    }

    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(eventName, event);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(eventName, event);
      }
    } catch (error) {
      this.logError(`Failed to emit "${eventName}".`, error);
    }
  }

  getPlayerLevel() {
    const state = this.gameState;

    if (!state) {
      return 1;
    }

    let level;

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

    return Math.max(1, Math.floor(Number(level) || 1));
  }

  setGameState(gameState) {
    this.assertActive();
    this.gameState = gameState;

    this.emit("route:progression-updated", {
      playerLevel: this.getPlayerLevel(),
      unlockedRoutes: this.getUnlockedRoutes().map((route) => route.id),
    });
  }

  getSnapshot() {
    this.assertActive();

    return {
      currentRouteId: this.currentRouteId,
      routeHistory: this.getRouteHistory(100),
      routes: this.getRoutes(),
    };
  }

  restoreSnapshot(snapshot, { silent = false } = {}) {
    this.assertActive();

    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }

    if (
      snapshot.currentRouteId &&
      this.routes.has(String(snapshot.currentRouteId))
    ) {
      this.selectRoute(String(snapshot.currentRouteId), {
        force: true,
        silent,
      });
    }

    if (Array.isArray(snapshot.routeHistory)) {
      this.routeHistory = snapshot.routeHistory
        .filter((entry) => entry && typeof entry.routeId === "string")
        .slice(-100)
        .map((entry) => ({
          routeId: entry.routeId,
          previousRouteId: entry.previousRouteId ?? null,
          timestamp: Number(entry.timestamp) || Date.now(),
        }));
    }

    return true;
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(message, error);
    } else if (typeof console !== "undefined" && console.error) {
      console.error(message, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteManager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.listeners.clear();
    this.routes.clear();
    this.routeHistory.length = 0;
    this.currentRoute = null;
    this.currentRouteId = null;
    this.gameState = null;
    this.disposed = true;
  }
}

export { DEFAULT_ROUTES };

export default RouteManager;