const DEFAULT_WEIGHTS = {
  reward: 0.25,
  difficulty: 0.2,
  distance: 0.15,
  progression: 0.2,
  familiarity: 0.1,
  variety: 0.1,
};

const DIFFICULTY_RANKS = {
  easy: 1,
  normal: 2,
  medium: 3,
  hard: 4,
  expert: 5,
  extreme: 6,
};

export class RouteRecommendationEngine {
  constructor({
    routeManager = null,
    routeDatabase = null,
    routeUnlockManager = null,
    routeProgressManager = null,
    weights = {},
    preferredDifficulty = "normal",
    maxRecommendations = 5,
  } = {}) {
    this.routeManager = routeManager;
    this.routeDatabase = routeDatabase;
    this.routeUnlockManager = routeUnlockManager;
    this.routeProgressManager = routeProgressManager;

    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...weights,
    };

    this.preferredDifficulty = preferredDifficulty;
    this.maxRecommendations = Math.max(
      1,
      Math.floor(Number(maxRecommendations) || 5),
    );

    this.routeHistory = new Map();
    this.recentRouteIds = [];
    this.maxRecentRoutes = 5;
    this.disposed = false;
  }

  getRoutes() {
    this.assertActive();

    let routes = [];

    if (
      typeof this.routeDatabase?.getAllRoutes === "function"
    ) {
      routes = this.routeDatabase.getAllRoutes();
    } else if (
      typeof this.routeDatabase?.getRoutes === "function"
    ) {
      routes = this.routeDatabase.getRoutes();
    } else if (
      typeof this.routeManager?.getRoutes === "function"
    ) {
      routes = this.routeManager.getRoutes();
    } else if (Array.isArray(this.routeManager?.routes)) {
      routes = this.routeManager.routes;
    }

    return Array.isArray(routes)
      ? routes.filter((route) => route && route.id != null)
      : [];
  }

  recommend({
    playerLevel = 1,
    playerMoney = 0,
    preferredDifficulty = this.preferredDifficulty,
    excludeCompleted = false,
    completedRouteIds = [],
    currentRouteId = null,
    limit = this.maxRecommendations,
  } = {}) {
    this.assertActive();

    const routes = this.getRoutes();
    const completed = new Set(completedRouteIds);
    const eligible = routes.filter((route) => {
      if (!this.isUnlocked(route)) return false;
      if (route.id === currentRouteId) return false;

      if (
        excludeCompleted &&
        (completed.has(route.id) || this.isCompleted(route))
      ) {
        return false;
      }

      return true;
    });

    if (eligible.length === 0) return [];

    const maxReward = Math.max(
      1,
      ...eligible.map((route) => this.getReward(route)),
    );

    const maxDistance = Math.max(
      1,
      ...eligible.map((route) => this.getDistance(route)),
    );

    const maxLevel = Math.max(
      1,
      ...eligible.map((route) => this.getRequiredLevel(route)),
    );

    const results = eligible.map((route) => {
      const score = this.scoreRoute(route, {
        playerLevel,
        playerMoney,
        preferredDifficulty,
        maxReward,
        maxDistance,
        maxLevel,
      });

      return {
        route: { ...route },
        routeId: route.id,
        score: Math.round(score.total * 1000) / 1000,
        reasons: score.reasons,
        unlocked: true,
        completed: this.isCompleted(route),
      };
    });

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.routeId).localeCompare(String(b.routeId));
    });

    const safeLimit = Math.max(
      1,
      Math.floor(Number(limit) || this.maxRecommendations),
    );

    return results.slice(0, safeLimit);
  }

  scoreRoute(route, context) {
    const {
      playerLevel,
      playerMoney,
      preferredDifficulty,
      maxReward,
      maxDistance,
      maxLevel,
    } = context;

    const reward = this.getReward(route);
    const distance = this.getDistance(route);
    const requiredLevel = this.getRequiredLevel(route);
    const difficulty = this.getDifficultyRank(route);
    const preferredRank = this.getDifficultyRank({
      difficulty: preferredDifficulty,
    });

    const rewardScore = reward / maxReward;

    const difficultyDifference = Math.abs(
      difficulty - preferredRank,
    );

    const difficultyScore = Math.max(
      0,
      1 - difficultyDifference / 5,
    );

    const distanceScore = 1 - distance / maxDistance;

    const progressionScore = Math.max(
      0,
      Math.min(1, (playerLevel + 2 - requiredLevel) / Math.max(3, maxLevel)),
    );

    const familiarityScore = this.getFamiliarityScore(route.id);

    const varietyScore = this.recentRouteIds.includes(route.id)
      ? 0.15
      : 1;

    const affordabilityScore =
      playerMoney >= 0 && Number.isFinite(playerMoney) ? 1 : 0;

    const total =
      rewardScore * this.weights.reward +
      difficultyScore * this.weights.difficulty +
      distanceScore * this.weights.distance +
      progressionScore * this.weights.progression +
      familiarityScore * this.weights.familiarity +
      varietyScore * this.weights.variety;

    const reasons = [];

    if (rewardScore >= 0.7) {
      reasons.push("Good earning potential");
    }

    if (difficultyScore >= 0.8) {
      reasons.push("Matches your preferred difficulty");
    }

    if (progressionScore >= 0.7) {
      reasons.push("Suitable for your current level");
    }

    if (familiarityScore >= 0.7) {
      reasons.push("Fits your route history");
    }

    if (varietyScore >= 0.9) {
      reasons.push("Offers a change from recent routes");
    }

    if (distanceScore >= 0.7) {
      reasons.push("Shorter route");
    }

    if (affordabilityScore === 0) {
      reasons.push("Review your available balance");
    }

    if (reasons.length === 0) {
      reasons.push("A route worth exploring");
    }

    return {
      total,
      components: {
        reward: rewardScore,
        difficulty: difficultyScore,
        distance: distanceScore,
        progression: progressionScore,
        familiarity: familiarityScore,
        variety: varietyScore,
      },
      reasons,
    };
  }

  isUnlocked(route) {
    if (
      typeof this.routeUnlockManager?.isRouteUnlocked === "function"
    ) {
      return Boolean(
        this.routeUnlockManager.isRouteUnlocked(route.id),
      );
    }

    if (
      typeof this.routeUnlockManager?.isUnlocked === "function"
    ) {
      return Boolean(
        this.routeUnlockManager.isUnlocked(route.id),
      );
    }

    if (route.unlocked === true || route.isUnlocked === true) {
      return true;
    }

    if (route.locked === true || route.isLocked === true) {
      return false;
    }

    return this.getRequiredLevel(route) <= 1;
  }

  isCompleted(route) {
    if (
      typeof this.routeProgressManager?.isRouteCompleted === "function"
    ) {
      return Boolean(
        this.routeProgressManager.isRouteCompleted(route.id),
      );
    }

    if (
      typeof this.routeProgressManager?.isCompleted === "function"
    ) {
      return Boolean(
        this.routeProgressManager.isCompleted(route.id),
      );
    }

    return route.completed === true || route.isCompleted === true;
  }

  getReward(route) {
    const value = Number(route.reward ?? route.baseReward ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  getDistance(route) {
    const value = Number(route.distance ?? 1);
    return Number.isFinite(value) ? Math.max(0, value) : 1;
  }

  getRequiredLevel(route) {
    const value = Number(
      route.requiredLevel ?? route.unlockLevel ?? 1,
    );

    return Number.isFinite(value) ? Math.max(1, value) : 1;
  }

  getDifficultyRank(route) {
    const difficulty = String(
      route?.difficulty ?? "normal",
    ).toLowerCase();

    return DIFFICULTY_RANKS[difficulty] ?? 2;
  }

  getFamiliarityScore(routeId) {
    const history = this.routeHistory.get(routeId);

    if (!history || history.completions === 0) {
      return 0.5;
    }

    return Math.min(1, history.completions / 5);
  }

  recordRoutePlayed(routeId, {
    completed = false,
    reward = 0,
    duration = 0,
  } = {}) {
    this.assertActive();

    if (routeId == null) return false;

    const history = this.routeHistory.get(routeId) ?? {
      attempts: 0,
      completions: 0,
      totalReward: 0,
      totalDuration: 0,
      lastPlayedAt: null,
    };

    history.attempts += 1;

    if (completed) {
      history.completions += 1;
    }

    history.totalReward += Math.max(0, Number(reward) || 0);
    history.totalDuration += Math.max(0, Number(duration) || 0);
    history.lastPlayedAt = Date.now();

    this.routeHistory.set(routeId, history);

    this.recentRouteIds = [
      routeId,
      ...this.recentRouteIds.filter((id) => id !== routeId),
    ].slice(0, this.maxRecentRoutes);

    return true;
  }

  getRouteHistory(routeId) {
    this.assertActive();

    const history = this.routeHistory.get(routeId);

    return history ? { ...history } : null;
  }

  exportHistory() {
    this.assertActive();

    return {
      version: 1,
      recentRouteIds: [...this.recentRouteIds],
      routes: [...this.routeHistory.entries()].map(
        ([routeId, history]) => ({
          routeId,
          ...history,
        }),
      ),
    };
  }

  importHistory(data) {
    this.assertActive();

    if (!data || !Array.isArray(data.routes)) {
      return false;
    }

    const validRouteIds = new Set(
      this.getRoutes().map((route) => route.id),
    );

    const nextHistory = new Map();

    for (const entry of data.routes) {
      if (!entry || !validRouteIds.has(entry.routeId)) {
        continue;
      }

      nextHistory.set(entry.routeId, {
        attempts: Math.max(0, Number(entry.attempts) || 0),
        completions: Math.max(0, Number(entry.completions) || 0),
        totalReward: Math.max(0, Number(entry.totalReward) || 0),
        totalDuration: Math.max(0, Number(entry.totalDuration) || 0),
        lastPlayedAt: Number(entry.lastPlayedAt) || null,
      });
    }

    this.routeHistory = nextHistory;

    this.recentRouteIds = Array.isArray(data.recentRouteIds)
      ? data.recentRouteIds
          .filter((id) => validRouteIds.has(id))
          .slice(0, this.maxRecentRoutes)
      : [];

    return true;
  }

  setWeights(weights = {}) {
    this.assertActive();

    for (const [key, value] of Object.entries(weights)) {
      if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) continue;

      const number = Number(value);

      if (Number.isFinite(number) && number >= 0) {
        this.weights[key] = number;
      }
    }

    return { ...this.weights };
  }

  setPreferredDifficulty(difficulty) {
    this.assertActive();

    const normalized = String(difficulty ?? "normal").toLowerCase();

    if (!Object.hasOwn(DIFFICULTY_RANKS, normalized)) {
      return false;
    }

    this.preferredDifficulty = normalized;
    return true;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteRecommendationEngine has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.routeHistory.clear();
    this.recentRouteIds = [];

    this.routeManager = null;
    this.routeDatabase = null;
    this.routeUnlockManager = null;
    this.routeProgressManager = null;

    this.disposed = true;
  }
}

export default RouteRecommendationEngine;