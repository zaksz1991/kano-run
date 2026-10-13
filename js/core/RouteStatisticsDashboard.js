import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  refreshIntervalMs: 30000,
  recentRunsLimit: 10,
  topRoutesLimit: 5,
  autoRefresh: false,
};

export class RouteStatisticsDashboard {
  constructor({
    statisticsManager = null,
    insightsManager = null,
    reportManager = null,
    eventBus = EventBus,
    logger = Logger,
    options = {},
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.insightsManager = insightsManager;
    this.reportManager = reportManager;
    this.eventBus = eventBus;
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.snapshot = null;
    this.refreshTimer = null;
    this.refreshPromise = null;
    this.listeners = new Set();
    this.disposed = false;
    this.lastUpdatedAt = null;
    this.lastError = null;
  }

  async initialize() {
    this.assertActive();

    const snapshot = await this.refresh();

    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }

    return snapshot;
  }

  async refresh(filters = {}) {
    this.assertActive();

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const task = this.buildSnapshot(filters);
    this.refreshPromise = task;

    try {
      return await task;
    } finally {
      if (this.refreshPromise === task) {
        this.refreshPromise = null;
      }
    }
  }

  async buildSnapshot(filters = {}) {
    const generatedAt = new Date().toISOString();

    try {
      const report = await this.getReport(filters);
      const insights = await this.getInsights(filters);
      const history = await this.getHistory(filters);

      if (this.disposed) {
        throw new Error("RouteStatisticsDashboard has been disposed.");
      }

      const metrics = report?.metrics ?? this.calculateMetrics(history);
      const routes = Array.isArray(report?.routes)
        ? report.routes
        : this.calculateRoutes(history);

      const recentRuns = Array.isArray(report?.recentRuns)
        ? report.recentRuns.slice(0, this.options.recentRunsLimit)
        : this.getRecentRuns(history);

      this.snapshot = {
        generatedAt,
        metrics,
        routes: routes.slice(0, this.options.topRoutesLimit),
        recentRuns,
        insights,
        recommendations: this.extractRecommendations(insights),
        summary: report?.summary ?? this.buildSummary(metrics),
      };

      this.lastUpdatedAt = generatedAt;
      this.lastError = null;

      this.emit("route:statistics:dashboard:updated", this.snapshot);
      this.notifyListeners(this.snapshot);

      return this.snapshot;
    } catch (error) {
      this.lastError = error;

      this.emit("route:statistics:dashboard:error", {
        message: error?.message ?? String(error),
        generatedAt,
      });

      this.logger?.error?.(
        "RouteStatisticsDashboard: refresh failed.",
        error,
      );

      throw error;
    }
  }

  async getReport(filters) {
    if (!this.reportManager) {
      return null;
    }

    if (typeof this.reportManager.generate === "function") {
      return await this.reportManager.generate(filters);
    }

    if (typeof this.reportManager.createReport === "function") {
      return await this.reportManager.createReport(filters);
    }

    return null;
  }

  async getInsights(filters) {
    if (!this.insightsManager) {
      return [];
    }

    if (typeof this.insightsManager.getInsights !== "function") {
      return [];
    }

    const result = await this.insightsManager.getInsights(filters);

    if (Array.isArray(result)) {
      return result;
    }

    return Array.isArray(result?.insights) ? result.insights : [];
  }

  async getHistory(filters) {
    if (!this.statisticsManager) {
      return [];
    }

    let result = null;

    if (typeof this.statisticsManager.getHistory === "function") {
      result = await this.statisticsManager.getHistory(filters);
    } else if (
      typeof this.statisticsManager.getStatistics === "function"
    ) {
      result = await this.statisticsManager.getStatistics(filters);
    }

    if (Array.isArray(result)) {
      return result;
    }

    if (Array.isArray(result?.records)) {
      return result.records;
    }

    if (Array.isArray(result?.history)) {
      return result.history;
    }

    if (Array.isArray(result?.runs)) {
      return result.runs;
    }

    return [];
  }

  calculateMetrics(runs) {
    const earnings = [];
    const distances = [];
    const crashes = [];

    let completedRuns = 0;
    let failedRuns = 0;

    for (const run of runs) {
      const status = this.getStatus(run);

      if (status === "completed") {
        completedRuns += 1;
      } else if (status === "failed") {
        failedRuns += 1;
      }

      this.collectNumber(earnings, run, [
        "earnings",
        "fareEarnings",
        "totalEarnings",
        "moneyEarned",
        "stats.earnings",
      ]);

      this.collectNumber(distances, run, [
        "distance",
        "distanceTravelled",
        "distanceTraveled",
        "totalDistance",
        "stats.distance",
      ]);

      this.collectNumber(crashes, run, [
        "crashes",
        "crashCount",
        "collisions",
        "collisionCount",
        "stats.crashes",
      ]);
    }

    return {
      totalRuns: runs.length,
      completedRuns,
      failedRuns,
      completionRate: runs.length ? completedRuns / runs.length : 0,
      totalEarnings: this.sum(earnings),
      averageEarnings: this.averageOrNull(earnings),
      totalDistance: this.sum(distances),
      averageDistance: this.averageOrNull(distances),
      totalCrashes: this.sum(crashes),
      averageCrashes: this.averageOrNull(crashes),
      uniqueRoutes: new Set(
        runs.map((run) => this.getRouteId(run)).filter(Boolean),
      ).size,
    };
  }

  calculateRoutes(runs) {
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
          earnings: 0,
          earningsCount: 0,
          crashes: 0,
          crashesCount: 0,
        };

        routeMap.set(routeId, route);
      }

      route.runs += 1;

      if (this.getStatus(run) === "completed") {
        route.completedRuns += 1;
      }

      const earnings = this.getNumber(run, [
        "earnings",
        "fareEarnings",
        "totalEarnings",
        "moneyEarned",
        "stats.earnings",
      ]);

      if (earnings !== null) {
        route.earnings += earnings;
        route.earningsCount += 1;
      }

      const crashes = this.getNumber(run, [
        "crashes",
        "crashCount",
        "collisions",
        "collisionCount",
        "stats.crashes",
      ]);

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
        averageCrashes: route.crashesCount
          ? route.crashes / route.crashesCount
          : null,
      }))
      .sort((a, b) => b.runs - a.runs);
  }

  getRecentRuns(runs) {
    return [...runs]
      .sort((a, b) => this.getTimestamp(b) - this.getTimestamp(a))
      .slice(0, this.options.recentRunsLimit)
      .map((run) => ({
        routeId: this.getRouteId(run),
        routeName: this.getRouteName(run),
        status: this.getStatus(run),
        earnings: this.getNumber(run, [
          "earnings",
          "fareEarnings",
          "totalEarnings",
          "moneyEarned",
          "stats.earnings",
        ]),
        distance: this.getNumber(run, [
          "distance",
          "distanceTravelled",
          "distanceTraveled",
          "totalDistance",
          "stats.distance",
        ]),
        crashes: this.getNumber(run, [
          "crashes",
          "crashCount",
          "collisions",
          "collisionCount",
          "stats.crashes",
        ]),
        timestamp: this.getTimestamp(run) || null,
      }));
  }

  extractRecommendations(insights) {
    const recommendations = [];

    for (const insight of insights) {
      if (Array.isArray(insight?.recommendations)) {
        recommendations.push(...insight.recommendations);
      }

      if (insight?.type && insight?.description) {
        recommendations.push({
          type: insight.type,
          priority: insight.priority ?? "low",
          title: insight.title ?? "Driving insight",
          description: insight.description,
        });
      }
    }

    const seen = new Set();

    return recommendations.filter((recommendation) => {
      const key = [
        recommendation.type,
        recommendation.title,
        recommendation.description,
      ].join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  buildSummary(metrics) {
    return {
      headline: `${metrics.totalRuns} recorded runs`,
      completionRate: metrics.completionRate,
      totalEarnings: metrics.totalEarnings,
      uniqueRoutes: metrics.uniqueRoutes,
    };
  }

  getStatus(run) {
    const status = String(
      run.status ?? run.result ?? run.outcome ?? "",
    ).toLowerCase();

    if (
      ["completed", "success", "finished", "won"].includes(status) ||
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
      ].includes(status)
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
    const value = run.routeName ?? run.route_name ?? run.route?.name;

    return value === undefined || value === null || value === ""
      ? null
      : String(value);
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

    const timestamp = Date.parse(value ?? "");

    return Number.isFinite(timestamp) ? timestamp : 0;
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

  collectNumber(target, object, paths) {
    const value = this.getNumber(object, paths);

    if (value !== null) {
      target.push(value);
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

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Dashboard listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  notifyListeners(snapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger?.warn?.(
          "RouteStatisticsDashboard: listener failed.",
          error,
        );
      }
    }
  }

  startAutoRefresh() {
    this.assertActive();

    if (this.refreshTimer !== null) {
      return false;
    }

    const interval = Math.max(
      1000,
      Number(this.options.refreshIntervalMs) || 30000,
    );

    this.refreshTimer = setInterval(() => {
      void this.refresh().catch(() => {});
    }, interval);

    if (
      typeof this.refreshTimer?.unref === "function"
    ) {
      this.refreshTimer.unref();
    }

    return true;
  }

  stopAutoRefresh() {
    if (this.refreshTimer === null) {
      return false;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = null;

    return true;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getStatus() {
    return {
      disposed: this.disposed,
      refreshing: Boolean(this.refreshPromise),
      autoRefresh: this.refreshTimer !== null,
      lastUpdatedAt: this.lastUpdatedAt,
      lastError: this.lastError
        ? {
            name: this.lastError.name,
            message: this.lastError.message,
          }
        : null,
    };
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
        `RouteStatisticsDashboard: failed to emit ${eventName}.`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsDashboard has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stopAutoRefresh();
    this.listeners.clear();

    this.statisticsManager = null;
    this.insightsManager = null;
    this.reportManager = null;
    this.eventBus = null;
    this.logger = null;
    this.snapshot = null;
    this.disposed = true;
  }
}

export default RouteStatisticsDashboard;