const DEFAULT_OPTIONS = {
  historyLimit: 1000,
  recentWindow: 10,
};

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(number(value) * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function percentage(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function normalizeRun(run = {}) {
  return {
    runId: String(run.runId ?? ""),
    routeId: String(run.routeId ?? "unknown"),
    outcome: ["completed", "failed", "abandoned"].includes(run.outcome)
      ? run.outcome
      : "abandoned",
    distance: Math.max(0, number(run.distance)),
    duration: Math.max(0, number(run.duration)),
    score: Math.max(0, number(run.score)),
    fare: Math.max(0, number(run.fare)),
    passengers: Math.max(0, Math.floor(number(run.passengers))),
    collisions: Math.max(0, Math.floor(number(run.collisions))),
    nearMisses: Math.max(0, Math.floor(number(run.nearMisses))),
    rewards: Math.max(0, number(run.rewards)),
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? new Date().toISOString(),
  };
}

export class RouteAnalytics {
  constructor({
    routeManager = null,
    progressManager = null,
    options = {},
    logger = console,
  } = {}) {
    this.routeManager = routeManager;
    this.progressManager = progressManager;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.options.historyLimit = Math.max(
      1,
      Math.floor(number(this.options.historyLimit, 1000)),
    );

    this.options.recentWindow = Math.max(
      1,
      Math.floor(number(this.options.recentWindow, 10)),
    );

    this.logger = logger;
    this.runs = [];
    this.listeners = new Set();
    this.unsubscribeProgress = null;
    this.disposed = false;

    this.attachProgressManager();
    this.importExistingProgress();
  }

  attachProgressManager() {
    if (typeof this.progressManager?.subscribe !== "function") {
      return;
    }

    this.unsubscribeProgress = this.progressManager.subscribe((event) => {
      if (event?.type === "route-progress:run-finished" && event.run) {
        this.recordRun(event.run, { emit: false });
      }
    });
  }

  importExistingProgress() {
    if (typeof this.progressManager?.getHistory !== "function") {
      return;
    }

    try {
      const history = this.progressManager.getHistory(
        this.options.historyLimit,
      );

      if (Array.isArray(history)) {
        this.runs = history
          .map(normalizeRun)
          .reverse()
          .slice(-this.options.historyLimit);
      }
    } catch (error) {
      this.logError("Could not import existing route history.", error);
    }
  }

  recordRun(run, { emit = true } = {}) {
    this.assertActive();

    if (!run || typeof run !== "object") {
      throw new TypeError("A route run object is required.");
    }

    const normalized = normalizeRun(run);

    if (!normalized.routeId) {
      throw new Error("A route run must have a route ID.");
    }

    if (
      normalized.runId &&
      this.runs.some((item) => item.runId === normalized.runId)
    ) {
      return false;
    }

    this.runs.push(normalized);

    if (this.runs.length > this.options.historyLimit) {
      this.runs.splice(
        0,
        this.runs.length - this.options.historyLimit,
      );
    }

    if (emit) {
      this.emit("route-analytics:run-recorded", {
        run: { ...normalized },
      });
    }

    return true;
  }

  recordRuns(runs = []) {
    this.assertActive();

    if (!Array.isArray(runs)) {
      throw new TypeError("Runs must be provided as an array.");
    }

    let added = 0;

    for (const run of runs) {
      if (this.recordRun(run, { emit: false })) {
        added += 1;
      }
    }

    if (added > 0) {
      this.emit("route-analytics:runs-imported", {
        count: added,
      });
    }

    return added;
  }

  getRuns({ routeId = null, outcome = null, limit = null } = {}) {
    this.assertActive();

    let result = this.runs;

    if (routeId !== null) {
      const id = String(routeId);
      result = result.filter((run) => run.routeId === id);
    }

    if (outcome !== null) {
      result = result.filter(
        (run) => run.outcome === String(outcome),
      );
    }

    if (limit !== null) {
      const count = Math.max(0, Math.floor(number(limit)));
      result = count === 0 ? [] : result.slice(-count);
    }

    return result.map((run) => ({ ...run }));
  }

  getOverallSummary() {
    this.assertActive();

    const runs = this.runs;
    const completed = runs.filter(
      (run) => run.outcome === "completed",
    );
    const failed = runs.filter((run) => run.outcome === "failed");
    const abandoned = runs.filter(
      (run) => run.outcome === "abandoned",
    );

    const totalDistance = sum(runs.map((run) => run.distance));
    const totalDuration = sum(runs.map((run) => run.duration));
    const totalFare = sum(runs.map((run) => run.fare));
    const totalPassengers = sum(runs.map((run) => run.passengers));
    const totalCollisions = sum(runs.map((run) => run.collisions));
    const totalNearMisses = sum(runs.map((run) => run.nearMisses));
    const totalRewards = sum(runs.map((run) => run.rewards));

    return {
      totalRuns: runs.length,
      completedRuns: completed.length,
      failedRuns: failed.length,
      abandonedRuns: abandoned.length,
      completionRate: round(percentage(completed.length, runs.length)),
      failureRate: round(percentage(failed.length, runs.length)),
      abandonmentRate: round(
        percentage(abandoned.length, runs.length),
      ),
      totalDistance: round(totalDistance),
      averageDistance: round(average(runs.map((run) => run.distance))),
      totalDuration: round(totalDuration),
      averageDuration: round(average(runs.map((run) => run.duration))),
      totalFare: round(totalFare),
      averageFare: round(average(runs.map((run) => run.fare))),
      totalPassengers,
      averagePassengers: round(
        average(runs.map((run) => run.passengers)),
      ),
      totalCollisions,
      averageCollisions: round(
        average(runs.map((run) => run.collisions)),
      ),
      totalNearMisses,
      totalRewards: round(totalRewards),
      averageScore: round(average(runs.map((run) => run.score))),
      highestScore: runs.length
        ? Math.max(...runs.map((run) => run.score))
        : 0,
      lastRunAt: runs.at(-1)?.finishedAt ?? null,
    };
  }

  getRouteSummary(routeId) {
    this.assertActive();

    const id = String(routeId);
    const runs = this.runs.filter((run) => run.routeId === id);

    if (runs.length === 0) {
      return {
        routeId: id,
        routeName: this.getRouteName(id),
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        abandonedRuns: 0,
        completionRate: 0,
        averageScore: 0,
        highestScore: 0,
        totalDistance: 0,
        averageDistance: 0,
        totalDuration: 0,
        averageDuration: 0,
        totalFare: 0,
        totalPassengers: 0,
        totalCollisions: 0,
        totalNearMisses: 0,
        totalRewards: 0,
        bestRun: null,
        lastRunAt: null,
      };
    }

    const completed = runs.filter(
      (run) => run.outcome === "completed",
    );
    const failed = runs.filter((run) => run.outcome === "failed");
    const abandoned = runs.filter(
      (run) => run.outcome === "abandoned",
    );

    const bestRun = [...runs].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.distance - a.distance;
    })[0];

    return {
      routeId: id,
      routeName: this.getRouteName(id),
      totalRuns: runs.length,
      completedRuns: completed.length,
      failedRuns: failed.length,
      abandonedRuns: abandoned.length,
      completionRate: round(percentage(completed.length, runs.length)),
      averageScore: round(average(runs.map((run) => run.score))),
      highestScore: Math.max(...runs.map((run) => run.score)),
      totalDistance: round(sum(runs.map((run) => run.distance))),
      averageDistance: round(
        average(runs.map((run) => run.distance)),
      ),
      totalDuration: round(sum(runs.map((run) => run.duration))),
      averageDuration: round(
        average(runs.map((run) => run.duration)),
      ),
      totalFare: round(sum(runs.map((run) => run.fare))),
      totalPassengers: sum(runs.map((run) => run.passengers)),
      totalCollisions: sum(runs.map((run) => run.collisions)),
      totalNearMisses: sum(runs.map((run) => run.nearMisses)),
      totalRewards: round(sum(runs.map((run) => run.rewards))),
      bestRun: { ...bestRun },
      lastRunAt: runs.at(-1)?.finishedAt ?? null,
    };
  }

  getRouteName(routeId) {
    try {
      const route = this.routeManager?.getRoute?.(routeId);
      return route?.name ?? String(routeId);
    } catch {
      return String(routeId);
    }
  }

  getRouteRankings({
    metric = "score",
    limit = 10,
    completedOnly = false,
  } = {}) {
    this.assertActive();

    const allowedMetrics = new Set([
      "score",
      "distance",
      "duration",
      "fare",
      "passengers",
      "rewards",
    ]);

    const selectedMetric = allowedMetrics.has(metric)
      ? metric
      : "score";

    const routeIds = new Set(this.runs.map((run) => run.routeId));
    const rankings = [];

    for (const routeId of routeIds) {
      let runs = this.runs.filter((run) => run.routeId === routeId);

      if (completedOnly) {
        runs = runs.filter((run) => run.outcome === "completed");
      }

      if (!runs.length) continue;

      const bestRun = [...runs].sort((a, b) => {
        if (selectedMetric === "duration") {
          return a.duration - b.duration;
        }

        return b[selectedMetric] - a[selectedMetric];
      })[0];

      rankings.push({
        routeId,
        routeName: this.getRouteName(routeId),
        runCount: runs.length,
        metric: selectedMetric,
        value: bestRun[selectedMetric],
        bestRun: { ...bestRun },
      });
    }

    rankings.sort((a, b) => {
      if (selectedMetric === "duration") {
        return a.value - b.value;
      }

      return b.value - a.value;
    });

    return rankings
      .slice(0, Math.max(0, Math.floor(number(limit, 10))))
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));
  }

  getRecentPerformance(windowSize = this.options.recentWindow) {
    this.assertActive();

    const count = Math.max(1, Math.floor(number(windowSize, 10)));
    const recent = this.runs.slice(-count);

    if (!recent.length) {
      return {
        sampleSize: 0,
        completionRate: 0,
        averageScore: 0,
        averageDistance: 0,
        averageFare: 0,
        averageCollisions: 0,
        trend: "insufficient_data",
      };
    }

    const half = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, half);
    const secondHalf = recent.slice(half);

    const firstAverage = average(
      firstHalf.map((run) => run.score),
    );
    const secondAverage = average(
      secondHalf.map((run) => run.score),
    );

    let trend = "stable";

    if (recent.length >= 4) {
      const difference = secondAverage - firstAverage;
      const threshold = Math.max(1, Math.abs(firstAverage) * 0.05);

      if (difference > threshold) trend = "improving";
      if (difference < -threshold) trend = "declining";
    } else {
      trend = "insufficient_data";
    }

    return {
      sampleSize: recent.length,
      completionRate: round(
        percentage(
          recent.filter((run) => run.outcome === "completed").length,
          recent.length,
        ),
      ),
      averageScore: round(average(recent.map((run) => run.score))),
      averageDistance: round(
        average(recent.map((run) => run.distance)),
      ),
      averageFare: round(average(recent.map((run) => run.fare))),
      averageCollisions: round(
        average(recent.map((run) => run.collisions)),
      ),
      trend,
    };
  }

  getDailySummary(date = new Date()) {
    this.assertActive();

    const target = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(target.getTime())) {
      throw new TypeError("A valid date is required.");
    }

    const key = target.toISOString().slice(0, 10);

    const runs = this.runs.filter((run) => {
      const finished = new Date(run.finishedAt);

      return (
        !Number.isNaN(finished.getTime()) &&
        finished.toISOString().slice(0, 10) === key
      );
    });

    return {
      date: key,
      totalRuns: runs.length,
      completedRuns: runs.filter(
        (run) => run.outcome === "completed",
      ).length,
      totalDistance: round(sum(runs.map((run) => run.distance))),
      totalFare: round(sum(runs.map((run) => run.fare))),
      totalPassengers: sum(runs.map((run) => run.passengers)),
      totalRewards: round(sum(runs.map((run) => run.rewards))),
      totalCollisions: sum(runs.map((run) => run.collisions)),
      totalScore: round(sum(runs.map((run) => run.score))),
    };
  }

  getDistrictSummary() {
    this.assertActive();

    const districts = new Map();

    for (const run of this.runs) {
      const route = this.routeManager?.getRoute?.(run.routeId);
      const district = route?.district ?? "Unknown";

      if (!districts.has(district)) {
        districts.set(district, []);
      }

      districts.get(district).push(run);
    }

    return [...districts.entries()]
      .map(([district, runs]) => ({
        district,
        totalRuns: runs.length,
        completedRuns: runs.filter(
          (run) => run.outcome === "completed",
        ).length,
        totalDistance: round(
          sum(runs.map((run) => run.distance)),
        ),
        totalFare: round(sum(runs.map((run) => run.fare))),
        averageScore: round(average(runs.map((run) => run.score))),
      }))
      .sort((a, b) => b.totalRuns - a.totalRuns);
  }

  getSnapshot() {
    this.assertActive();

    return {
      version: 1,
      runs: this.runs.map((run) => ({ ...run })),
      exportedAt: new Date().toISOString(),
    };
  }

  restoreSnapshot(snapshot) {
    this.assertActive();

    if (!snapshot || !Array.isArray(snapshot.runs)) {
      return false;
    }

    this.runs = snapshot.runs
      .slice(-this.options.historyLimit)
      .map(normalizeRun);

    this.emit("route-analytics:restored", {
      runCount: this.runs.length,
    });

    return true;
  }

  clear() {
    this.assertActive();

    this.runs = [];

    this.emit("route-analytics:cleared", {});
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(type, payload = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      ...payload,
    };

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logError("Analytics listener failed.", error);
      }
    }
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(`[RouteAnalytics] ${message}`, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteAnalytics has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    if (typeof this.unsubscribeProgress === "function") {
      this.unsubscribeProgress();
    }

    this.listeners.clear();
    this.runs = [];
    this.routeManager = null;
    this.progressManager = null;
    this.unsubscribeProgress = null;
    this.logger = null;
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS };

export default RouteAnalytics;