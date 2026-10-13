const DEFAULT_OPTIONS = {
  minQueryLength: 1,
  fuzzySearch: true,
  maxResults: 50,
  includeLocked: true,
};

export class RouteSearchIndex {
  constructor({
    routes = [],
    routeUnlockManager = null,
    options = {},
  } = {}) {
    this.routeUnlockManager = routeUnlockManager;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.index = new Map();
    this.documents = new Map();
    this.disposed = false;

    this.setRoutes(routes);
  }

  setRoutes(routes = []) {
    this.assertActive();

    if (!Array.isArray(routes)) {
      throw new TypeError("RouteSearchIndex.setRoutes expects an array.");
    }

    this.index.clear();
    this.documents.clear();

    for (const route of routes) {
      this.addRoute(route);
    }

    return this;
  }

  addRoute(route) {
    this.assertActive();

    if (!route || route.id == null) {
      throw new TypeError("A route with an id is required.");
    }

    this.removeRoute(route.id);

    const document = this.createDocument(route);

    this.documents.set(route.id, document);

    for (const token of document.tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }

      this.index.get(token).add(route.id);
    }

    return this;
  }

  removeRoute(routeId) {
    this.assertActive();

    const document = this.documents.get(routeId);

    if (!document) return false;

    for (const token of document.tokens) {
      const routeIds = this.index.get(token);

      if (!routeIds) continue;

      routeIds.delete(routeId);

      if (routeIds.size === 0) {
        this.index.delete(token);
      }
    }

    this.documents.delete(routeId);

    return true;
  }

  createDocument(route) {
    const fields = {
      id: String(route.id),
      name: String(route.name ?? route.title ?? route.id),
      description: String(route.description ?? ""),
      district: String(route.district ?? route.region ?? ""),
      difficulty: String(route.difficulty ?? "normal"),
      startPoint: String(route.startPoint ?? ""),
      endPoint: String(route.endPoint ?? ""),
      tags: Array.isArray(route.tags)
        ? route.tags.map(String)
        : [],
    };

    const searchableText = [
      fields.id,
      fields.name,
      fields.description,
      fields.district,
      fields.difficulty,
      fields.startPoint,
      fields.endPoint,
      ...fields.tags,
    ]
      .join(" ")
      .toLowerCase();

    return {
      id: route.id,
      route: { ...route },
      fields,
      searchableText,
      tokens: [...new Set(this.tokenize(searchableText))],
    };
  }

  tokenize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  search(query, options = {}) {
    this.assertActive();

    const settings = {
      ...this.options,
      ...options,
    };

    const normalizedQuery = String(query ?? "").trim().toLowerCase();

    if (normalizedQuery.length < settings.minQueryLength) {
      return [];
    }

    const queryTokens = [...new Set(this.tokenize(normalizedQuery))];

    if (queryTokens.length === 0) {
      return [];
    }

    const scores = new Map();

    for (const token of queryTokens) {
      const exactMatches = this.index.get(token);

      if (exactMatches) {
        for (const routeId of exactMatches) {
          scores.set(
            routeId,
            (scores.get(routeId) ?? 0) + 10,
          );
        }
      }

      for (const [indexedToken, routeIds] of this.index.entries()) {
        if (indexedToken === token) continue;

        let score = 0;

        if (indexedToken.startsWith(token)) {
          score = 5;
        } else if (
          settings.fuzzySearch &&
          token.length >= 4 &&
          indexedToken.length >= 4 &&
          this.levenshteinDistance(token, indexedToken) <= 1
        ) {
          score = 2;
        }

        if (score === 0) continue;

        for (const routeId of routeIds) {
          scores.set(
            routeId,
            (scores.get(routeId) ?? 0) + score,
          );
        }
      }
    }

    const normalizedPhrase = this.normalizeText(normalizedQuery);

    for (const [routeId, document] of this.documents.entries()) {
      const normalizedText = this.normalizeText(
        document.searchableText,
      );

      if (normalizedText.includes(normalizedPhrase)) {
        scores.set(routeId, (scores.get(routeId) ?? 0) + 8);
      }

      if (
        this.normalizeText(document.fields.name) === normalizedPhrase
      ) {
        scores.set(routeId, (scores.get(routeId) ?? 0) + 15);
      }
    }

    const results = [];

    for (const [routeId, score] of scores.entries()) {
      const document = this.documents.get(routeId);

      if (!document) continue;

      const unlocked = this.isUnlocked(document.route);

      if (!settings.includeLocked && !unlocked) {
        continue;
      }

      results.push({
        route: { ...document.route },
        routeId,
        score,
        unlocked,
        matchedFields: this.getMatchedFields(
          document,
          queryTokens,
        ),
      });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      return String(a.routeId).localeCompare(String(b.routeId));
    });

    const limit = Math.max(
      1,
      Math.floor(Number(settings.maxResults) || 50),
    );

    return results.slice(0, limit);
  }

  searchByDistrict(district, options = {}) {
    this.assertActive();

    const normalizedDistrict = this.normalizeText(district);

    if (!normalizedDistrict) return [];

    return this.getAllDocuments()
      .filter((document) => {
        return (
          this.normalizeText(document.fields.district) ===
          normalizedDistrict
        );
      })
      .filter((document) => {
        return (
          options.includeLocked !== false ||
          this.isUnlocked(document.route)
        );
      })
      .map((document) => ({
        route: { ...document.route },
        routeId: document.id,
        unlocked: this.isUnlocked(document.route),
      }));
  }

  searchByDifficulty(difficulty, options = {}) {
    this.assertActive();

    const normalizedDifficulty = this.normalizeText(difficulty);

    if (!normalizedDifficulty) return [];

    return this.getAllDocuments()
      .filter(
        (document) =>
          this.normalizeText(document.fields.difficulty) ===
          normalizedDifficulty,
      )
      .filter((document) => {
        return (
          options.includeLocked !== false ||
          this.isUnlocked(document.route)
        );
      })
      .map((document) => ({
        route: { ...document.route },
        routeId: document.id,
        unlocked: this.isUnlocked(document.route),
      }));
  }

  getMatchedFields(document, queryTokens) {
    const matchedFields = [];

    for (const [fieldName, value] of Object.entries(document.fields)) {
      if (fieldName === "id" || fieldName === "tags") {
        // These fields are searchable, but are not displayed as details.
      }

      const fieldText = Array.isArray(value)
        ? value.join(" ")
        : String(value ?? "");

      const tokens = this.tokenize(fieldText);

      if (
        queryTokens.some((queryToken) =>
          tokens.some(
            (token) =>
              token === queryToken ||
              token.startsWith(queryToken),
          ),
        )
      ) {
        matchedFields.push(fieldName);
      }
    }

    return matchedFields;
  }

  getAllDocuments() {
    return [...this.documents.values()];
  }

  getRoute(routeId) {
    this.assertActive();

    const document = this.documents.get(routeId);

    return document ? { ...document.route } : null;
  }

  getRouteCount() {
    this.assertActive();
    return this.documents.size;
  }

  getIndexedTokenCount() {
    this.assertActive();
    return this.index.size;
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

    return Number(route.requiredLevel ?? route.unlockLevel ?? 1) <= 1;
  }

  normalizeText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previous = Array.from(
      { length: b.length + 1 },
      (_, index) => index,
    );

    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];

      for (let j = 1; j <= b.length; j += 1) {
        const substitutionCost =
          a[i - 1] === b[j - 1] ? 0 : 1;

        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + substitutionCost,
        );
      }

      previous = current;
    }

    return previous[b.length];
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteSearchIndex has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.index.clear();
    this.documents.clear();
    this.routeUnlockManager = null;
    this.disposed = true;
  }
}

export default RouteSearchIndex;