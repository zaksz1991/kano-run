export default class AlertQueueDashboardDiagnosticsStore {
  constructor({
    storage = null,
    storageKey = "kano-run-alert-diagnostics-store",
    maxReports = 50,
    maxIssuesPerReport = 500,
    version = 1,
    onError = null,
  } = {}) {
    this.storage = storage ?? this.getDefaultStorage();
    this.storageKey = storageKey;
    this.maxReports = Math.max(1, Number(maxReports) || 50);
    this.maxIssuesPerReport = Math.max(
      1,
      Number(maxIssuesPerReport) || 500
    );
    this.version = version;
    this.onError =
      typeof onError === "function" ? onError : null;

    this.listeners = new Set();
    this.cache = null;
    this.destroyed = false;
  }

  save(report) {
    this.assertActive();

    if (!report || typeof report !== "object") {
      throw new TypeError("A valid diagnostics report is required.");
    }

    const normalized = this.normalizeReport(report);

    if (!normalized.id) {
      normalized.id = this.createId();
    }

    const reports = this.getReports();
    const existingIndex = reports.findIndex(
      (item) => item.id === normalized.id
    );

    if (existingIndex >= 0) {
      reports[existingIndex] = normalized;
    } else {
      reports.push(normalized);
    }

    const limited = reports.slice(-this.maxReports);

    const payload = {
      version: this.version,
      updatedAt: this.now(),
      reports: limited,
    };

    if (this.storage) {
      try {
        this.storage.setItem(
          this.storageKey,
          JSON.stringify(payload)
        );
      } catch (error) {
        this.handleError("save", error);
        return {
          success: false,
          report: normalized,
          error: this.errorMessage(error),
        };
      }
    }

    this.cache = payload;
    this.notify({
      type: "saved",
      report: normalized,
      count: limited.length,
    });

    return {
      success: true,
      report: this.clone(normalized),
      count: limited.length,
    };
  }

  saveMany(reports) {
    this.assertActive();

    if (!Array.isArray(reports)) {
      throw new TypeError("Reports must be an array.");
    }

    const current = this.getReports();
    const byId = new Map(
      current.map((report) => [report.id, report])
    );

    for (const report of reports) {
      if (!report || typeof report !== "object") {
        continue;
      }

      const normalized = this.normalizeReport(report);

      if (!normalized.id) {
        normalized.id = this.createId();
      }

      byId.set(normalized.id, normalized);
    }

    const merged = [...byId.values()].slice(-this.maxReports);

    const payload = {
      version: this.version,
      updatedAt: this.now(),
      reports: merged,
    };

    if (!this.writePayload(payload)) {
      return {
        success: false,
        count: current.length,
      };
    }

    this.cache = payload;
    this.notify({
      type: "saved_many",
      count: merged.length,
    });

    return {
      success: true,
      count: merged.length,
    };
  }

  getReports({
    limit = this.maxReports,
    status = null,
    severity = null,
    component = null,
    search = "",
    newestFirst = true,
  } = {}) {
    this.assertActive();

    const payload = this.readPayload();

    if (!payload) {
      return [];
    }

    let reports = payload.reports.map((report) =>
      this.clone(report)
    );

    if (status) {
      reports = reports.filter(
        (report) => report.status === status
      );
    }

    if (severity) {
      reports = reports.filter((report) =>
        report.issues.some(
          (issue) => issue.severity === severity
        )
      );
    }

    if (component) {
      const target = String(component).toLowerCase();

      reports = reports.filter((report) =>
        report.issues.some(
          (issue) =>
            String(issue.component).toLowerCase() === target
        )
      );
    }

    if (search) {
      const query = String(search).trim().toLowerCase();

      reports = reports.filter((report) =>
        this.searchableText(report).includes(query)
      );
    }

    reports.sort((a, b) => {
      const aTime = Date.parse(a.completedAt) || 0;
      const bTime = Date.parse(b.completedAt) || 0;

      return newestFirst
        ? bTime - aTime
        : aTime - bTime;
    });

    const count = Math.max(
      0,
      Math.floor(Number(limit) || 0)
    );

    return reports.slice(0, count);
  }

  getReport(id) {
    this.assertActive();

    if (!id) {
      return null;
    }

    const report = this.getReports().find(
      (item) => item.id === id
    );

    return report ? this.clone(report) : null;
  }

  getLatestReport() {
    const reports = this.getReports({ limit: 1 });
    return reports[0] ?? null;
  }

  getReportsByStatus() {
    const summary = {
      healthy: 0,
      warning: 0,
      error: 0,
      other: 0,
      total: 0,
    };

    for (const report of this.getReports()) {
      summary.total += 1;

      if (report.status in summary && report.status !== "total") {
        summary[report.status] += 1;
      } else {
        summary.other += 1;
      }
    }

    return summary;
  }

  getIssueSummary() {
    const summary = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      byComponent: {},
      byCode: {},
    };

    for (const report of this.getReports()) {
      for (const issue of report.issues) {
        summary.total += 1;

        if (issue.severity === "error") {
          summary.errors += 1;
        } else if (issue.severity === "warning") {
          summary.warnings += 1;
        } else {
          summary.info += 1;
        }

        const component = issue.component || "general";
        const code = issue.code || "UNKNOWN";

        summary.byComponent[component] =
          (summary.byComponent[component] ?? 0) + 1;

        summary.byCode[code] =
          (summary.byCode[code] ?? 0) + 1;
      }
    }

    return summary;
  }

  deleteReport(id) {
    this.assertActive();

    const reports = this.getReports();
    const filtered = reports.filter(
      (report) => report.id !== id
    );

    if (filtered.length === reports.length) {
      return false;
    }

    const payload = {
      version: this.version,
      updatedAt: this.now(),
      reports: filtered,
    };

    if (!this.writePayload(payload)) {
      return false;
    }

    this.cache = payload;
    this.notify({
      type: "deleted",
      id,
      count: filtered.length,
    });

    return true;
  }

  clear() {
    this.assertActive();

    const previousCount = this.getReports().length;

    const payload = {
      version: this.version,
      updatedAt: this.now(),
      reports: [],
    };

    if (!this.writePayload(payload)) {
      return false;
    }

    this.cache = payload;
    this.notify({
      type: "cleared",
      previousCount,
    });

    return true;
  }

  hasReports() {
    return this.getReports({ limit: 1 }).length > 0;
  }

  getMetadata() {
    const payload = this.readPayload();
    const reports = payload?.reports ?? [];

    return {
      storageKey: this.storageKey,
      version: payload?.version ?? this.version,
      updatedAt: payload?.updatedAt ?? null,
      reportCount: reports.length,
      maxReports: this.maxReports,
      storageAvailable: Boolean(this.storage),
      destroyed: this.destroyed,
    };
  }

  exportJSON({ pretty = true, filters = {} } = {}) {
    const payload = {
      exportedAt: this.now(),
      metadata: this.getMetadata(),
      summary: this.getIssueSummary(),
      reports: this.getReports(filters),
    };

    return JSON.stringify(
      payload,
      null,
      pretty ? 2 : 0
    );
  }

  exportCSV() {
    const rows = [
      [
        "reportId",
        "status",
        "completedAt",
        "durationMs",
        "issueCount",
        "severity",
        "component",
        "code",
        "message",
      ],
    ];

    for (const report of this.getReports()) {
      if (report.issues.length === 0) {
        rows.push([
          report.id,
          report.status,
          report.completedAt,
          report.durationMs,
          0,
          "",
          "",
          "",
          "",
        ]);

        continue;
      }

      for (const issue of report.issues) {
        rows.push([
          report.id,
          report.status,
          report.completedAt,
          report.durationMs,
          report.issues.length,
          issue.severity,
          issue.component,
          issue.code,
          issue.message,
        ]);
      }
    }

    return rows
      .map((row) => row.map((value) => this.csvCell(value)).join(","))
      .join("\r\n");
  }

  downloadJSON(filename = "kano-run-diagnostics-history.json") {
    return this.download(
      this.exportJSON(),
      filename,
      "application/json;charset=utf-8"
    );
  }

  downloadCSV(filename = "kano-run-diagnostics-history.csv") {
    return this.download(
      this.exportCSV(),
      filename,
      "text/csv;charset=utf-8"
    );
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Subscriber must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  refresh() {
    this.assertActive();
    this.cache = null;

    const reports = this.getReports();

    this.notify({
      type: "refreshed",
      count: reports.length,
    });

    return reports;
  }

  readPayload() {
    if (this.cache) {
      return this.clone(this.cache);
    }

    if (!this.storage) {
      this.cache = {
        version: this.version,
        updatedAt: this.now(),
        reports: [],
      };

      return this.clone(this.cache);
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        this.cache = {
          version: this.version,
          updatedAt: this.now(),
          reports: [],
        };

        return this.clone(this.cache);
      }

      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.reports)
      ) {
        throw new Error("Stored diagnostics data is invalid.");
      }

      const payload = {
        version: Number(parsed.version) || this.version,
        updatedAt: parsed.updatedAt || this.now(),
        reports: parsed.reports
          .filter(
            (report) =>
              report && typeof report === "object"
          )
          .map((report) => this.normalizeReport(report))
          .slice(-this.maxReports),
      };

      this.cache = payload;

      return this.clone(payload);
    } catch (error) {
      this.handleError("read", error);

      return {
        version: this.version,
        updatedAt: this.now(),
        reports: [],
      };
    }
  }

  writePayload(payload) {
    if (!this.storage) {
      this.cache = this.clone(payload);
      return true;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(payload)
      );

      return true;
    } catch (error) {
      this.handleError("write", error);
      return false;
    }
  }

  normalizeReport(report) {
    const issues = Array.isArray(report.issues)
      ? report.issues
          .slice(0, this.maxIssuesPerReport)
          .map((issue) => ({
            id: String(issue?.id ?? this.createId()),
            component: String(issue?.component ?? "general"),
            severity: this.normalizeSeverity(issue?.severity),
            code: String(issue?.code ?? "UNKNOWN"),
            message: String(issue?.message ?? ""),
            metadata: this.safeObject(issue?.metadata),
            timestamp: this.normalizeDate(issue?.timestamp),
          }))
      : [];

    const checks = Array.isArray(report.checks)
      ? report.checks.map((check) => ({
          name: String(check?.name ?? "unknown"),
          status: String(check?.status ?? "unknown"),
          details: this.safeObject(check?.details),
        }))
      : [];

    const summary = {
      total: issues.length,
      errors: issues.filter(
        (issue) => issue.severity === "error"
      ).length,
      warnings: issues.filter(
        (issue) => issue.severity === "warning"
      ).length,
      info: issues.filter(
        (issue) => issue.severity === "info"
      ).length,
    };

    return {
      id: String(report.id ?? ""),
      name: String(report.name ?? "Dashboard Diagnostics"),
      version: Number(report.version) || 1,
      status: this.normalizeStatus(report.status, summary),
      summary,
      issues,
      checks,
      startedAt: this.normalizeDate(report.startedAt),
      completedAt: this.normalizeDate(report.completedAt),
      durationMs: Math.max(
        0,
        Number(report.durationMs) || 0
      ),
      runCount: Math.max(
        0,
        Number(report.runCount) || 0
      ),
    };
  }

  normalizeSeverity(severity) {
    return ["error", "warning", "info"].includes(severity)
      ? severity
      : "info";
  }

  normalizeStatus(status, summary) {
    if (["healthy", "warning", "error"].includes(status)) {
      return status;
    }

    if (summary.errors > 0) {
      return "error";
    }

    if (summary.warnings > 0) {
      return "warning";
    }

    return "healthy";
  }

  normalizeDate(value) {
    if (!value) {
      return this.now();
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? this.now()
      : date.toISOString();
  }

  safeObject(value) {
    if (!value || typeof value !== "object") {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return {};
    }
  }

  searchableText(report) {
    const issueText = report.issues
      .map((issue) =>
        [
          issue.component,
          issue.severity,
          issue.code,
          issue.message,
        ].join(" ")
      )
      .join(" ");

    return [
      report.id,
      report.name,
      report.status,
      report.completedAt,
      issueText,
    ]
      .join(" ")
      .toLowerCase();
  }

  csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  download(content, filename, mimeType) {
    if (
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof Blob === "undefined"
    ) {
      return false;
    }

    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      return true;
    } catch (error) {
      this.handleError("download", error);
      return false;
    }
  }

  notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.handleError("subscriber", error);
      }
    }
  }

  handleError(operation, error) {
    if (this.onError) {
      try {
        this.onError({
          operation,
          message: this.errorMessage(error),
          timestamp: this.now(),
        });
      } catch {
        // Error handlers must not interrupt storage operations.
      }
    }
  }

  getDefaultStorage() {
    try {
      if (typeof globalThis.localStorage !== "undefined") {
        return globalThis.localStorage;
      }
    } catch {
      // Storage can be blocked by browser privacy settings.
    }

    return null;
  }

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  createId() {
    return `diag-store-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  now() {
    return new Date().toISOString();
  }

  errorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error ?? "Unknown error");
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error(
        "AlertQueueDashboardDiagnosticsStore has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.listeners.clear();
    this.cache = null;
    this.destroyed = true;
  }
}