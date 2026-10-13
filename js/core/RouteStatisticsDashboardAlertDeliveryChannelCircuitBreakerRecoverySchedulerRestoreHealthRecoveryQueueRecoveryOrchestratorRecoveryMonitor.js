import RecoveryService from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecovery.js";

const TERMINAL_STATES = new Set(["recovered", "failed", "cancelled"]);

export class RecoveryQueueRecoveryOrchestratorRecoveryMonitor {
  constructor(recoveryService = null, options = {}) {
    this.recovery = recoveryService || new RecoveryService();
    this.options = {
      pollIntervalMs: 2000,
      historyLimit: 200,
      ...options,
    };

    this.history = [];
    this.listeners = new Set();
    this.interval = null;
    this.unsubscribeRecovery = null;
    this.disposed = false;

    this.snapshot = this.createSnapshot();

    if (typeof this.recovery.subscribe === "function") {
      this.unsubscribeRecovery = this.recovery.subscribe((event) => {
        this.handleRecoveryEvent(event);
      });
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Monitor listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  start() {
    this.assertActive();

    if (this.interval) {
      return this.getSnapshot();
    }

    this.refresh();

    this.interval = setInterval(() => {
      this.refresh();
    }, Math.max(250, this.options.pollIntervalMs));

    this.record("monitor:started", {
      pollIntervalMs: this.options.pollIntervalMs,
    });

    return this.getSnapshot();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.record("monitor:stopped");

    return this.getSnapshot();
  }

  refresh() {
    this.assertActive();

    const jobs = this.recovery.getAll();
    const stats = this.recovery.getStats();

    const counts = {
      scheduled: 0,
      running: 0,
      retry_wait: 0,
      recovered: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const job of jobs) {
      if (Object.hasOwn(counts, job.status)) {
        counts[job.status] += 1;
      }
    }

    this.snapshot = {
      timestamp: Date.now(),
      running: counts.running > 0,
      healthy: counts.failed === 0,
      total: jobs.length,
      pending: counts.scheduled + counts.running + counts.retry_wait,
      counts,
      stats,
      recentJobs: jobs
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20),
    };

    this.notify("monitor:updated", this.getSnapshot());

    return this.getSnapshot();
  }

  handleRecoveryEvent(event) {
    if (this.disposed) {
      return;
    }

    this.record(event.type, event.detail);

    if (event.type === "recovery:failed") {
      this.notify("monitor:alert", {
        severity: "error",
        message: "A recovery job failed.",
        detail: event.detail,
      });
    } else if (event.type === "recovery:retrying") {
      this.notify("monitor:alert", {
        severity: "warning",
        message: "A recovery job will be retried.",
        detail: event.detail,
      });
    } else if (event.type === "recovery:completed") {
      this.notify("monitor:alert", {
        severity: "success",
        message: "A recovery job completed successfully.",
        detail: event.detail,
      });
    }

    this.refreshSafely();
  }

  refreshSafely() {
    if (this.disposed) {
      return;
    }

    try {
      this.refresh();
    } catch (error) {
      this.record("monitor:error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  record(type, detail = {}) {
    const entry = {
      id: `${Date.now()}-${this.history.length + 1}`,
      type,
      detail,
      timestamp: Date.now(),
    };

    this.history.push(entry);

    const limit = Math.max(1, this.options.historyLimit);

    if (this.history.length > limit) {
      this.history.splice(0, this.history.length - limit);
    }

    return entry;
  }

  notify(type, detail) {
    const event = {
      type,
      detail,
      timestamp: Date.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryMonitor]", error);
      }
    }
  }

  getSnapshot() {
    return structuredClone(this.snapshot);
  }

  getHistory(options = {}) {
    const limit = Math.max(
      1,
      Number(options.limit ?? this.options.historyLimit)
    );

    const type = options.type;

    let entries = this.history;

    if (type) {
      entries = entries.filter((entry) => entry.type === type);
    }

    return entries.slice(-limit).map((entry) => structuredClone(entry));
  }

  getFailedJobs() {
    return this.recovery
      .getAll()
      .filter((job) => job.status === "failed");
  }

  getPendingJobs() {
    return this.recovery
      .getAll()
      .filter((job) =>
        ["scheduled", "running", "retry_wait"].includes(job.status)
      );
  }

  getTerminalJobs() {
    return this.recovery
      .getAll()
      .filter((job) => TERMINAL_STATES.has(job.status));
  }

  async retryFailed(id = null) {
    this.assertActive();

    const failed = this.getFailedJobs().filter(
      (job) => id === null || job.id === String(id)
    );

    const results = [];

    for (const job of failed) {
      try {
        results.push(await this.recovery.retryNow(job.id));
      } catch (error) {
        results.push({
          id: job.id,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.refreshSafely();

    return results;
  }

  clearHistory() {
    const previousCount = this.history.length;
    this.history = [];

    this.notify("monitor:history_cleared", {
      removed: previousCount,
    });

    return previousCount;
  }

  createSnapshot() {
    return {
      timestamp: Date.now(),
      running: false,
      healthy: true,
      total: 0,
      pending: 0,
      counts: {
        scheduled: 0,
        running: 0,
        retry_wait: 0,
        recovered: 0,
        failed: 0,
        cancelled: 0,
      },
      stats: {},
      recentJobs: [],
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Recovery monitor has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();

    if (typeof this.unsubscribeRecovery === "function") {
      this.unsubscribeRecovery();
      this.unsubscribeRecovery = null;
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryQueueRecoveryOrchestratorRecoveryMonitor;