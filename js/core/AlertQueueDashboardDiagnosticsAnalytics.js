export default class AlertQueueDashboardDiagnosticsAnalytics {
  constructor({
    store = null,
    diagnostics = null,
    maxSnapshots = 500,
    retentionDays = 30,
    clock = () => Date.now(),
  } = {}) {
    this.store = store;
    this.diagnostics = diagnostics;
    this.maxSnapshots = Math.max(10, Number(maxSnapshots) || 500);
    this.retentionDays = Math.max(1, Number(retentionDays) || 30);
    this.clock = typeof clock === "function" ? clock : () => Date.now();

    this.snapshots = [];
    this.listeners = new Set();
    this.unsubscribeStore = null;
    this.destroyed = false;

    if (this.store && typeof this.store.subscribe === "function") {
      this.unsubscribeStore = this.store.subscribe((event) => {
        this.handleStoreEvent(event);
      });
    }
  }

  record(report) {
    this.assertActive();

    if (!report || typeof report !== "object") {
      throw new TypeError("A diagnostics report is required.");
    }

    const snapshot = this.createSnapshot(report);

    this.snapshots.push(snapshot);
    this.pruneSnapshots();

    this.notify({
      type: "snapshot_recorded",
      snapshot: this.clone(snapshot),
    });

    return this.clone(snapshot);
  }

  recordLatest() {
    this.assertActive();

    if (
      !this.diagnostics ||
      typeof this.diagnostics.getLastReport !== "function"
    ) {
      return null;
    }

    const report = this.diagnostics.getLastReport();

    return report ? this.record(report) : null;
  }

  createSnapshot(report) {
    const issues = Array.isArray(report.issues)
      ? report.issues
      : [];

    const completedAt = this.normalizeTimestamp(
      report.completedAt
    );

    return {
      id: this.createId(),
      reportId: String(report.id ?? ""),
      timestamp: completedAt,
      status: this.normalizeStatus(report.status),
      durationMs: Math.max(0, Number(report.durationMs) || 0),
      total: issues.length,
      errors: issues.filter(
        (issue) => issue?.severity === "error"
      ).length,
      warnings: issues.filter(
        (issue) => issue?.severity === "warning"
      ).length,
      info: issues.filter(
        (issue) => issue?.severity === "info"
      ).length,
      components: this.countBy(
        issues,
        (issue) => issue?.component || "general"
      ),
      issueCodes: this.countBy(
        issues,
        (issue) => issue?.code || "UNKNOWN"
      ),
    };
  }

  getSnapshots({
    from = null,
    to = null,
    limit = this.maxSnapshots,
    newestFirst = false,
  } = {}) {
    this.assertActive();

    const start = from ? new Date(from).getTime() : -Infinity;
    const end = to ? new Date(to).getTime() : Infinity;

    let results = this.snapshots.filter((snapshot) => {
      const timestamp = Date.parse(snapshot.timestamp);

      return (
        !Number.isNaN(timestamp) &&
        timestamp >= start &&
        timestamp <= end
      );
    });

    results.sort((a, b) => {
      const difference =
        Date.parse(a.timestamp) - Date.parse(b.timestamp);

      return newestFirst ? -difference : difference;
    });

    const count = Math.max(
      0,
      Math.floor(Number(limit) || 0)
    );

    return results.slice(-count).map((snapshot) =>
      this.clone(snapshot)
    );
  }

  getOverview({ from = null, to = null } = {}) {
    const snapshots = this.getSnapshots({
      from,
      to,
      limit: this.maxSnapshots,
    });

    const overview = {
      sampleCount: snapshots.length,
      healthyRuns: 0,
      warningRuns: 0,
      errorRuns: 0,
      totalIssues: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      averageDurationMs: 0,
      latestStatus: "unknown",
      latestRunAt: null,
      earliestRunAt: null,
      issueRate: 0,
    };

    if (snapshots.length === 0) {
      return overview;
    }

    let totalDuration = 0;

    for (const snapshot of snapshots) {
      if (snapshot.status === "healthy") {
        overview.healthyRuns += 1;
      } else if (snapshot.status === "warning") {
        overview.warningRuns += 1;
      } else if (snapshot.status === "error") {
        overview.errorRuns += 1;
      }

      overview.totalIssues += snapshot.total;
      overview.errors += snapshot.errors;
      overview.warnings += snapshot.warnings;
      overview.info += snapshot.info;
      totalDuration += snapshot.durationMs;
    }

    const latest = snapshots[snapshots.length - 1];
    const earliest = snapshots[0];

    overview.averageDurationMs = Math.round(
      totalDuration / snapshots.length
    );
    overview.latestStatus = latest.status;
    overview.latestRunAt = latest.timestamp;
    overview.earliestRunAt = earliest.timestamp;
    overview.issueRate = Number(
      (
        snapshots.filter((snapshot) => snapshot.total > 0).length /
        snapshots.length
      ).toFixed(4)
    );

    return overview;
  }

  getTrend({
    metric = "total",
    from = null,
    to = null,
    bucket = "day",
  } = {}) {
    const allowedMetrics = [
      "total",
      "errors",
      "warnings",
      "info",
      "durationMs",
    ];

    if (!allowedMetrics.includes(metric)) {
      throw new RangeError(`Unsupported trend metric: ${metric}`);
    }

    const snapshots = this.getSnapshots({
      from,
      to,
      limit: this.maxSnapshots,
    });

    const groups = new Map();

    for (const snapshot of snapshots) {
      const key = this.getBucketKey(snapshot.timestamp, bucket);

      if (!groups.has(key)) {
        groups.set(key, {
          bucket: key,
          samples: 0,
          total: 0,
          errors: 0,
          warnings: 0,
          info: 0,
          durationMs: 0,
          healthyRuns: 0,
          warningRuns: 0,
          errorRuns: 0,
        });
      }

      const group = groups.get(key);

      group.samples += 1;
      group.total += snapshot.total;
      group.errors += snapshot.errors;
      group.warnings += snapshot.warnings;
      group.info += snapshot.info;
      group.durationMs += snapshot.durationMs;

      if (snapshot.status === "healthy") {
        group.healthyRuns += 1;
      } else if (snapshot.status === "warning") {
        group.warningRuns += 1;
      } else if (snapshot.status === "error") {
        group.errorRuns += 1;
      }
    }

    return [...groups.values()]
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((group) => ({
        bucket: group.bucket,
        samples: group.samples,
        metric,
        value:
          metric === "durationMs"
            ? Math.round(group.durationMs / group.samples)
            : group[metric],
        totals: {
          issues: group.total,
          errors: group.errors,
          warnings: group.warnings,
          info: group.info,
        },
        runs: {
          healthy: group.healthyRuns,
          warning: group.warningRuns,
          error: group.errorRuns,
        },
      }));
  }

  getIssueRankings({
    from = null,
    to = null,
    groupBy = "code",
    limit = 10,
  } = {}) {
    if (!["code", "component", "severity"].includes(groupBy)) {
      throw new RangeError(`Unsupported grouping: ${groupBy}`);
    }

    const reports = this.getReportsInRange(from, to);
    const counts = new Map();

    for (const report of reports) {
      for (const issue of report.issues ?? []) {
        const key = String(issue?.[groupBy] ?? "unknown");

        if (!counts.has(key)) {
          counts.set(key, {
            key,
            count: 0,
            errors: 0,
            warnings: 0,
            info: 0,
            lastSeen: null,
          });
        }

        const item = counts.get(key);

        item.count += 1;

        if (issue.severity === "error") {
          item.errors += 1;
        } else if (issue.severity === "warning") {
          item.warnings += 1;
        } else {
          item.info += 1;
        }

        const timestamp = this.normalizeTimestamp(issue.timestamp);

        if (
          !item.lastSeen ||
          Date.parse(timestamp) > Date.parse(item.lastSeen)
        ) {
          item.lastSeen = timestamp;
        }
      }
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  comparePeriods({
    currentFrom,
    currentTo,
    previousFrom,
    previousTo,
  } = {}) {
    const current = this.getOverview({
      from: currentFrom,
      to: currentTo,
    });

    const previous = this.getOverview({
      from: previousFrom,
      to: previousTo,
    });

    const metrics = [
      "sampleCount",
      "totalIssues",
      "errors",
      "warnings",
      "info",
      "averageDurationMs",
      "issueRate",
    ];

    const comparison = {};

    for (const metric of metrics) {
      const currentValue = Number(current[metric]) || 0;
      const previousValue = Number(previous[metric]) || 0;
      const difference = currentValue - previousValue;

      comparison[metric] = {
        current: currentValue,
        previous: previousValue,
        difference,
        percentageChange:
          previousValue === 0
            ? currentValue === 0
              ? 0
              : null
            : Number(
                ((difference / Math.abs(previousValue)) * 100).toFixed(2)
              ),
      };
    }

    return {
      current,
      previous,
      comparison,
      generatedAt: this.now(),
    };
  }

  getHealthScore({ from = null, to = null } = {}) {
    const overview = this.getOverview({ from, to });

    if (overview.sampleCount === 0) {
      return {
        score: null,
        grade: "unavailable",
        reason: "No diagnostic snapshots are available.",
      };
    }

    const runCount = overview.sampleCount;
    const errorRate = overview.errorRuns / runCount;
    const warningRate = overview.warningRuns / runCount;
    const issueRate = overview.issueRate;

    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            errorRate * 60 -
            warningRate * 25 -
            issueRate * 15
        )
      )
    );

    let grade = "critical";

    if (score >= 95) {
      grade = "excellent";
    } else if (score >= 85) {
      grade = "good";
    } else if (score >= 70) {
      grade = "fair";
    } else if (score >= 50) {
      grade = "poor";
    }

    return {
      score,
      grade,
      sampleCount: runCount,
      errorRate: Number(errorRate.toFixed(4)),
      warningRate: Number(warningRate.toFixed(4)),
      issueRate: Number(issueRate.toFixed(4)),
      calculatedAt: this.now(),
    };
  }

  getComponentBreakdown({ from = null, to = null } = {}) {
    const snapshots = this.getSnapshots({
      from,
      to,
      limit: this.maxSnapshots,
    });

    const components = new Map();

    for (const snapshot of snapshots) {
      for (const [name, count] of Object.entries(
        snapshot.components ?? {}
      )) {
        if (!components.has(name)) {
          components.set(name, {
            component: name,
            issueCount: 0,
            reportCount: 0,
          });
        }

        const item = components.get(name);

        item.issueCount += Number(count) || 0;
        item.reportCount += 1;
      }
    }

    return [...components.values()].sort(
      (a, b) => b.issueCount - a.issueCount
    );
  }

  getReportsInRange(from, to) {
    if (!this.store || typeof this.store.getReports !== "function") {
      return [];
    }

    try {
      return this.store.getReports({
        from,
        to,
        limit: 10000,
        newestFirst: false,
      });
    } catch {
      return [];
    }
  }

  getBucketKey(timestamp, bucket) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    switch (bucket) {
      case "hour":
        return `${year}-${month}-${day}T${String(
          date.getUTCHours()
        ).padStart(2, "0")}:00Z`;

      case "week": {
        const weekDate = new Date(
          Date.UTC(year, date.getUTCMonth(), date.getUTCDate())
        );

        const weekday = weekDate.getUTCDay() || 7;
        weekDate.setUTCDate(weekDate.getUTCDate() - weekday + 1);

        return weekDate.toISOString().slice(0, 10);
      }

      case "month":
        return `${year}-${month}`;

      case "day":
      default:
        return `${year}-${month}-${day}`;
    }
  }

  countBy(items, selector) {
    const counts = {};

    for (const item of items) {
      const key = String(selector(item));

      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }

  handleStoreEvent(event) {
    if (this.destroyed || !event) {
      return;
    }

    this.notify({
      type: "store_changed",
      eventType: event.type ?? "unknown",
    });
  }

  pruneSnapshots() {
    const cutoff =
      this.clock() - this.retentionDays * 24 * 60 * 60 * 1000;

    this.snapshots = this.snapshots
      .filter((snapshot) => {
        const timestamp = Date.parse(snapshot.timestamp);

        return !Number.isNaN(timestamp) && timestamp >= cutoff;
      })
      .slice(-this.maxSnapshots);
  }

  normalizeStatus(status) {
    return ["healthy", "warning", "error"].includes(status)
      ? status
      : "healthy";
  }

  normalizeTimestamp(value) {
    const timestamp = value ? new Date(value) : new Date(this.clock());

    return Number.isNaN(timestamp.getTime())
      ? new Date(this.clock()).toISOString()
      : timestamp.toISOString();
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

  notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Analytics subscribers must not interrupt calculations.
      }
    }
  }

  exportJSON({ pretty = true } = {}) {
    this.assertActive();

    return JSON.stringify(
      {
        exportedAt: this.now(),
        overview: this.getOverview(),
        healthScore: this.getHealthScore(),
        snapshots: this.getSnapshots(),
        componentBreakdown: this.getComponentBreakdown(),
        topIssueCodes: this.getIssueRankings({
          groupBy: "code",
          limit: 20,
        }),
      },
      null,
      pretty ? 2 : 0
    );
  }

  exportCSV() {
    this.assertActive();

    const rows = [
      [
        "timestamp",
        "reportId",
        "status",
        "durationMs",
        "total",
        "errors",
        "warnings",
        "info",
      ],
    ];

    for (const snapshot of this.getSnapshots()) {
      rows.push([
        snapshot.timestamp,
        snapshot.reportId,
        snapshot.status,
        snapshot.durationMs,
        snapshot.total,
        snapshot.errors,
        snapshot.warnings,
        snapshot.info,
      ]);
    }

    return rows
      .map((row) =>
        row.map((value) => this.csvCell(value)).join(",")
      )
      .join("\r\n");
  }

  csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  createId() {
    return `diag-analytics-${this.clock().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  now() {
    return new Date(this.clock()).toISOString();
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error(
        "AlertQueueDashboardDiagnosticsAnalytics has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (typeof this.unsubscribeStore === "function") {
      this.unsubscribeStore();
    }

    this.unsubscribeStore = null;
    this.listeners.clear();
    this.snapshots.length = 0;
    this.destroyed = true;
  }
}