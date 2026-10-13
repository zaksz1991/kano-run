import { Logger } from "./Logger.js";

const log = new Logger("RouteStatisticsExporter");

export class RouteStatisticsExporter {
  constructor({
    statisticsManager,
    documentRef = globalThis.document,
    now = () => new Date(),
    appName = "Kano Run — Adaidaita Sahu",
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.document = documentRef;
    this.now = now;
    this.appName = appName;
    this.disposed = false;
  }

  exportJSON() {
    this.ensureActive();

    const report = this.createReport();
    const filename = this.createFilename("json");

    return this.download(
      JSON.stringify(report, null, 2),
      filename,
      "application/json;charset=utf-8"
    );
  }

  exportCSV() {
    this.ensureActive();

    const report = this.createReport();
    const rows = [
      ["Kano Run Statistics Report"],
      ["Generated At", report.generatedAt],
      ["Application", report.application],
      [],
      ["Summary"],
      ["Metric", "Value"],
      ...Object.entries(report.summary),
      [],
      ["Recent Runs"],
      [
        "Route",
        "Date",
        "Score",
        "Distance",
        "Passengers",
        "Earnings",
        "Crashes",
        "Result",
      ],
      ...report.history.map((run) => [
        run.route,
        run.date,
        run.score,
        run.distance,
        run.passengers,
        run.earnings,
        run.crashes,
        run.result,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => this.escapeCSV(value)).join(","))
      .join("\r\n");

    return this.download(
      `\uFEFF${csv}`,
      this.createFilename("csv"),
      "text/csv;charset=utf-8"
    );
  }

  createReport() {
    const summary = this.getSummary();
    const history = this.getHistory();

    return {
      application: this.appName,
      generatedAt: this.now().toISOString(),
      summary: this.normalizeSummary(summary),
      history: history.map((run) => this.normalizeRun(run)),
    };
  }

  getSummary() {
    if (!this.statisticsManager) {
      return {};
    }

    try {
      if (typeof this.statisticsManager.getStatistics === "function") {
        return this.statisticsManager.getStatistics() || {};
      }

      if (typeof this.statisticsManager.getSummary === "function") {
        return this.statisticsManager.getSummary() || {};
      }

      if (typeof this.statisticsManager.getStats === "function") {
        return this.statisticsManager.getStats() || {};
      }

      if (typeof this.statisticsManager.getAll === "function") {
        return this.statisticsManager.getAll() || {};
      }
    } catch (error) {
      log.error("Could not retrieve statistics summary.", error);
    }

    return {};
  }

  getHistory() {
    if (!this.statisticsManager) {
      return [];
    }

    try {
      if (typeof this.statisticsManager.getHistory === "function") {
        const result = this.statisticsManager.getHistory();

        if (Array.isArray(result)) {
          return result;
        }

        if (Array.isArray(result?.items)) {
          return result.items;
        }
      }

      if (typeof this.statisticsManager.getRecentRuns === "function") {
        const result = this.statisticsManager.getRecentRuns();
        return Array.isArray(result) ? result : [];
      }
    } catch (error) {
      log.error("Could not retrieve route history.", error);
    }

    return [];
  }

  normalizeSummary(summary) {
    const output = {};

    for (const [key, value] of Object.entries(summary)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        output[key] = value;
      } else if (value instanceof Date) {
        output[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        output[key] = value.length;
      } else if (typeof value === "object") {
        output[key] = "[object]";
      } else {
        output[key] = String(value);
      }
    }

    return output;
  }

  normalizeRun(run = {}) {
    const route = this.pick(run, [
      "routeName",
      "route_name",
      "routeTitle",
      "route",
      "routeId",
      "route_id",
    ]);

    const date = this.pick(run, [
      "completedAt",
      "completed_at",
      "timestamp",
      "date",
      "createdAt",
      "created_at",
    ]);

    return {
      route: this.toText(route, "Unknown route"),
      date: this.normalizeDate(date),
      score: this.toNumber(
        this.pick(run, ["score", "points", "totalScore"])
      ),
      distance: this.toNumber(
        this.pick(run, ["distance", "distanceKm", "distance_km"])
      ),
      passengers: this.toNumber(
        this.pick(run, [
          "passengers",
          "passengerCount",
          "passenger_count",
          "totalPassengers",
        ])
      ),
      earnings: this.toNumber(
        this.pick(run, [
          "earnings",
          "fare",
          "totalFare",
          "total_earnings",
        ])
      ),
      crashes: this.toNumber(
        this.pick(run, ["crashes", "crashCount", "crash_count"])
      ),
      result: this.toText(
        this.pick(run, ["result", "status", "outcome"]),
        run?.completed === false ? "Incomplete" : "Completed"
      ),
    };
  }

  pick(object, keys) {
    if (!object || typeof object !== "object") {
      return undefined;
    }

    for (const key of keys) {
      const value = object[key];

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

    return undefined;
  }

  toText(value, fallback = "") {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }

    return String(value);
  }

  toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  normalizeDate(value) {
    if (value === undefined || value === null || value === "") {
      return "";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toISOString();
  }

  escapeCSV(value) {
    if (value === undefined || value === null) {
      return "";
    }

    const text = String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  createFilename(extension) {
    const timestamp = this.now()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d{3}Z$/, "Z");

    return `kano-run-statistics-${timestamp}.${extension}`;
  }

  download(content, filename, mimeType) {
    if (!this.document || !this.document.createElement) {
      throw new Error("File export requires a browser document.");
    }

    const blob = new Blob([content], { type: mimeType });
    const urlApi = globalThis.URL;

    if (!urlApi?.createObjectURL) {
      throw new Error("This browser does not support file downloads.");
    }

    const objectUrl = urlApi.createObjectURL(blob);
    const anchor = this.document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;

    this.document.body.appendChild(anchor);

    try {
      anchor.click();
    } catch (error) {
      log.error("Statistics download failed.", error);
      throw error;
    } finally {
      anchor.remove();
      globalThis.setTimeout(() => {
        urlApi.revokeObjectURL(objectUrl);
      }, 1000);
    }

    return {
      success: true,
      filename,
      bytes: blob.size,
    };
  }

  ensureActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsExporter has been disposed.");
    }
  }

  dispose() {
    this.disposed = true;
    this.statisticsManager = null;
  }
}

export default RouteStatisticsExporter;