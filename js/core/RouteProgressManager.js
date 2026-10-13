const STORAGE_KEY = "kanoRun.routeProgress.v1";
const MAX_HISTORY = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createRouteProgress(routeId) {
  return {
    routeId,
    attempts: 0,
    completions: 0,
    failures: 0,
    distanceTravelled: 0,
    bestDistance: 0,
    bestTime: null,
    totalTime: 0,
    totalFare: 0,
    totalPassengers: 0,
    totalCollisions: 0,
    totalNearMisses: 0,
    totalRewards: 0,
    highestScore: 0,
    lastPlayedAt: null,
    lastCompletedAt: null,
    bestRun: null,
    recentRuns: [],
  };
}

function normalizeRun(run = {}) {
  return {
    runId: String(
      run.runId ??
        `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ),
    routeId: String(run.routeId ?? ""),
    outcome: ["completed", "failed", "abandoned"].includes(run.outcome)
      ? run.outcome
      : "abandoned",
    distance: Math.max(0, safeNumber(run.distance)),
    duration: Math.max(0, safeNumber(run.duration)),
    score: Math.max(0, safeNumber(run.score)),
    fare: Math.max(0, safeNumber(run.fare)),
    passengers: Math.max(0, Math.floor(safeNumber(run.passengers))),
    collisions: Math.max(0, Math.floor(safeNumber(run.collisions))),
    nearMisses: Math.max(0, Math.floor(safeNumber(run.nearMisses))),
    rewards: Math.max(0, safeNumber(run.rewards)),
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? new Date().toISOString(),
  };
}

export class RouteProgressManager {
  constructor({
    storage = null,
    storageKey = STORAGE_KEY,
    routeManager = null,
    eventBus = null,
    logger = console,
  } = {}) {
    this.storage = storage ?? this.getDefaultStorage();
    this.storageKey = storageKey;
    this.routeManager = routeManager;
    this.eventBus = eventBus;
    this.logger = logger;

    this.progress = new Map();
    this.activeRun = null;
    this.history = [];
    this.listeners = new Set();
    this.revision = 0;
    this.disposed = false;

    this.load();
  }

  getDefaultStorage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  ensureRoute(routeId) {
    const id = String(routeId ?? "").trim();

    if (!id) {
      throw new Error("A route ID is required.");
    }

    if (!this.progress.has(id)) {
      this.progress.set(id, createRouteProgress(id));
    }

    return this.progress.get(id);
  }

  getRoute(routeId) {
    return this.routeManager?.getRoute?.(routeId) ?? null;
  }

  startRun(routeId, metadata = {}) {
    this.assertActive();

    if (this.activeRun) {
      throw new Error("A route run is already active.");
    }

    const id = String(routeId ?? "").trim();

    if (!id) {
      throw new Error("Cannot start a run without a route ID.");
    }

    const route = this.getRoute(id);

    if (this.routeManager && !route) {
      throw new Error(`Unknown route "${id}".`);
    }

    const now = new Date().toISOString();
    const progress = this.ensureRoute(id);

    progress.attempts += 1;
    progress.lastPlayedAt = now;

    this.activeRun = {
      runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      routeId: id,
      startedAt: now,
      startedAtMs: Date.now(),
      distance: 0,
      duration: 0,
      score: 0,
      fare: 0,
      passengers: 0,
      collisions: 0,
      nearMisses: 0,
      rewards: 0,
      metadata: { ...metadata },
    };

    this.revision += 1;

    this.emit("route-progress:run-started", {
      routeId: id,
      runId: this.activeRun.runId,
      startedAt: now,
    });

    this.save();

    return this.getActiveRun();
  }

  updateRun(metrics = {}) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    const run = this.activeRun;

    if (metrics.distance !== undefined) {
      run.distance = Math.max(0, safeNumber(metrics.distance));
    }

    if (metrics.duration !== undefined) {
      run.duration = Math.max(0, safeNumber(metrics.duration));
    } else {
      run.duration = Math.max(
        0,
        (Date.now() - run.startedAtMs) / 1000,
      );
    }

    if (metrics.score !== undefined) {
      run.score = Math.max(0, safeNumber(metrics.score));
    }

    if (metrics.fare !== undefined) {
      run.fare = Math.max(0, safeNumber(metrics.fare));
    }

    if (metrics.passengers !== undefined) {
      run.passengers = Math.max(
        0,
        Math.floor(safeNumber(metrics.passengers)),
      );
    }

    if (metrics.collisions !== undefined) {
      run.collisions = Math.max(
        0,
        Math.floor(safeNumber(metrics.collisions)),
      );
    }

    if (metrics.nearMisses !== undefined) {
      run.nearMisses = Math.max(
        0,
        Math.floor(safeNumber(metrics.nearMisses)),
      );
    }

    if (metrics.rewards !== undefined) {
      run.rewards = Math.max(0, safeNumber(metrics.rewards));
    }

    this.emit("route-progress:run-updated", {
      routeId: run.routeId,
      runId: run.runId,
      metrics: this.getActiveRun(),
    });

    return true;
  }

  addDistance(distance) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    const value = safeNumber(distance);

    if (value <= 0) {
      return false;
    }

    this.activeRun.distance += value;

    return true;
  }

  addFare(amount) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    this.activeRun.fare += Math.max(0, safeNumber(amount));

    return true;
  }

  addPassenger(count = 1) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    this.activeRun.passengers += Math.max(
      0,
      Math.floor(safeNumber(count)),
    );

    return true;
  }

  addCollision(count = 1) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    this.activeRun.collisions += Math.max(
      0,
      Math.floor(safeNumber(count)),
    );

    return true;
  }

  addNearMiss(count = 1) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    this.activeRun.nearMisses += Math.max(
      0,
      Math.floor(safeNumber(count)),
    );

    return true;
  }

  addReward(amount) {
    this.assertActive();

    if (!this.activeRun) {
      return false;
    }

    this.activeRun.rewards += Math.max(0, safeNumber(amount));

    return true;
  }

  completeRun(finalMetrics = {}) {
    return this.finishRun("completed", finalMetrics);
  }

  failRun(finalMetrics = {}) {
    return this.finishRun("failed", finalMetrics);
  }

  abandonRun(finalMetrics = {}) {
    return this.finishRun("abandoned", finalMetrics);
  }

  finishRun(outcome, finalMetrics = {}) {
    this.assertActive();

    if (!this.activeRun) {
      return null;
    }

    this.updateRun(finalMetrics);

    const active = this.activeRun;

    const run = normalizeRun({
      ...active,
      ...finalMetrics,
      routeId: active.routeId,
      outcome,
      finishedAt: new Date().toISOString(),
      duration:
        finalMetrics.duration !== undefined
          ? finalMetrics.duration
          : Math.max(
              active.duration,
              (Date.now() - active.startedAtMs) / 1000,
            ),
    });

    const progress = this.ensureRoute(run.routeId);

    progress.distanceTravelled += run.distance;
    progress.bestDistance = Math.max(
      progress.bestDistance,
      run.distance,
    );
    progress.totalTime += run.duration;
    progress.totalFare += run.fare;
    progress.totalPassengers += run.passengers;
    progress.totalCollisions += run.collisions;
    progress.totalNearMisses += run.nearMisses;
    progress.totalRewards += run.rewards;
    progress.highestScore = Math.max(
      progress.highestScore,
      run.score,
    );

    if (outcome === "completed") {
      progress.completions += 1;
      progress.lastCompletedAt = run.finishedAt;

      if (
        progress.bestTime === null ||
        run.duration < progress.bestTime
      ) {
        progress.bestTime = run.duration;
      }
    } else if (outcome === "failed") {
      progress.failures += 1;
    }

    const currentBest = progress.bestRun;

    if (
      !currentBest ||
      run.score > safeNumber(currentBest.score) ||
      (run.score === safeNumber(currentBest.score) &&
        run.distance > safeNumber(currentBest.distance))
    ) {
      progress.bestRun = { ...run };
    }

    progress.recentRuns.push({ ...run });

    if (progress.recentRuns.length > 20) {
      progress.recentRuns.shift();
    }

    this.history.push({ ...run });

    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    this.activeRun = null;
    this.revision += 1;

    const result = {
      run: { ...run },
      routeProgress: this.getProgress(run.routeId),
      totals: this.getTotals(),
    };

    this.emit("route-progress:run-finished", result);

    this.save();

    return result;
  }

  getActiveRun() {
    if (!this.activeRun) {
      return null;
    }

    const { startedAtMs, ...run } = this.activeRun;

    return {
      ...run,
      elapsedSeconds: Math.max(
        0,
        (Date.now() - startedAtMs) / 1000,
      ),
      metadata: { ...run.metadata },
    };
  }

  getProgress(routeId) {
    this.assertActive();

    const progress = this.progress.get(String(routeId));

    if (!progress) {
      return createRouteProgress(String(routeId));
    }

    return {
      ...progress,
      bestRun: progress.bestRun
        ? { ...progress.bestRun }
        : null,
      recentRuns: progress.recentRuns.map((run) => ({ ...run })),
      completionRate:
        progress.attempts > 0
          ? progress.completions / progress.attempts
          : 0,
      averageDistance:
        progress.attempts > 0
          ? progress.distanceTravelled / progress.attempts
          : 0,
      averageScore:
        progress.attempts > 0
          ? progress.recentRuns.reduce(
              (sum, run) => sum + run.score,
              0,
            ) / progress.recentRuns.length
          : 0,
    };
  }

  getAllProgress() {
    this.assertActive();

    return [...this.progress.keys()].map((routeId) =>
      this.getProgress(routeId),
    );
  }

  getTotals() {
    this.assertActive();

    const totals = {
      routesPlayed: 0,
      routesCompleted: 0,
      attempts: 0,
      completions: 0,
      failures: 0,
      distanceTravelled: 0,
      totalTime: 0,
      totalFare: 0,
      totalPassengers: 0,
      totalCollisions: 0,
      totalNearMisses: 0,
      totalRewards: 0,
      highestScore: 0,
    };

    for (const progress of this.progress.values()) {
      totals.routesPlayed += progress.attempts > 0 ? 1 : 0;
      totals.routesCompleted += progress.completions > 0 ? 1 : 0;
      totals.attempts += progress.attempts;
      totals.completions += progress.completions;
      totals.failures += progress.failures;
      totals.distanceTravelled += progress.distanceTravelled;
      totals.totalTime += progress.totalTime;
      totals.totalFare += progress.totalFare;
      totals.totalPassengers += progress.totalPassengers;
      totals.totalCollisions += progress.totalCollisions;
      totals.totalNearMisses += progress.totalNearMisses;
      totals.totalRewards += progress.totalRewards;
      totals.highestScore = Math.max(
        totals.highestScore,
        progress.highestScore,
      );
    }

    totals.completionRate =
      totals.attempts > 0
        ? totals.completions / totals.attempts
        : 0;

    return totals;
  }

  getHistory(limit = MAX_HISTORY) {
    this.assertActive();

    const count = Math.max(0, Math.floor(safeNumber(limit)));

    if (count === 0) {
      return [];
    }

    return this.history
      .slice(-count)
      .reverse()
      .map((run) => ({ ...run }));
  }

  getLeaderboard({ limit = 10, sortBy = "score" } = {}) {
    this.assertActive();

    const allowedSortFields = new Set([
      "score",
      "distance",
      "duration",
      "fare",
      "passengers",
    ]);

    const field = allowedSortFields.has(sortBy)
      ? sortBy
      : "score";

    const entries = [];

    for (const progress of this.progress.values()) {
      if (progress.bestRun) {
        entries.push({
          routeId: progress.routeId,
          routeName:
            this.getRoute(progress.routeId)?.name ?? progress.routeId,
          ...progress.bestRun,
        });
      }
    }

    const direction = field === "duration" ? 1 : -1;

    entries.sort(
      (a, b) =>
        direction * (safeNumber(a[field]) - safeNumber(b[field])),
    );

    return entries
      .slice(0, Math.max(0, Math.floor(safeNumber(limit, 10))))
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));
  }

  getSnapshot() {
    this.assertActive();

    return {
      version: 1,
      revision: this.revision,
      progress: [...this.progress.values()].map((item) => ({
        ...item,
        bestRun: item.bestRun ? { ...item.bestRun } : null,
        recentRuns: item.recentRuns.map((run) => ({ ...run })),
      })),
      history: this.history.map((run) => ({ ...run })),
      activeRun: this.activeRun
        ? this.getActiveRun()
        : null,
    };
  }

  restoreSnapshot(snapshot) {
    this.assertActive();

    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !Array.isArray(snapshot.progress)
    ) {
      return false;
    }

    const restoredProgress = new Map();

    for (const item of snapshot.progress) {
      if (!item || !item.routeId) {
        continue;
      }

      const base = createRouteProgress(String(item.routeId));

      const normalized = {
        ...base,
        attempts: Math.max(0, safeNumber(item.attempts)),
        completions: Math.max(0, safeNumber(item.completions)),
        failures: Math.max(0, safeNumber(item.failures)),
        distanceTravelled: Math.max(
          0,
          safeNumber(item.distanceTravelled),
        ),
        bestDistance: Math.max(0, safeNumber(item.bestDistance)),
        bestTime:
          item.bestTime === null || item.bestTime === undefined
            ? null
            : Math.max(0, safeNumber(item.bestTime)),
        totalTime: Math.max(0, safeNumber(item.totalTime)),
        totalFare: Math.max(0, safeNumber(item.totalFare)),
        totalPassengers: Math.max(
          0,
          safeNumber(item.totalPassengers),
        ),
        totalCollisions: Math.max(
          0,
          safeNumber(item.totalCollisions),
        ),
        totalNearMisses: Math.max(
          0,
          safeNumber(item.totalNearMisses),
        ),
        totalRewards: Math.max(0, safeNumber(item.totalRewards)),
        highestScore: Math.max(0, safeNumber(item.highestScore)),
        lastPlayedAt: item.lastPlayedAt ?? null,
        lastCompletedAt: item.lastCompletedAt ?? null,
        bestRun: item.bestRun
          ? normalizeRun(item.bestRun)
          : null,
        recentRuns: Array.isArray(item.recentRuns)
          ? item.recentRuns.slice(-20).map(normalizeRun)
          : [],
      };

      restoredProgress.set(normalized.routeId, normalized);
    }

    this.progress = restoredProgress;

    this.history = Array.isArray(snapshot.history)
      ? snapshot.history.slice(-MAX_HISTORY).map(normalizeRun)
      : [];

    // Active runs are intentionally not resumed after a reload.
    this.activeRun = null;
    this.revision = Math.max(
      this.revision,
      safeNumber(snapshot.revision),
    );

    this.emit("route-progress:restored", {
      revision: this.revision,
      routeCount: this.progress.size,
    });

    return true;
  }

  save() {
    this.assertActive();

    if (!this.storage || typeof this.storage.setItem !== "function") {
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(this.getSnapshot()),
      );

      return true;
    } catch (error) {
      this.logError("Failed to save route progress.", error);
      return false;
    }
  }

  load() {
    this.assertActive();

    if (!this.storage || typeof this.storage.getItem !== "function") {
      return false;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return false;
      }

      const snapshot = JSON.parse(raw);

      return this.restoreSnapshot(snapshot);
    } catch (error) {
      this.logError("Failed to load route progress.", error);
      return false;
    }
  }

  resetRoute(routeId) {
    this.assertActive();

    const id = String(routeId);

    if (this.activeRun?.routeId === id) {
      throw new Error("Cannot reset progress for an active route run.");
    }

    const existed = this.progress.delete(id);

    if (existed) {
      this.history = this.history.filter((run) => run.routeId !== id);
      this.revision += 1;
      this.save();

      this.emit("route-progress:reset", {
        routeId: id,
      });
    }

    return existed;
  }

  resetAll() {
    this.assertActive();

    if (this.activeRun) {
      throw new Error("Cannot reset progress while a run is active.");
    }

    this.progress.clear();
    this.history = [];
    this.revision += 1;

    this.save();

    this.emit("route-progress:reset-all", {
      revision: this.revision,
    });
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
        this.logError("Route progress listener failed.", error);
      }
    }

    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(type, event);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(type, event);
      }
    } catch (error) {
      this.logError("Failed to emit route progress event.", error);
    }
  }

  logError(message, error) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(`[RouteProgressManager] ${message}`, error);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteProgressManager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.listeners.clear();
    this.progress.clear();
    this.history = [];
    this.activeRun = null;
    this.storage = null;
    this.routeManager = null;
    this.eventBus = null;
    this.logger = null;
    this.disposed = true;
  }
}

export { STORAGE_KEY, MAX_HISTORY };

export default RouteProgressManager;