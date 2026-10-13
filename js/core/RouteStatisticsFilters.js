import { Logger } from "./Logger.js";

const log = new Logger("RouteStatisticsFilters");

const DEFAULT_FILTERS = Object.freeze({
  route: "",
  result: "all",
  dateFrom: "",
  dateTo: "",
  minScore: null,
  maxScore: null,
  minDistance: null,
  maxDistance: null,
  sortBy: "date",
  sortDirection: "desc",
});

export class RouteStatisticsFilters {
  constructor({ statisticsManager = null } = {}) {
    this.statisticsManager = statisticsManager;
    this.filters = { ...DEFAULT_FILTERS };
    this.disposed = false;
  }

  getFilters() {
    this.ensureActive();
    return { ...this.filters };
  }

  setFilters(updates = {}) {
    this.ensureActive();

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new TypeError("Filter updates must be an object.");
    }

    const next = { ...this.filters };

    for (const [key, value] of Object.entries(updates)) {
      if (!(key in DEFAULT_FILTERS)) {
        log.warn(`Ignoring unknown statistics filter: ${key}`);
        continue;
      }

      next[key] = value;
    }

    this.filters = this.normalizeFilters(next);
    return this.getFilters();
  }

  setFilter(key, value) {
    return this.setFilters({ [key]: value });
  }

  reset() {
    this.ensureActive();
    this.filters = { ...DEFAULT_FILTERS };
    return this.getFilters();
  }

  normalizeFilters(filters) {
    const normalized = { ...DEFAULT_FILTERS, ...filters };

    normalized.route = this.normalizeText(normalized.route);
    normalized.result = this.normalizeResult(normalized.result);
    normalized.dateFrom = this.normalizeDate(normalized.dateFrom);
    normalized.dateTo = this.normalizeDate(normalized.dateTo);

    normalized.minScore = this.normalizeOptionalNumber(
      normalized.minScore,
      "minScore"
    );

    normalized.maxScore = this.normalizeOptionalNumber(
      normalized.maxScore,
      "maxScore"
    );

    normalized.minDistance = this.normalizeOptionalNumber(
      normalized.minDistance,
      "minDistance"
    );

    normalized.maxDistance = this.normalizeOptionalNumber(
      normalized.maxDistance,
      "maxDistance"
    );

    normalized.sortBy = this.normalizeSortBy(normalized.sortBy);
    normalized.sortDirection =
      normalized.sortDirection === "asc" ? "asc" : "desc";

    if (
      normalized.dateFrom &&
      normalized.dateTo &&
      normalized.dateFrom > normalized.dateTo
    ) {
      [normalized.dateFrom, normalized.dateTo] = [
        normalized.dateTo,
        normalized.dateFrom,
      ];
    }

    if (
      normalized.minScore !== null &&
      normalized.maxScore !== null &&
      normalized.minScore > normalized.maxScore
    ) {
      [normalized.minScore, normalized.maxScore] = [
        normalized.maxScore,
        normalized.minScore,
      ];
    }

    if (
      normalized.minDistance !== null &&
      normalized.maxDistance !== null &&
      normalized.minDistance > normalized.maxDistance
    ) {
      [normalized.minDistance, normalized.maxDistance] = [
        normalized.maxDistance,
        normalized.minDistance,
      ];
    }

    return normalized;
  }

  apply(records = []) {
    this.ensureActive();

    if (!Array.isArray(records)) {
      throw new TypeError("Statistics records must be an array.");
    }

    const filters = this.filters;

    const filtered = records.filter((record) =>
      this.matches(record, filters)
    );

    return this.sort(filtered, filters.sortBy, filters.sortDirection);
  }

  matches(record = {}, filters = this.filters) {
    if (!record || typeof record !== "object") {
      return false;
    }

    const route = this.getValue(record, [
      "routeName",
      "route_name",
      "routeTitle",
      "route",
      "routeId",
      "route_id",
    ]);

    if (
      filters.route &&
      !this.normalizeText(route)
        .toLowerCase()
        .includes(filters.route.toLowerCase())
    ) {
      return false;
    }

    const result = this.normalizeRecordResult(record);

    if (filters.result !== "all" && result !== filters.result) {
      return false;
    }

    const rawDate = this.getValue(record, [
      "completedAt",
      "completed_at",
      "timestamp",
      "date",
      "createdAt",
      "created_at",
    ]);

    const date = this.parseDate(rawDate);

    if (filters.dateFrom) {
      const from = this.parseDate(filters.dateFrom);

      if (!date || !from || date < this.startOfDay(from)) {
        return false;
      }
    }

    if (filters.dateTo) {
      const to = this.parseDate(filters.dateTo);

      if (!date || !to || date > this.endOfDay(to)) {
        return false;
      }
    }

    const score = this.getNumericValue(record, [
      "score",
      "points",
      "totalScore",
    ]);

    if (filters.minScore !== null) {
      if (score === null || score < filters.minScore) {
        return false;
      }
    }

    if (filters.maxScore !== null) {
      if (score === null || score > filters.maxScore) {
        return false;
      }
    }

    const distance = this.getNumericValue(record, [
      "distance",
      "distanceKm",
      "distance_km",
    ]);

    if (filters.minDistance !== null) {
      if (distance === null || distance < filters.minDistance) {
        return false;
      }
    }

    if (filters.maxDistance !== null) {
      if (distance === null || distance > filters.maxDistance) {
        return false;
      }
    }

    return true;
  }

  sort(records, sortBy, direction) {
    const sign = direction === "asc" ? 1 : -1;

    return records.slice().sort((a, b) => {
      const left = this.getSortValue(a, sortBy);
      const right = this.getSortValue(b, sortBy);

      if (left === null && right === null) {
        return 0;
      }

      if (left === null) {
        return 1;
      }

      if (right === null) {
        return -1;
      }

      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right) * sign;
      }

      return (left - right) * sign;
    });
  }

  getSortValue(record, sortBy) {
    switch (sortBy) {
      case "route":
        return this.normalizeText(
          this.getValue(record, [
            "routeName",
            "route_name",
            "routeTitle",
            "route",
            "routeId",
            "route_id",
          ])
        ).toLowerCase();

      case "score":
        return this.getNumericValue(record, [
          "score",
          "points",
          "totalScore",
        ]);

      case "distance":
        return this.getNumericValue(record, [
          "distance",
          "distanceKm",
          "distance_km",
        ]);

      case "earnings":
        return this.getNumericValue(record, [
          "earnings",
          "fare",
          "totalFare",
          "total_earnings",
        ]);

      case "crashes":
        return this.getNumericValue(record, [
          "crashes",
          "crashCount",
          "crash_count",
        ]);

      case "date":
      default: {
        const value = this.getValue(record, [
          "completedAt",
          "completed_at",
          "timestamp",
          "date",
          "createdAt",
          "created_at",
        ]);

        const date = this.parseDate(value);
        return date ? date.getTime() : null;
      }
    }
  }

  getValue(record, keys) {
    for (const key of keys) {
      const value = record?.[key];

      if (value === undefined || value === null) {
        continue;
      }

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return value;
      }

      if (typeof value === "object") {
        if (typeof value.name === "string") {
          return value.name;
        }

        if (typeof value.title === "string") {
          return value.title;
        }

        if (typeof value.id === "string") {
          return value.id;
        }
      }
    }

    return null;
  }

  getNumericValue(record, keys) {
    const value = this.getValue(record, keys);

    if (value === null || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  normalizeRecordResult(record) {
    const result = this.getValue(record, [
      "result",
      "status",
      "outcome",
    ]);

    if (record?.completed === false || record?.success === false) {
      return "incomplete";
    }

    if (record?.completed === true || record?.success === true) {
      return "completed";
    }

    const value = this.normalizeText(result).toLowerCase();

    if (
      ["failed", "failure", "incomplete", "abandoned", "game_over"].includes(
        value
      )
    ) {
      return "incomplete";
    }

    if (
      ["completed", "complete", "success", "successful", "finished"].includes(
        value
      )
    ) {
      return "completed";
    }

    return "completed";
  }

  normalizeResult(value) {
    const result = this.normalizeText(value).toLowerCase();

    if (["all", "completed", "incomplete"].includes(result)) {
      return result;
    }

    return "all";
  }

  normalizeSortBy(value) {
    const allowed = [
      "date",
      "route",
      "score",
      "distance",
      "earnings",
      "crashes",
    ];

    return allowed.includes(value) ? value : "date";
  }

  normalizeOptionalNumber(value, fieldName) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new TypeError(`${fieldName} must be a finite number or null.`);
    }

    if (number < 0) {
      throw new RangeError(`${fieldName} cannot be negative.`);
    }

    return number;
  }

  normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  normalizeDate(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const date = this.parseDate(value);

    if (!date) {
      throw new TypeError(`Invalid date filter: ${value}`);
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  parseDate(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const date = value instanceof Date ? new Date(value) : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  getAvailableRoutes(records = []) {
    const routes = new Set();

    for (const record of records) {
      const route = this.getValue(record, [
        "routeName",
        "route_name",
        "routeTitle",
        "route",
        "routeId",
        "route_id",
      ]);

      const name = this.normalizeText(route);

      if (name) {
        routes.add(name);
      }
    }

    return [...routes].sort((a, b) => a.localeCompare(b));
  }

  getResultCounts(records = []) {
    const counts = {
      all: records.length,
      completed: 0,
      incomplete: 0,
    };

    for (const record of records) {
      counts[this.normalizeRecordResult(record)] += 1;
    }

    return counts;
  }

  exportFilters() {
    this.ensureActive();

    return {
      version: 1,
      filters: this.getFilters(),
    };
  }

  importFilters(data) {
    this.ensureActive();

    const filters = data?.filters ?? data;

    if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
      throw new TypeError("Invalid statistics filter data.");
    }

    return this.setFilters(filters);
  }

  ensureActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsFilters has been disposed.");
    }
  }

  dispose() {
    this.disposed = true;
    this.statisticsManager = null;
    this.filters = { ...DEFAULT_FILTERS };
  }
}

export { DEFAULT_FILTERS };
export default RouteStatisticsFilters;