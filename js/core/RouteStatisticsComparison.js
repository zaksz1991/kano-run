import { Logger } from "./Logger.js";

const log = new Logger("RouteStatisticsComparison");

const METRICS = Object.freeze([
  "score",
  "distance",
  "earnings",
  "passengers",
  "crashes",
]);

export class RouteStatisticsComparison {
  constructor({ statisticsManager = null } = {}) {
    this.statisticsManager = statisticsManager;
    this.disposed = false;
  }

  compareRoutes(records, routeA, routeB, metrics = METRICS) {
    this.ensureActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Records must be an array.");
    }

    const firstRoute = this.normalizeText(routeA);
    const secondRoute = this.normalizeText(routeB);

    if (!firstRoute || !secondRoute) {
      throw new TypeError("Two route names are required.");
    }

    const selectedMetrics = this.validateMetrics(metrics);

    const firstRuns = records.filter(
      (record) => this.getRouteName(record).toLowerCase() === firstRoute.toLowerCase()
    );

    const secondRuns = records.filter(
      (record) => this.getRouteName(record).toLowerCase() === secondRoute.toLowerCase()
    );

    return {
      routeA: this.summarizeRoute(firstRoute, firstRuns, selectedMetrics),
      routeB: this.summarizeRoute(secondRoute, secondRuns, selectedMetrics),
      comparison: this.compareSummaries(
        firstRoute,
        secondRoute,
        firstRuns,
        secondRuns,
        selectedMetrics
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  compareSummaries(routeA, routeB, runsA, runsB, metrics) {
    const comparison = {};

    for (const metric of metrics) {
      const valuesA = runsA.map((run) => this.getMetric(run, metric));
      const valuesB = runsB.map((run) => this.getMetric(run, metric));

      const averageA = this.average(valuesA);
      const averageB = this.average(valuesB);
      const difference = averageA - averageB;

      comparison[metric] = {
        averageA,
        averageB,
        difference,
        percentageDifference: this.percentageDifference(
          averageA,
          averageB
        ),
        winner: this.getWinner(metric, averageA, averageB),
        higherIsBetter: metric !== "crashes",
      };
    }

    return {
      routeA,
      routeB,
      metrics: comparison,
    };
  }

  summarizeRoute(routeName, records, metrics = METRICS) {
    const summary = {
      route: routeName,
      totalRuns: records.length,
      metrics: {},
    };

    for (const metric of metrics) {
      const values = records.map((record) => this.getMetric(record, metric));

      summary.metrics[metric] = {
        total: this.sum(values),
        average: this.average(values),
        minimum: values.length ? Math.min(...values) : 0,
        maximum: values.length ? Math.max(...values) : 0,
      };
    }

    summary.completionRate = this.calculateCompletionRate(records);
    return summary;
  }

  comparePeriods(records, {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    metrics = METRICS,
  } = {}) {
    this.ensureActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Records must be an array.");
    }

    const currentRange = this.normalizeRange(currentStart, currentEnd);
    const previousRange = this.normalizeRange(previousStart, previousEnd);
    const selectedMetrics = this.validateMetrics(metrics);

    const currentRuns = records.filter((record) =>
      this.isWithinRange(record, currentRange.start, currentRange.end)
    );

    const previousRuns = records.filter((record) =>
      this.isWithinRange(record, previousRange.start, previousRange.end)
    );

    const current = this.summarizeRoute(
      "Current period",
      currentRuns,
      selectedMetrics
    );

    const previous = this.summarizeRoute(
      "Previous period",
      previousRuns,
      selectedMetrics
    );

    const changes = {};

    for (const metric of selectedMetrics) {
      const currentAverage = current.metrics[metric].average;
      const previousAverage = previous.metrics[metric].average;

      changes[metric] = {
        current: currentAverage,
        previous: previousAverage,
        difference: currentAverage - previousAverage,
        percentageChange: this.percentageDifference(
          currentAverage,
          previousAverage
        ),
        direction: this.getWinner(
          metric,
          currentAverage,
          previousAverage
        ),
      };
    }

    return {
      current,
      previous,
      changes,
      generatedAt: new Date().toISOString(),
    };
  }

  getRouteNames(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    const names = new Map();

    for (const record of records) {
      const name = this.getRouteName(record);

      if (name && name !== "Unknown route") {
        const key = name.toLowerCase();

        if (!names.has(key)) {
          names.set(key, name);
        }
      }
    }

    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }

  getBestRoute(records, metric = "score") {
    this.ensureActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Records must be an array.");
    }

    this.validateMetrics([metric]);

    const grouped = new Map();

    for (const record of records) {
      const route = this.getRouteName(record);

      if (!grouped.has(route)) {
        grouped.set(route, []);
      }

      grouped.get(route).push(record);
    }

    const candidates = [...grouped.entries()].map(([route, runs]) => ({
      route,
      totalRuns: runs.length,
      average: this.average(runs.map((run) => this.getMetric(run, metric))),
    }));

    candidates.sort((a, b) => {
      const direction = metric === "crashes" ? 1 : -1;
      return (a.average - b.average) * direction;
    });

    return candidates[0] || null;
  }

  getRouteName(record) {
    const value =
      record?.routeName ??
      record?.route_name ??
      record?.routeTitle ??
      record?.route?.name ??
      record?.route?.title ??
      record?.route ??
      record?.routeId ??
      record?.route_id;

    return value === undefined || value === null || value === ""
      ? "Unknown route"
      : String(value);
  }

  getMetric(record, metric) {
    const keys = {
      score: ["score", "points", "totalScore"],
      distance: ["distance", "distanceKm", "distance_km"],
      earnings: ["earnings", "fare", "totalFare", "total_earnings"],
      passengers: [
        "passengers",
        "passengerCount",
        "passenger_count",
        "totalPassengers",
      ],
      crashes: ["crashes", "crashCount", "crash_count"],
    }[metric];

    if (!keys) {
      return 0;
    }

    for (const key of keys) {
      const rawValue = record?.[key];

      if (rawValue === null || rawValue === undefined || rawValue === "") {
        continue;
      }

      const value = Number(rawValue);

      if (Number.isFinite(value)) {
        return Math.max(0, value);
      }
    }

    return 0;
  }

  calculateCompletionRate(records) {
    if (!records.length) {
      return 0;
    }

    const completed = records.filter((record) => {
      if (record?.completed === true || record?.success === true) {
        return true;
      }

      if (record?.completed === false || record?.success === false) {
        return false;
      }

      const status = String(
        record?.result ?? record?.status ?? record?.outcome ?? ""
      ).toLowerCase();

      return [
        "completed",
        "complete",
        "success",
        "successful",
        "finished",
      ].includes(status);
    }).length;

    return (completed / records.length) * 100;
  }

  isWithinRange(record, start, end) {
    const date = this.getTimestamp(record);

    if (date === null) {
      return false;
    }

    return date >= start.getTime() && date <= end.getTime();
  }

  getTimestamp(record) {
    const raw =
      record?.completedAt ??
      record?.completed_at ??
      record?.timestamp ??
      record?.date ??
      record?.createdAt ??
      record?.created_at;

    if (raw === undefined || raw === null || raw === "") {
      return null;
    }

    const timestamp = new Date(raw).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  normalizeRange(start, end) {
    const normalizedStart = this.parseDate(start, "range start");
    const normalizedEnd = this.parseDate(end, "range end");

    if (normalizedStart > normalizedEnd) {
      throw new RangeError("Range start must not be after range end.");
    }

    return {
      start: normalizedStart,
      end: normalizedEnd,
    };
  }

  parseDate(value, label) {
    const date = value instanceof Date ? new Date(value) : new Date(value);

    if (value === null || value === undefined || Number.isNaN(date.getTime())) {
      throw new TypeError(`Invalid ${label}.`);
    }

    return date;
  }

  validateMetrics(metrics) {
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new TypeError("At least one metric must be selected.");
    }

    const invalid = metrics.filter((metric) => !METRICS.includes(metric));

    if (invalid.length) {
      throw new TypeError(`Unsupported metrics: ${invalid.join(", ")}`);
    }

    return [...new Set(metrics)];
  }

  getWinner(metric, valueA, valueB) {
    if (valueA === valueB) {
      return "tie";
    }

    if (metric === "crashes") {
      return valueA < valueB ? "routeA" : "routeB";
    }

    return valueA > valueB ? "routeA" : "routeB";
  }

  percentageDifference(valueA, valueB) {
    if (valueB === 0) {
      return valueA === 0 ? 0 : null;
    }

    return ((valueA - valueB) / Math.abs(valueB)) * 100;
  }

  average(values) {
    return values.length ? this.sum(values) / values.length : 0;
  }

  sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  ensureActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsComparison has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.statisticsManager = null;
    this.disposed = true;
  }
}

export { METRICS };
export default RouteStatisticsComparison;