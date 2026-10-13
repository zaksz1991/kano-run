const DEFAULT_FILTERS = {
  search: "",
  district: "all",
  difficulty: "all",
  unlockedOnly: false,
  completedOnly: false,
  minReward: 0,
  maxReward: Infinity,
  sortBy: "name",
  sortOrder: "asc",
};

const SORTERS = {
  name: (a, b) => getName(a).localeCompare(getName(b)),
  difficulty: (a, b) =>
    getDifficultyRank(a.difficulty) - getDifficultyRank(b.difficulty),
  distance: (a, b) => getNumber(a.distance) - getNumber(b.distance),
  reward: (a, b) => getReward(a) - getReward(b),
  district: (a, b) => getDistrict(a).localeCompare(getDistrict(b)),
  level: (a, b) => getRequiredLevel(a) - getRequiredLevel(b),
};

function getName(route) {
  return String(route.name ?? route.title ?? route.id ?? "");
}

function getDistrict(route) {
  return String(route.district ?? route.region ?? "unknown");
}

function getReward(route) {
  return getNumber(route.reward ?? route.baseReward);
}

function getRequiredLevel(route) {
  return getNumber(route.requiredLevel ?? route.unlockLevel, 1);
}

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getDifficultyRank(value) {
  const ranks = {
    easy: 1,
    normal: 2,
    medium: 3,
    hard: 4,
    expert: 5,
    extreme: 6,
  };

  return ranks[String(value ?? "normal").toLowerCase()] ?? 2;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export class RouteFilter {
  constructor({
    routes = [],
    isUnlocked = null,
    isCompleted = null,
  } = {}) {
    this.routes = [];
    this.isUnlockedCallback = isUnlocked;
    this.isCompletedCallback = isCompleted;
    this.filters = { ...DEFAULT_FILTERS };
    this.disposed = false;

    this.setRoutes(routes);
  }

  setRoutes(routes = []) {
    this.assertActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("RouteFilter.setRoutes expects an array.");
    }

    this.routes = routes
      .filter((route) => route && route.id != null)
      .map((route) => ({ ...route }));

    return this.getFilteredRoutes();
  }

  addRoute(route) {
    this.assertActive();

    if (!route || route.id == null) {
      throw new TypeError("A route with an id is required.");
    }

    const index = this.routes.findIndex(
      (item) => item.id === route.id,
    );

    if (index >= 0) {
      this.routes[index] = { ...route };
    } else {
      this.routes.push({ ...route });
    }

    return this.getFilteredRoutes();
  }

  removeRoute(routeId) {
    this.assertActive();

    const originalLength = this.routes.length;

    this.routes = this.routes.filter(
      (route) => route.id !== routeId,
    );

    return this.routes.length !== originalLength;
  }

  setFilter(name, value) {
    this.assertActive();

    if (!Object.hasOwn(DEFAULT_FILTERS, name)) {
      throw new Error(`Unknown route filter: "${name}".`);
    }

    this.filters[name] = this.normalizeFilterValue(name, value);

    return this.getFilteredRoutes();
  }

  setFilters(filters = {}) {
    this.assertActive();

    for (const [name, value] of Object.entries(filters)) {
      if (Object.hasOwn(DEFAULT_FILTERS, name)) {
        this.filters[name] = this.normalizeFilterValue(name, value);
      }
    }

    return this.getFilteredRoutes();
  }

  normalizeFilterValue(name, value) {
    switch (name) {
      case "search":
        return normalize(value);

      case "district":
      case "difficulty":
        return normalize(value || "all");

      case "unlockedOnly":
      case "completedOnly":
        return Boolean(value);

      case "minReward":
        return Math.max(0, getNumber(value));

      case "maxReward":
        return value === Infinity
          ? Infinity
          : Math.max(0, getNumber(value, Infinity));

      case "sortBy":
        return Object.hasOwn(SORTERS, value) ? value : "name";

      case "sortOrder":
        return value === "desc" ? "desc" : "asc";

      default:
        return value;
    }
  }

  getFilter(name) {
    this.assertActive();

    if (!Object.hasOwn(this.filters, name)) {
      return undefined;
    }

    return this.filters[name];
  }

  getFilters() {
    this.assertActive();
    return { ...this.filters };
  }

  resetFilters() {
    this.assertActive();
    this.filters = { ...DEFAULT_FILTERS };

    return this.getFilteredRoutes();
  }

  getFilteredRoutes() {
    this.assertActive();

    const filtered = this.routes.filter((route) =>
      this.matchesFilters(route),
    );

    const sorter = SORTERS[this.filters.sortBy] ?? SORTERS.name;
    const direction = this.filters.sortOrder === "desc" ? -1 : 1;

    filtered.sort((a, b) => {
      const result = sorter(a, b);

      if (result !== 0) {
        return result * direction;
      }

      return String(a.id).localeCompare(String(b.id));
    });

    return filtered.map((route) => ({ ...route }));
  }

  matchesFilters(route) {
    const filters = this.filters;

    if (filters.search) {
      const searchableText = [
        route.id,
        route.name,
        route.title,
        route.description,
        route.district,
        route.region,
        route.startPoint,
        route.endPoint,
        route.difficulty,
      ]
        .filter((value) => value != null)
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(filters.search)) {
        return false;
      }
    }

    if (filters.district !== "all") {
      if (normalize(getDistrict(route)) !== filters.district) {
        return false;
      }
    }

    if (filters.difficulty !== "all") {
      if (normalize(route.difficulty ?? "normal") !== filters.difficulty) {
        return false;
      }
    }

    if (
      filters.unlockedOnly &&
      !this.isRouteUnlocked(route)
    ) {
      return false;
    }

    if (
      filters.completedOnly &&
      !this.isRouteCompleted(route)
    ) {
      return false;
    }

    const reward = getReward(route);

    if (reward < filters.minReward || reward > filters.maxReward) {
      return false;
    }

    return true;
  }

  isRouteUnlocked(route) {
    if (typeof this.isUnlockedCallback === "function") {
      return Boolean(this.isUnlockedCallback(route.id, route));
    }

    if (route.unlocked === true || route.isUnlocked === true) {
      return true;
    }

    if (route.locked === true || route.isLocked === true) {
      return false;
    }

    return getRequiredLevel(route) <= 1;
  }

  isRouteCompleted(route) {
    if (typeof this.isCompletedCallback === "function") {
      return Boolean(this.isCompletedCallback(route.id, route));
    }

    return route.completed === true || route.isCompleted === true;
  }

  getDistricts() {
    this.assertActive();

    return [
      ...new Set(
        this.routes
          .map(getDistrict)
          .filter((district) => district !== "unknown"),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }

  getDifficulties() {
    this.assertActive();

    return [
      ...new Set(
        this.routes.map((route) =>
          normalize(route.difficulty ?? "normal"),
        ),
      ),
    ].sort((a, b) => getDifficultyRank(a) - getDifficultyRank(b));
  }

  getStatistics() {
    this.assertActive();

    const total = this.routes.length;
    const unlocked = this.routes.filter((route) =>
      this.isRouteUnlocked(route),
    ).length;
    const completed = this.routes.filter((route) =>
      this.isRouteCompleted(route),
    ).length;

    return {
      total,
      unlocked,
      locked: total - unlocked,
      completed,
      incomplete: total - completed,
      visible: this.getFilteredRoutes().length,
    };
  }

  clear() {
    this.assertActive();
    this.routes = [];
    return this;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteFilter has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.routes = [];
    this.isUnlockedCallback = null;
    this.isCompletedCallback = null;
    this.disposed = true;
  }
}

export default RouteFilter;