const DEFAULT_HISTORY_LIMIT = 100;

export class AlertDeliveryQueueHealth {
  constructor({
    queue,
    monitor = null,
    recovery = null,
    historyLimit = DEFAULT_HISTORY_LIMIT,
    clock = () => Date.now(),
  } = {}) {
    if (!queue) {
      throw new Error("An alert delivery queue is required.");
    }

    this.queue = queue;
    this.monitor = monitor;
    this.recovery = recovery;
    this.historyLimit = Math.max(1, Number(historyLimit) || 100);
    this.clock = clock;

    this.history = [];
    this.listeners = new Set();
    this.lastCheck = null;
    this.destroyed = false;
  }

  check() {
    if (this.destroyed) {
      throw new Error("Health monitor has been destroyed.");
    }

    const timestamp = this.clock();
    const jobs = this.queue.getJobs?.() ?? [];
    const queueStatus = this.queue.getStatus?.() ?? {};
    const monitorStatus = this.monitor?.getStatus?.() ?? null;
    const recoveryStatus = this.recovery?.getStatus?.() ?? null;

    const counts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      unknown: 0,
    };

    for (const job of jobs) {
      const status = String(job.status ?? "unknown");

      if (Object.hasOwn(counts, status)) {
        counts[status] += 1;
      } else {
        counts.unknown += 1;
      }
    }

    const issues = [];

    if (counts.failed > 0) {
      issues.push({
        code: "FAILED_JOBS",
        severity: "warning",
        message: `${counts.failed} alert job(s) have failed.`,
      });
    }

    if (counts.pending > 100) {
      issues.push({
        code: "HIGH_PENDING_COUNT",
        severity: "warning",
        message: "The pending alert queue is unusually large.",
      });
    }

    if (
      queueStatus.closed === true ||
      queueStatus.accepting === false
    ) {
      issues.push({
        code: "QUEUE_NOT_ACCEPTING",
        severity: "critical",
        message: "The queue may not be accepting new jobs.",
      });
    }

    if (monitorStatus?.lastError) {
      issues.push({
        code: "MONITOR_ERROR",
        severity: "warning",
        message: monitorStatus.lastError,
      });
    }

    if (recoveryStatus?.destroyed) {
      issues.push({
        code: "RECOVERY_DISABLED",
        severity: "warning",
        message: "The recovery service has been destroyed.",
      });
    }

    const health = {
      timestamp,
      checkedAt: new Date(timestamp).toISOString(),
      status: issues.some((issue) => issue.severity === "critical")
        ? "unhealthy"
        : issues.length > 0
          ? "degraded"
          : "healthy",
      counts,
      totalJobs: jobs.length,
      issues,
      components: {
        queue: {
          available: true,
          status: queueStatus,
        },
        monitor: {
          available: Boolean(this.monitor),
          status: monitorStatus,
        },
        recovery: {
          available: Boolean(this.recovery),
          status: recoveryStatus,
        },
      },
    };

    this.history.push(health);

    if (this.history.length > this.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.historyLimit,
      );
    }

    this.lastCheck = health;
    this.#emit({ type: "health_check", health });

    return health;
  }

  isHealthy() {
    return this.check().status === "healthy";
  }

  getLastCheck() {
    return this.lastCheck;
  }

  getHistory({ limit = this.historyLimit } = {}) {
    const safeLimit = Math.max(1, Number(limit) || this.historyLimit);
    return this.history.slice(-safeLimit);
  }

  getSummary() {
    const latest = this.lastCheck;

    return {
      checked: Boolean(latest),
      status: latest?.status ?? "unknown",
      totalChecks: this.history.length,
      lastCheckedAt: latest?.checkedAt ?? null,
      issueCount: latest?.issues.length ?? 0,
      healthyChecks: this.history.filter(
        (item) => item.status === "healthy",
      ).length,
      degradedChecks: this.history.filter(
        (item) => item.status === "degraded",
      ).length,
      unhealthyChecks: this.history.filter(
        (item) => item.status === "unhealthy",
      ).length,
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clearHistory() {
    this.history = [];
    this.lastCheck = null;
    this.#emit({ type: "history_cleared" });
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Prevent listener failures from interrupting health checks.
      }
    }
  }
}

export default AlertDeliveryQueueHealth;