import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const DEFAULT_MAX_REPORTS = 200;

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Use JSON fallback.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreReport {
  constructor({
    validator = null,
    restoreManager = null,
    maxReports = DEFAULT_MAX_REPORTS,
    logger = Logger,
  } = {}) {
    this.validator = validator;
    this.restoreManager = restoreManager;
    this.maxReports = Math.max(1, Math.floor(Number(maxReports) || DEFAULT_MAX_REPORTS));
    this.logger = logger;

    this.events = new EventEmitter();
    this.reports = [];
    this.disposed = false;
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  emit(type, payload = {}) {
    this.events.emit("change", {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  generate({
    archive = null,
    restoreResult = null,
    label = "",
    metadata = {},
  } = {}) {
    this.assertActive();

    let validation = null;

    if (archive && this.validator && typeof this.validator.validate === "function") {
      validation = this.validator.validate(archive);
    }

    const restoreStatus =
      isObject(restoreResult) && typeof restoreResult.success === "boolean"
        ? restoreResult.success
          ? "success"
          : "failed"
        : "not_run";

    const report = {
      id: this.createId(),
      generatedAt: Date.now(),
      label: String(label).slice(0, 160),
      status: this.determineStatus(validation, restoreStatus),
      validation: validation
        ? {
            valid: validation.valid,
            errors: [...(validation.errors ?? [])],
            warnings: [...(validation.warnings ?? [])],
          }
        : null,
      restore: restoreResult ? clone(restoreResult) : null,
      summary: this.createSummary(validation, restoreStatus),
      metadata: isObject(metadata) ? clone(metadata) : {},
    };

    this.reports.unshift(report);

    if (this.reports.length > this.maxReports) {
      this.reports.length = this.maxReports;
    }

    this.emit("change", {
      action: "generated",
      report: clone(report),
    });

    return clone(report);
  }

  determineStatus(validation, restoreStatus) {
    if (validation && !validation.valid) return "invalid_archive";
    if (restoreStatus === "failed") return "restore_failed";
    if (restoreStatus === "success") return "restored";
    return "validated";
  }

  createSummary(validation, restoreStatus) {
    if (validation && !validation.valid) {
      return `Validation failed with ${validation.errors.length} error(s).`;
    }

    if (restoreStatus === "success") {
      return "Scheduler data was restored successfully.";
    }

    if (restoreStatus === "failed") {
      return "Scheduler data restoration failed.";
    }

    if (validation) {
      return `Archive validation passed with ${validation.warnings.length} warning(s).`;
    }

    return "Report generated without validation or restore results.";
  }

  createId() {
    return `restore-report-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  get(id) {
    const report = this.reports.find((item) => item.id === String(id));
    return report ? clone(report) : null;
  }

  getAll({ limit = 50, status = null } = {}) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    let results = this.reports;

    if (status !== null) {
      results = results.filter((report) => report.status === String(status));
    }

    return results.slice(0, count).map((report) => clone(report));
  }

  getSummary() {
    const counts = {};

    for (const report of this.reports) {
      counts[report.status] = (counts[report.status] ?? 0) + 1;
    }

    return {
      total: this.reports.length,
      statuses: counts,
      latestReport: this.reports[0] ? clone(this.reports[0]) : null,
    };
  }

  exportData() {
    return {
      version: 1,
      exportedAt: Date.now(),
      reports: this.reports.map((report) => clone(report)),
    };
  }

  importData(data, { replace = true } = {}) {
    this.assertActive();

    if (!isObject(data) || data.version !== 1 || !Array.isArray(data.reports)) {
      throw new TypeError("Invalid restore report archive.");
    }

    const imported = data.reports.filter(
      (report) =>
        isObject(report) &&
        typeof report.id === "string" &&
        typeof report.status === "string",
    ).map((report) => clone(report));

    if (replace) {
      this.reports = imported;
    } else {
      const existingIds = new Set(this.reports.map((report) => report.id));

      for (const report of imported) {
        if (!existingIds.has(report.id)) {
          this.reports.push(report);
          existingIds.add(report.id);
        }
      }
    }

    this.reports.sort((a, b) => b.generatedAt - a.generatedAt);

    if (this.reports.length > this.maxReports) {
      this.reports.length = this.maxReports;
    }

    this.emit("change", {
      action: "imported",
      count: imported.length,
    });

    return imported.length;
  }

  clear() {
    this.assertActive();

    const count = this.reports.length;
    this.reports = [];

    this.emit("change", {
      action: "cleared",
      count,
    });

    return count;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore report manager has been disposed.");
    }
  }

  getStatus() {
    return {
      reportCount: this.reports.length,
      maxReports: this.maxReports,
      validatorAvailable: Boolean(this.validator),
      restoreManagerAvailable: Boolean(this.restoreManager),
      disposed: this.disposed,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.removeAllListeners?.();

    this.logger?.info?.(
      "[SchedulerRestoreReport] Disposed.",
    );
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreReport;