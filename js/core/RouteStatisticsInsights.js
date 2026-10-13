import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  historyLimit: 500,
  minimumRunsForComparison: 3,
  improvementThreshold: 0.05,
};

export class RouteStatisticsInsights {
  constructor({
    statisticsManager = null,
    eventBus = EventBus,
    logger = Logger,
    options = {},
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.eventBus = eventBus;
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.disposed = false;
  }

  getInsights(filters = {}) {
    this.assertActive();

    const history = this.getHistory(filters);
    const runs = history.filter((run) => this.isValidRun(run));

    if (runs.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        totalRuns: 0,
        summary: "Complete a route to generate driving insights.",
        insights: [],
        recommendations: [
          {
            type: "getting_started",
            priority: "medium",
            title: "Start your first route",
            description:
              "Complete a route to begin tracking your driving performance.",
          },
        ],
      };
    }

    const insights = [
      ...this.analyzeCompletion(runs),
      ...this.analyzeDistance(runs),
      ...this.analyzeEarnings(runs),
      ...this.analyzeCrashes(runs),
      ...this.analyzeEfficiency(runs),
      ...this.analyzeRoutes(runs),
      ...this.analyzeTrends(runs),
    ];

    const recommendations = this.buildRecommendations(insights, runs);

    const result = {
      generatedAt: new Date().toISOString(),
      totalRuns: runs.length,
      summary: this.buildSummary(runs, insights),
      metrics: this.calculateMetrics(runs),
      insights: insights.sort(
        (a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority),
      ),
      recommendations,
    };

    this.emit("route:insights:generated", {
      totalRuns: result.totalRuns,
      insightCount: result.insights.length,
      recommendationCount: result.recommendations.length,
    });

    return result;
  }

  getHistory(filters = {}) {
    if (!this.statisticsManager) {
      return [];
    }

    try {
      if (typeof this.statisticsManager.getHistory === "function") {
        const result = this.statisticsManager.getHistory({
          ...filters,
          limit: this.options.historyLimit,
        });

        return Array.isArray(result) ? result : [];
      }

      if (typeof this.statisticsManager.getStatistics === "function") {
        const result = this.statisticsManager.getStatistics(filters);
        const history = result?.history ?? result?.runs;

        return Array.isArray(history) ? history : [];
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsInsights: unable to retrieve history.",
        error,
      );
    }

    return [];
  }

  analyzeCompletion(runs) {
    const completed = runs.filter((run) => this.isCompleted(run));
    const rate = completed.length / runs.length;

    if (rate >= 0.9) {
      return [
        this.createInsight(
          "completion",
          "high",
          "Strong route completion",
          `You completed ${Math.round(rate * 100)}% of recorded routes.`,
          rate,
        ),
      ];
    }

    if (rate < 0.6) {
      return [
        this.createInsight(
          "completion",
          "high",
          "Improve route completion",
          `You completed ${Math.round(rate * 100)}% of recorded routes. Try shorter or more familiar routes.`,
          rate,
        ),
      ];
    }

    return [
      this.createInsight(
        "completion",
        "low",
        "Route completion is steady",
        `Your completion rate is ${Math.round(rate * 100)}%. Keep working toward completing more routes.`,
        rate,
      ),
    ];
  }

  analyzeDistance(runs) {
    const distances = runs
      .map((run) => this.getDistance(run))
      .filter((distance) => distance !== null);

    if (distances.length === 0) {
      return [];
    }

    const average = this.average(distances);
    const longest = Math.max(...distances);

    return [
      this.createInsight(
        "distance",
        "low",
        "Driving distance",
        `Your average recorded distance is ${this.formatNumber(average)} units per run. Your longest recorded run is ${this.formatNumber(longest)} units.`,
        average,
      ),
    ];
  }

  analyzeEarnings(runs) {
    const earnings = runs
      .map((run) => this.getEarnings(run))
      .filter((value) => value !== null);

    if (earnings.length === 0) {
      return [];
    }

    const average = this.average(earnings);
    const total = earnings.reduce((sum, value) => sum + value, 0);

    const best = Math.max(...earnings);

    return [
      this.createInsight(
        "earnings",
        "medium",
        "Fare earnings",
        `You earned ${this.formatNumber(total)} in total, averaging ${this.formatNumber(average)} per recorded run. Your best run earned ${this.formatNumber(best)}.`,
        average,
      ),
    ];
  }

  analyzeCrashes(runs) {
    const crashCounts = runs
      .map((run) => this.getCrashCount(run))
      .filter((value) => value !== null);

    if (crashCounts.length === 0) {
      return [];
    }

    const average = this.average(crashCounts);
    const crashFreeRuns = crashCounts.filter((count) => count === 0).length;
    const crashFreeRate = crashFreeRuns / crashCounts.length;

    if (average > 1) {
      return [
        this.createInsight(
          "safety",
          "high",
          "Reduce collisions",
          `You average ${this.formatNumber(average)} collisions per run. Slow down near traffic and leave more space between vehicles.`,
          average,
        ),
      ];
    }

    return [
      this.createInsight(
        "safety",
        crashFreeRate >= 0.75 ? "high" : "medium",
        "Collision performance",
        `${Math.round(crashFreeRate * 100)}% of runs with recorded collision data were collision-free.`,
        crashFreeRate,
      ),
    ];
  }

  analyzeEfficiency(runs) {
    const values = runs
      .map((run) => {
        const distance = this.getDistance(run);
        const earnings = this.getEarnings(run);

        if (distance === null || distance <= 0 || earnings === null) {
          return null;
        }

        return earnings / distance;
      })
      .filter((value) => value !== null && Number.isFinite(value));

    if (values.length < 2) {
      return [];
    }

    const average = this.average(values);
    const best = Math.max(...values);

    return [
      this.createInsight(
        "efficiency",
        "medium",
        "Earnings efficiency",
        `Your average earnings per distance unit are ${this.formatNumber(average)}. Your best recorded efficiency is ${this.formatNumber(best)}.`,
        average,
      ),
    ];
  }

  analyzeRoutes(runs) {
    const routeCounts = new Map();

    for (const run of runs) {
      const routeId = this.getRouteId(run);

      if (!routeId) {
        continue;
      }

      const entry = routeCounts.get(routeId) ?? {
        routeId,
        runs: 0,
        completed: 0,
        earnings: 0,
        earningsCount: 0,
      };

      entry.runs += 1;

      if (this.isCompleted(run)) {
        entry.completed += 1;
      }

      const earnings = this.getEarnings(run);

      if (earnings !== null) {
        entry.earnings += earnings;
        entry.earningsCount += 1;
      }

      routeCounts.set(routeId, entry);
    }

    const routes = [...routeCounts.values()];

    if (routes.length === 0) {
      return [];
    }

    const mostPlayed = [...routes].sort((a, b) => b.runs - a.runs)[0];

    const bestEarningRoute = routes
      .filter((route) => route.earningsCount > 0)
      .sort(
        (a, b) =>
          b.earnings / b.earningsCount -
          a.earnings / a.earningsCount,
      )[0];

    const insights = [
      this.createInsight(
        "route_preference",
        "low",
        "Most frequently driven route",
        `Your most frequently driven route is "${mostPlayed.routeId}", with ${mostPlayed.runs} recorded runs.`,
        mostPlayed.runs,
      ),
    ];

    if (bestEarningRoute) {
      insights.push(
        this.createInsight(
          "route_earnings",
          "medium",
          "Highest-earning route",
          `"${bestEarningRoute.routeId}" has your highest average earnings per recorded run.`,
          bestEarningRoute.earnings / bestEarningRoute.earningsCount,
        ),
      );
    }

    return insights;
  }

  analyzeTrends(runs) {
    if (runs.length < this.options.minimumRunsForComparison * 2) {
      return [];
    }

    const ordered = [...runs].sort(
      (a, b) => this.getTimestamp(a) - this.getTimestamp(b),
    );

    const split = Math.floor(ordered.length / 2);
    const earlier = ordered.slice(0, split);
    const recent = ordered.slice(split);

    const earlierEarnings = this.averageKnown(
      earlier.map((run) => this.getEarnings(run)),
    );

    const recentEarnings = this.averageKnown(
      recent.map((run) => this.getEarnings(run)),
    );

    if (earlierEarnings === null || recentEarnings === null) {
      return [];
    }

    if (earlierEarnings === 0) {
      return [];
    }

    const change = (recentEarnings - earlierEarnings) / Math.abs(earlierEarnings);
    const threshold = this.options.improvementThreshold;

    if (Math.abs(change) < threshold) {
      return [
        this.createInsight(
          "earnings_trend",
          "low",
          "Earnings are stable",
          "Your average earnings have remained relatively stable across the recorded periods.",
          change,
        ),
      ];
    }

    const improving = change > 0;

    return [
      this.createInsight(
        "earnings_trend",
        improving ? "high" : "medium",
        improving ? "Earnings trend is improving" : "Earnings trend is declining",
        `Average earnings per run have ${improving ? "increased" : "decreased"} by ${Math.abs(Math.round(change * 100))}% compared with earlier runs.`,
        change,
      ),
    ];
  }

  calculateMetrics(runs) {
    const earnings = runs
      .map((run) => this.getEarnings(run))
      .filter((value) => value !== null);

    const distances = runs
      .map((run) => this.getDistance(run))
      .filter((value) => value !== null);

    const crashes = runs
      .map((run) => this.getCrashCount(run))
      .filter((value) => value !== null);

    const completed = runs.filter((run) => this.isCompleted(run)).length;

    return {
      totalRuns: runs.length,
      completedRuns: completed,
      completionRate: runs.length ? completed / runs.length : 0,
      totalEarnings: earnings.reduce((sum, value) => sum + value, 0),
      averageEarnings: this.averageOrNull(earnings),
      totalDistance: distances.reduce((sum, value) => sum + value, 0),
      averageDistance: this.averageOrNull(distances),
      totalCrashes: crashes.reduce((sum, value) => sum + value, 0),
      averageCrashes: this.averageOrNull(crashes),
      uniqueRoutes: new Set(
        runs.map((run) => this.getRouteId(run)).filter(Boolean),
      ).size,
    };
  }

  buildRecommendations(insights, runs) {
    const recommendations = [];
    const safety = insights.find((item) => item.type === "safety");
    const completion = insights.find((item) => item.type === "completion");
    const trend = insights.find((item) => item.type === "earnings_trend");

    if (safety?.priority === "high" && safety.value > 1) {
      recommendations.push({
        type: "driving_safety",
        priority: "high",
        title: "Drive more defensively",
        description:
          "Reduce speed in dense traffic, avoid sudden lane changes, and maintain a safe following distance.",
      });
    }

    if (completion?.value < 0.6) {
      recommendations.push({
        type: "route_completion",
        priority: "high",
        title: "Choose manageable routes",
        description:
          "Practice on shorter routes before attempting longer or more difficult journeys.",
      });
    }

    if (trend?.type === "earnings_trend" && trend.value < 0) {
      recommendations.push({
        type: "earnings",
        priority: "medium",
        title: "Review your recent runs",
        description:
          "Compare recent routes and passenger fares to identify what may be reducing your average earnings.",
      });
    }

    if (runs.length >= this.options.minimumRunsForComparison) {
      const routes = new Set(
        runs.map((run) => this.getRouteId(run)).filter(Boolean),
      );

      if (routes.size <= 1) {
        recommendations.push({
          type: "route_exploration",
          priority: "low",
          title: "Explore another route",
          description:
            "Try a different unlocked route to compare its difficulty, distance, and earning potential.",
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: "maintain_progress",
        priority: "low",
        title: "Keep tracking your runs",
        description:
          "Continue completing routes to build a more reliable picture of your driving performance.",
      });
    }

    return recommendations;
  }

  buildSummary(runs, insights) {
    const completed = runs.filter((run) => this.isCompleted(run)).length;
    const completionRate = Math.round((completed / runs.length) * 100);
    const priorityInsight = insights.find(
      (insight) => insight.priority === "high",
    );

    return priorityInsight
      ? `${runs.length} runs recorded, with a ${completionRate}% completion rate. ${priorityInsight.title}.`
      : `${runs.length} runs recorded, with a ${completionRate}% completion rate.`;
  }

  createInsight(type, priority, title, description, value = null) {
    return {
      type,
      priority,
      title,
      description,
      value,
    };
  }

  isValidRun(run) {
    return Boolean(run && typeof run === "object");
  }

  isCompleted(run) {
    const status = String(
      run.status ?? run.result ?? run.outcome ?? "",
    ).toLowerCase();

    if (["completed", "success", "finished", "won"].includes(status)) {
      return true;
    }

    if (["failed", "crashed", "abandoned", "cancelled", "canceled"].includes(status)) {
      return false;
    }

    return run.completed === true || run.isCompleted === true;
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

  getCrashCount(run) {
    return this.getNumber(run, [
      "crashes",
      "crashCount",
      "collisions",
      "collisionCount",
      "stats.crashes",
    ]);
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

  getTimestamp(run) {
    const value =
      run.completedAt ??
      run.completed_at ??
      run.createdAt ??
      run.created_at ??
      run.timestamp ??
      run.date;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
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

  average(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  averageKnown(values) {
    return this.averageOrNull(values.filter((value) => value !== null));
  }

  averageOrNull(values) {
    return values.length ? this.average(values) : null;
  }

  formatNumber(value) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(value);
  }

  priorityValue(priority) {
    return { high: 3, medium: 2, low: 1 }[priority] ?? 0;
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
        `RouteStatisticsInsights: failed to emit ${eventName}.`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsInsights has been disposed.");
    }
  }

  dispose() {
    this.disposed = true;
    this.statisticsManager = null;
    this.eventBus = null;
  }
}

export default RouteStatisticsInsights;