const DEFAULT_WINDOW_SIZE = 20;

export class AlertDeliveryQueueHealthAnalytics {
  constructor({
    store,
    windowSize = DEFAULT_WINDOW_SIZE,
    clock = () => Date.now(),
  } = {}) {
    if (!store) {
      throw new Error("A health record store is required.");
    }

    this.store = store;
    this.windowSize = Math.max(1, Number(windowSize) || 20);
    this.clock = clock;
  }

  analyze({ from, to, limit = 500 } = {}) {
    const records = this.store.query({
      from,
      to,
      limit,
    });

    const total = records.length;

    if (total === 0) {
      return {
        generatedAt: new Date(this.clock()).toISOString(),
        totalRecords: 0,
        availabilityPercent: 0,
        statusCounts: {
          healthy: 0,
          degraded: 0,
          unhealthy: 0,
          unknown: 0,
        },
        issueCounts: {},
        trend: [],
        averageJobs: 0,
        peakJobs: 0,
      };
    }

    const statusCounts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    };

    const issueCounts = {};
    let totalJobs = 0;
    let peakJobs = 0;

    for (const record of records) {
      const status = record.status ?? "unknown";

      if (Object.hasOwn(statusCounts, status)) {
        statusCounts[status] += 1;
      } else {
        statusCounts.unknown += 1;
      }

      const jobs = Math.max(0, Number(record.totalJobs) || 0);

      totalJobs += jobs;
      peakJobs = Math.max(peakJobs, jobs);

      for (const issue of record.issues ?? []) {
        const key = String(issue.code ?? "UNKNOWN");

        issueCounts[key] = (issueCounts[key] ?? 0) + 1;
      }
    }

    const trend = this.#buildTrend(records);

    return {
      generatedAt: new Date(this.clock()).toISOString(),
      totalRecords: total,
      availabilityPercent: Number(
        ((statusCounts.healthy / total) * 100).toFixed(2),
      ),
      statusCounts,
      issueCounts,
      trend,
      averageJobs: Number((totalJobs / total).toFixed(2)),
      peakJobs,
      mostCommonIssue: this.#mostCommon(issueCounts),
    };
  }

  getTrend({ limit = 100 } = {}) {
    const records = this.store.query({ limit });
    return this.#buildTrend(records);
  }

  getIssueRanking({ limit = 10, recordsLimit = 500 } = {}) {
    const records = this.store.query({ limit: recordsLimit });
    const counts = new Map();

    for (const record of records) {
      for (const issue of record.issues ?? []) {
        const code = String(issue.code ?? "UNKNOWN");
        const current = counts.get(code) ?? {
          code,
          count: 0,
          severity: issue.severity ?? "info",
        };

        current.count += 1;

        if (
          this.#severityRank(issue.severity) >
          this.#severityRank(current.severity)
        ) {
          current.severity = issue.severity;
        }

        counts.set(code, current);
      }
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.max(1, Number(limit) || 10));
  }

  comparePeriods({
    currentFrom,
    currentTo,
    previousFrom,
    previousTo,
  } = {}) {
    const current = this.analyze({
      from: currentFrom,
      to: currentTo,
    });

    const previous = this.analyze({
      from: previousFrom,
      to: previousTo,
    });

    return {
      current,
      previous,
      availabilityChange: Number(
        (
          current.availabilityPercent -
          previous.availabilityPercent
        ).toFixed(2),
      ),
      recordCountChange:
        current.totalRecords - previous.totalRecords,
      unhealthyChange:
        current.statusCounts.unhealthy -
        previous.statusCounts.unhealthy,
    };
  }

  exportJSON(options = {}) {
    return JSON.stringify(this.analyze(options), null, 2);
  }

  #buildTrend(records) {
    return records.slice(-this.windowSize).map((record) => ({
      timestamp: record.checkedAt ?? record.storedAt ?? null,
      status: record.status ?? "unknown",
      totalJobs: Math.max(0, Number(record.totalJobs) || 0),
      issueCount: Array.isArray(record.issues)
        ? record.issues.length
        : 0,
    }));
  }

  #mostCommon(counts) {
    const entries = Object.entries(counts).sort(
      (a, b) => b[1] - a[1],
    );

    if (entries.length === 0 || entries[0][1] === 0) {
      return null;
    }

    return {
      code: entries[0][0],
      count: entries[0][1],
    };
  }

  #severityRank(severity) {
    const ranks = {
      info: 1,
      low: 2,
      warning: 3,
      high: 4,
      critical: 5,
    };

    return ranks[String(severity ?? "info").toLowerCase()] ?? 0;
  }
}

export default AlertDeliveryQueueHealthAnalytics;