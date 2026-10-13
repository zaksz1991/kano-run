const DEFAULT_HISTORY_LIMIT = 100;

export class AlertDeliveryQueueHealthReport {
  constructor({
    health,
    historyLimit = DEFAULT_HISTORY_LIMIT,
    clock = () => Date.now(),
  } = {}) {
    if (!health) {
      throw new Error("A health monitor is required.");
    }

    this.health = health;
    this.historyLimit = Math.max(1, Number(historyLimit) || 100);
    this.clock = clock;
    this.reports = [];
    this.listeners = new Set();
  }

  generate({ includeHistory = true } = {}) {
    const current =
      this.health.getLastCheck?.() ??
      this.health.check?.() ??
      null;

    if (!current) {
      throw new Error("Unable to obtain health status.");
    }

    const history = includeHistory
      ? this.health.getHistory?.({
          limit: this.historyLimit,
        }) ?? []
      : [];

    const report = {
      id: this.#createId(),
      version: 1,
      generatedAt: new Date(this.clock()).toISOString(),
      status: current.status ?? "unknown",
      summary: {
        totalJobs: current.totalJobs ?? 0,
        issues: current.issues?.length ?? 0,
        pending: current.counts?.pending ?? 0,
        processing: current.counts?.processing ?? 0,
        completed: current.counts?.completed ?? 0,
        failed: current.counts?.failed ?? 0,
      },
      issues: (current.issues ?? []).map((issue) => ({
        code: issue.code ?? "UNKNOWN",
        severity: issue.severity ?? "info",
        message: issue.message ?? "",
      })),
      components: current.components ?? {},
      history: history.map((item) => ({
        checkedAt: item.checkedAt ?? null,
        status: item.status ?? "unknown",
        totalJobs: item.totalJobs ?? 0,
        issueCount: item.issues?.length ?? 0,
      })),
    };

    this.reports.push(report);

    if (this.reports.length > this.historyLimit) {
      this.reports.splice(
        0,
        this.reports.length - this.historyLimit,
      );
    }

    this.#emit({
      type: "report_generated",
      report,
    });

    return report;
  }

  exportJSON(options = {}) {
    const report = this.generate(options);

    return JSON.stringify(report, null, 2);
  }

  exportCSV() {
    const report = this.generate();
    const rows = [
      ["section", "timestamp", "status", "code", "severity", "message"],
      [
        "summary",
        report.generatedAt,
        report.status,
        "",
        "",
        `Total jobs: ${report.summary.totalJobs}`,
      ],
      ...report.issues.map((issue) => [
        "issue",
        report.generatedAt,
        report.status,
        issue.code,
        issue.severity,
        issue.message,
      ]),
      ...report.history.map((item) => [
        "history",
        item.checkedAt,
        item.status,
        "",
        "",
        `Total jobs: ${item.totalJobs}; Issues: ${item.issueCount}`,
      ]),
    ];

    return rows
      .map((row) => row.map((value) => this.#csvCell(value)).join(","))
      .join("\r\n");
  }

  getReports({ limit = this.historyLimit } = {}) {
    const safeLimit = Math.max(1, Number(limit) || this.historyLimit);
    return this.reports.slice(-safeLimit);
  }

  getLatestReport() {
    return this.reports.at(-1) ?? null;
  }

  clearReports() {
    this.reports = [];
    this.#emit({ type: "reports_cleared" });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #createId() {
    return `health-report-${this.clock()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  #csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Keep report generation independent of listener failures.
      }
    }
  }
}

export default AlertDeliveryQueueHealthReport;