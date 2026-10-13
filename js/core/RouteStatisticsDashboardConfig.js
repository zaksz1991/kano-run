export const ROUTE_STATISTICS_DASHBOARD_DEFAULTS = Object.freeze({
  title: "Route Statistics",
  subtitle: "Kano Run performance and route analytics",

  refresh: Object.freeze({
    enabled: false,
    interval: 30000,
    refreshOnEvents: Object.freeze([
      "run:completed",
      "route:completed",
      "statistics:updated",
    ]),
  }),

  filters: Object.freeze({
    defaultPeriod: "all",
    defaultRoute: "all",
    periods: Object.freeze([
      "all",
      "today",
      "week",
      "month",
    ]),
  }),

  metrics: Object.freeze([
    "runs",
    "distance",
    "earnings",
    "crashes",
    "completionRate",
    "averageScore",
  ]),

  history: Object.freeze({
    enabled: true,
    limit: 20,
    newestFirst: true,
  }),

  routes: Object.freeze({
    enabled: true,
    minimumRuns: 0,
    sortBy: "runs",
    sortDirection: "desc",
  }),

  insights: Object.freeze({
    enabled: true,
    limit: 10,
  }),

  display: Object.freeze({
    currency: "NGN",
    locale: "en-NG",
    distanceUnit: "km",
    maximumFractionDigits: 1,
    showEmptySections: true,
  }),

  accessibility: Object.freeze({
    announceUpdates: true,
    reducedMotion: false,
  }),

  branding: Object.freeze({
    company: "RuffNeck Entertainment",
    product: "Kano Run",
    gameTitle: "Kano Run — Adaidaita Sahu",
  }),
});

export class RouteStatisticsDashboardConfig {
  constructor(overrides = {}) {
    this.config = RouteStatisticsDashboardConfig.merge(
      ROUTE_STATISTICS_DASHBOARD_DEFAULTS,
      overrides,
    );

    this.validate();
  }

  static merge(defaults, overrides) {
    const result = { ...defaults };

    for (const [key, value] of Object.entries(overrides ?? {})) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        defaults[key] &&
        typeof defaults[key] === "object" &&
        !Array.isArray(defaults[key])
      ) {
        result[key] = RouteStatisticsDashboardConfig.merge(
          defaults[key],
          value,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  validate() {
    const config = this.config;

    if (
      !Number.isFinite(config.refresh?.interval) ||
      config.refresh.interval < 1000
    ) {
      throw new RangeError(
        "Dashboard refresh interval must be at least 1000 milliseconds.",
      );
    }

    if (
      !Number.isInteger(config.history?.limit) ||
      config.history.limit < 1
    ) {
      throw new RangeError(
        "Dashboard history limit must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(config.insights?.limit) ||
      config.insights.limit < 0
    ) {
      throw new RangeError(
        "Dashboard insights limit must be a non-negative integer.",
      );
    }

    if (!Array.isArray(config.filters?.periods)) {
      throw new TypeError(
        "Dashboard filter periods must be an array.",
      );
    }

    if (
      !config.filters.periods.includes(
        config.filters.defaultPeriod,
      )
    ) {
      throw new RangeError(
        "The default dashboard period must be included in the available periods.",
      );
    }

    if (!Array.isArray(config.metrics)) {
      throw new TypeError(
        "Dashboard metrics must be an array.",
      );
    }

    if (
      !["asc", "desc"].includes(
        config.routes?.sortDirection,
      )
    ) {
      throw new RangeError(
        'Route sort direction must be "asc" or "desc".',
      );
    }

    if (
      !Number.isFinite(config.routes?.minimumRuns) ||
      config.routes.minimumRuns < 0
    ) {
      throw new RangeError(
        "Minimum route runs must be a non-negative number.",
      );
    }

    return true;
  }

  get(key) {
    if (!key) {
      return this.toObject();
    }

    return String(key)
      .split(".")
      .reduce((value, part) => value?.[part], this.config);
  }

  set(key, value) {
    if (typeof key !== "string" || !key.trim()) {
      throw new TypeError(
        "A non-empty configuration key is required.",
      );
    }

    const parts = key.split(".");
    const updated = RouteStatisticsDashboardConfig.clone(
      this.config,
    );

    let target = updated;

    for (const part of parts.slice(0, -1)) {
      if (
        !target[part] ||
        typeof target[part] !== "object" ||
        Array.isArray(target[part])
      ) {
        target[part] = {};
      }

      target = target[part];
    }

    target[parts[parts.length - 1]] = value;

    const previous = this.config;
    this.config = updated;

    try {
      this.validate();
    } catch (error) {
      this.config = previous;
      throw error;
    }

    return this;
  }

  update(overrides = {}) {
    const updated = RouteStatisticsDashboardConfig.merge(
      this.config,
      overrides,
    );

    const previous = this.config;
    this.config = updated;

    try {
      this.validate();
    } catch (error) {
      this.config = previous;
      throw error;
    }

    return this;
  }

  toObject() {
    return RouteStatisticsDashboardConfig.clone(
      this.config,
    );
  }

  reset() {
    this.config = RouteStatisticsDashboardConfig.clone(
      ROUTE_STATISTICS_DASHBOARD_DEFAULTS,
    );

    return this;
  }

  static clone(value) {
    if (Array.isArray(value)) {
      return value.map((item) =>
        RouteStatisticsDashboardConfig.clone(item),
      );
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          RouteStatisticsDashboardConfig.clone(item),
        ]),
      );
    }

    return value;
  }
}

export function createRouteStatisticsDashboardConfig(
  overrides = {},
) {
  return new RouteStatisticsDashboardConfig(overrides);
}

export default RouteStatisticsDashboardConfig;