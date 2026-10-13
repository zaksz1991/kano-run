import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  title: "Kano Run — Route Statistics Report",
  currency: "NGN",
  locale: "en-NG",
  maximumRoutes: 50,
};

export class RouteStatisticsReport {
  constructor({
    statisticsManager = null,
    insightsManager = null,
    eventBus = EventBus,
    logger = Logger,
    options = {},
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.insightsManager = insightsManager;
    this.eventBus = eventBus;
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.disposed = false;
  }

  generate(filters = {}) {
    this.assertActive();

    const history = this.getHistory(filters);
    const runs = history.filter((run) => run && typeof run === "object");
    const metrics = this.calculateMetrics(runs);
    const routes = this.calculateRouteBreakdown(runs);
    const periods = this.calculatePeriodBreakdown(runs);
    const insights = this.getInsights(filters);

    const report = {
      title: this.options.title,
      generatedAt: new Date().toISOString(),
      filters: this.cloneFilters(filters),
      summary: this.buildSummary(metrics),
      metrics,
      routes,
      periods,
      insights,
      recentRuns: this.getRecentRuns(runs, 10),
    };

    this.emit("route:report:generated", {
      generatedAt: report.generatedAt,
      totalRuns: metrics.totalRuns,
      routeCount: routes.length,
    });

    return report;
  }

  getHistory(filters = {}) {
    if (!this.statisticsManager) {
      return [];
    }

    try {
      if (typeof this.statisticsManager.getHistory === "function") {
        const result = this.statisticsManager.getHistory(filters);
        return Array.isArray(result) ? result : [];
      }

      if (typeof this.statisticsManager.getStatistics === "function") {
        const result = this.statisticsManager.getStatistics(filters);
        const history = result?.history ?? result?.runs;
        return Array.isArray(history) ? history : [];
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsReport: unable to load run history.",
        error,
      );
    }

    return [];
  }

  getInsights(filters = {}) {
    if (!this.insightsManager) {
      return [];
    }

    try {
      if (typeof this.insightsManager.getInsights === "function") {
        const result = this.insightsManager.getInsights(filters);

        if (Array.isArray(result)) {
          return result;
        }

        return Array.isArray(result?.insights) ? result.insights : [];
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsReport: unable to generate insights.",
        error,
      );
    }

    return [];
  }

  calculateMetrics(runs) {
    const earnings = [];
    const distances = [];
    const durations = [];
    const crashes = [];

    let completedRuns = 0;
    let failedRuns = 0;
    let passengerPickups = 0;
    let passengerDropoffs = 0;

    for (const run of runs) {
      const status = this.getStatus(run);

      if (status === "completed") {
        completedRuns += 1;
      } else if (status === "failed") {
        failedRuns += 1;
      }

      this.pushIfKnown(earnings, this.getEarnings(run));
      this.pushIfKnown(distances, this.getDistance(run));
      this.pushIfKnown(durations, this.getDuration(run));
      this.pushIfKnown(crashes, this.getCrashes(run));

      passengerPickups += this.getNumber(run, [
        "passengerPickups",
        "passengersPickedUp",
        "pickups",
        "stats.passengerPickups",
      ]) ?? 0;

      passengerDropoffs += this.getNumber(run, [
        "passengerDropoffs",
        "passengersDroppedOff",
        "dropoffs",
        "stats.passengerDropoffs",
      ]) ?? 0;
    }

    const totalEarnings = this.sum(earnings);
    const totalDistance = this.sum(distances);
    const totalDuration = this.sum(durations);
    const totalCrashes = this.sum(crashes);

    return {
      totalRuns: runs.length,
      completedRuns,
      failedRuns,
      unclassifiedRuns: runs.length - completedRuns - failedRuns,
      completionRate: runs.length ? completedRuns / runs.length : 0,
      totalEarnings,
      averageEarnings: this.averageOrNull(earnings),
      highestEarnings: this.maximumOrNull(earnings),
      lowestEarnings: this.minimumOrNull(earnings),
      totalDistance,
      averageDistance: this.averageOrNull(distances),
      totalDuration,
      averageDuration: this.averageOrNull(durations),
      totalCrashes,
      averageCrashes: this.averageOrNull(crashes),
      crashFreeRuns: crashes.filter((count) => count === 0).length,
      passengerPickups,
      passengerDropoffs,
      uniqueRoutes: new Set(
        runs.map((run) => this.getRouteId(run)).filter(Boolean),
      ).size,
    };
  }

  calculateRouteBreakdown(runs) {
    const routeMap = new Map();

    for (const run of runs) {
      const routeId = this.getRouteId(run);

      if (!routeId) {
        continue;
      }

      let route = routeMap.get(routeId);

      if (!route) {
        route = {
          routeId,
          routeName: this.getRouteName(run) ?? routeId,
          runs: 0,
          completedRuns: 0,
          failedRuns: 0,
          earnings: 0,
          earningsCount: 0,
          distance: 0,
          distanceCount: 0,
          crashes: 0,
          crashesCount: 0,
        };

        routeMap.set(routeId, route);
      }

      route.runs += 1;

      const status = this.getStatus(run);

      if (status === "completed") {
        route.completedRuns += 1;
      } else if (status === "failed") {
        route.failedRuns += 1;
      }

      const earnings = this.getEarnings(run);

      if (earnings !== null) {
        route.earnings += earnings;
        route.earningsCount += 1;
      }

      const distance = this.getDistance(run);

      if (distance !== null) {
        route.distance += distance;
        route.distanceCount += 1;
      }

      const crashes = this.getCrashes(run);

      if (crashes !== null) {
        route.crashes += crashes;
        route.crashesCount += 1;
      }
    }

    return [...routeMap.values()]
      .map((route) => ({
        ...route,
        completionRate: route.runs
          ? route.completedRuns / route.runs
          : 0,
        averageEarnings: route.earningsCount
          ? route.earnings / route.earningsCount
          : null,
        averageDistance: route.distanceCount
          ? route.distance / route.distanceCount
          : null,
        averageCrashes: route.crashesCount
          ? route.crashes / route.crashesCount
          : null,
      }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, this.options.maximumRoutes);
  }

  calculatePeriodBreakdown(runs) {
    const periods = new Map();

    for (const run of runs) {
      const timestamp = this.getTimestamp(run);

      if (!timestamp) {
        continue;
      }

      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
      ].join("-");

      let period = periods.get(key);

      if (!period) {
        period = {
          period: key,
          runs: 0,
          completedRuns: 0,
          earnings: 0,
          earningsCount: 0,
          distance: 0,
          distanceCount: 0,
        };

        periods.set(key, period);
      }

      period.runs += 1;

      if (this.getStatus(run) === "completed") {
        period.completedRuns += 1;
      }

      const earnings = this.getEarnings(run);

      if (earnings !== null) {
        period.earnings += earnings;
        period.earningsCount += 1;
      }

      const distance = this.getDistance(run);

      if (distance !== null) {
        period.distance += distance;
        period.distanceCount += 1;
      }
    }

    return [...periods.values()]
      .map((period) => ({
        ...period,
        completionRate: period.runs
          ? period.completedRuns / period.runs
          : 0,
        averageEarnings: period.earningsCount
          ? period.earnings / period.earningsCount
          : null,
        averageDistance: period.distanceCount
          ? period.distance / period.distanceCount
          : null,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  getRecentRuns(runs, limit = 10) {
    return [...runs]
      .sort((a, b) => this.getTimestamp(b) - this.getTimestamp(a))
      .slice(0, Math.max(0, limit))
      .map((run) => ({
        routeId: this.getRouteId(run),
        routeName: this.getRouteName(run),
        status: this.getStatus(run),
        earnings: this.getEarnings(run),
        distance: this.getDistance(run),
        duration: this.getDuration(run),
        crashes: this.getCrashes(run),
        timestamp: this.getTimestamp(run) || null,
      }));
  }

  buildSummary(metrics) {
    const completionPercentage = Math.round(metrics.completionRate * 100);

    return {
      headline: `${metrics.totalRuns} recorded runs`,
      completion: `${completionPercentage}% completion rate`,
      earnings: this.formatCurrency(metrics.totalEarnings),
      distance: this.formatNumber(metrics.totalDistance),
      routes: metrics.uniqueRoutes,
    };
  }

  getStatus(run) {
    const raw = String(
      run.status ?? run.result ?? run.outcome ?? "",
    ).toLowerCase();

    if (
      ["completed", "success", "finished", "won"].includes(raw) ||
      run.completed === true ||
      run.isCompleted === true
    ) {
      return "completed";
    }

    if (
      [
        "failed",
        "crashed",
        "abandoned",
        "cancelled",
        "canceled",
        "game_over",
      ].includes(raw)
    ) {
      return "failed";
    }

    return "unknown";
  }

  getRouteId(run) {
    const value =
      run.routeId ??
      run.route_id ??
      run.route?.id ??
      run.route?.slug ??
      run.route?.name;

    return value === undefined || value === null || value === ""
      ? null
      : String(value);
  }

  getRouteName(run) {
    const value = run.routeName ?? run.route?.name ?? run.route_name;

    return value === undefined || value === null || value === ""
      ? null
      : String(value);
  }

  getEarnings(run) {
    return this.getNumber(run, [
      "earnings",
      "fareEarnings",
      "totalEarnings",
      "moneyEarned",
      "reward",
      "stats.earnings",
    ]);
  }

  getDistance(run) {
    return this.getNumber(run, [
      "distance",
      "distanceTravelled",
      "distanceTraveled",
      "totalDistance",
      "stats.distance",
    ]);
  }

  getDuration(run) {
    return this.getNumber(run, [
      "duration",
      "durationSeconds",
      "elapsedSeconds",
      "timeTaken",
      "stats.duration",
    ]);
  }

  getCrashes(run) {
    return this.getNumber(run, [
      "crashes",
      "crashCount",
      "collisions",
      "collisionCount",
      "stats.crashes",
    ]);
  }

  getTimestamp(run) {
    const value =
      run.completedAt ??
      run.completed_at ??
      run.createdAt ??
      run.created_at ??
      run.timestamp ??
      run.date;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }

    const parsed = Date.parse(value ?? "");

    return Number.isFinite(parsed) ? parsed : 0;
  }

  getNumber(object, paths) {
    for (const path of paths) {
      const value = path.split(".").reduce(
        (current, key) => current?.[key],
        object,
      );

      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        Number.isFinite(Number(value))
      ) {
        return Number(value);
      }
    }

    return null;
  }

  pushIfKnown(array, value) {
    if (value !== null && Number.isFinite(value)) {
      array.push(value);
    }
  }

  sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  average(values) {
    return values.length ? this.sum(values) / values.length : 0;
  }

  averageOrNull(values) {
    return values.length ? this.average(values) : null;
  }

  maximumOrNull(values) {
    return values.length ? Math.max(...values) : null;
  }

  minimumOrNull(values) {
    return values.length ? Math.min(...values) : null;
  }

  formatNumber(value) {
    return new Intl.NumberFormat(this.options.locale, {
      maximumFractionDigits: 2,
    }).format(value);
  }

  formatCurrency(value) {
    try {
      return new Intl.NumberFormat(this.options.locale, {
        style: "currency",
        currency: this.options.currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${this.options.currency} ${this.formatNumber(value)}`;
    }
  }

  cloneFilters(filters) {
    try {
      return structuredClone(filters);
    } catch {
      return { ...filters };
    }
  }

  emit(eventName, payload) {
    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(eventName, payload);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(eventName, payload);
      }
    } catch (error) {
      this.logger?.warn?.(
        `RouteStatisticsReport: failed to emit ${eventName}.`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsReport has been disposed.");
    }
  }

  dispose() {
    this.disposed = true;
    this.statisticsManager = null;
    this.insightsManager = null;
    this.eventBus = null;
  }
}

export default RouteStatisticsReport;