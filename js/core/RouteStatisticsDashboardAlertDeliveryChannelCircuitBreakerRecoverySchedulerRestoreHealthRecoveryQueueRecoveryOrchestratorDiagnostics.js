const DEFAULT_CONFIG = {
  historyLimit: 500,
  staleTaskThreshold: 30000,
  queueWarningThreshold: 50,
  queueCriticalThreshold: 150,
  minimumSamples: 5,
};

export class RecoveryQueueRecoveryOrchestratorDiagnostics {
  constructor(orchestrator, monitor = null, options = {}) {
    if (!orchestrator) {
      throw new TypeError("A recovery orchestrator is required.");
    }

    this.orchestrator = orchestrator;
    this.monitor = monitor;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.history = [];
    this.listeners = new Set();
    this.disposed = false;
    this.lastReport = null;

    this.unsubscribe =
      typeof orchestrator.subscribe === "function"
        ? orchestrator.subscribe((event) => this.recordEvent(event))
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      details,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[RecoveryDiagnostics] Listener error:", error);
      }
    }
  }

  recordEvent(event) {
    if (this.disposed || !event) return;

    const task = event.task || null;

    this.history.push({
      event: event.event || "unknown",
      timestamp: event.timestamp || Date.now(),
      taskId: task?.id || null,
      taskType: task?.type || null,
      status: task?.status || null,
      error: task?.lastError || null,
    });

    if (this.history.length > this.config.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.config.historyLimit
      );
    }

    this.emit("diagnostic_event", {
      event: event.event,
      taskId: task?.id || null,
    });
  }

  inspect() {
    const now = Date.now();
    const stats = this.readOrchestratorStats();
    const queue = this.readQueue();
    const active = this.readActiveTasks();
    const issues = [];

    if (stats.queued >= this.config.queueCriticalThreshold) {
      issues.push({
        code: "QUEUE_CRITICAL",
        severity: "critical",
        message: "The recovery queue has reached its critical threshold.",
        value: stats.queued,
        threshold: this.config.queueCriticalThreshold,
      });
    } else if (stats.queued >= this.config.queueWarningThreshold) {
      issues.push({
        code: "QUEUE_HIGH",
        severity: "warning",
        message: "The recovery queue is growing.",
        value: stats.queued,
        threshold: this.config.queueWarningThreshold,
      });
    }

    for (const task of active) {
      const startedAt = Number(task.startedAt);

      if (
        Number.isFinite(startedAt) &&
        startedAt > 0 &&
        now - startedAt >= this.config.staleTaskThreshold
      ) {
        issues.push({
          code: "TASK_RUNNING_TOO_LONG",
          severity: "warning",
          message: `Recovery task ${task.id} has been running for an extended period.`,
          taskId: task.id,
          duration: now - startedAt,
          threshold: this.config.staleTaskThreshold,
        });
      }
    }

    const failed = this.readFailedTasks();

    if (failed.length > 0) {
      issues.push({
        code: "FAILED_TASKS_PRESENT",
        severity: "warning",
        message: "Failed recovery tasks require inspection.",
        value: failed.length,
      });
    }

    if (stats.destroyed) {
      issues.push({
        code: "ORCHESTRATOR_DESTROYED",
        severity: "critical",
        message: "The recovery orchestrator has been destroyed.",
      });
    }

    if (!stats.running && !stats.destroyed && queue.length > 0) {
      issues.push({
        code: "QUEUE_NOT_PROCESSING",
        severity: "warning",
        message: "Tasks are queued while the orchestrator is stopped.",
        value: queue.length,
      });
    }

    const report = {
      timestamp: now,
      healthy: !issues.some(
        (issue) => issue.severity === "critical"
      ),
      status: this.resolveStatus(issues),
      stats,
      queuedTasks: queue.length,
      activeTasks: active.length,
      failedTasks: failed.length,
      issues,
      recentEvents: this.history.slice(-20),
    };

    this.lastReport = report;

    this.emit("inspection_completed", {
      status: report.status,
      issueCount: issues.length,
    });

    return report;
  }

  resolveStatus(issues) {
    if (issues.some((issue) => issue.severity === "critical")) {
      return "critical";
    }

    if (issues.some((issue) => issue.severity === "warning")) {
      return "degraded";
    }

    return "healthy";
  }

  readOrchestratorStats() {
    if (typeof this.orchestrator.getStats !== "function") {
      return {
        queued: 0,
        active: 0,
        running: false,
        destroyed: false,
        unavailable: true,
      };
    }

    const stats = this.orchestrator.getStats();

    return {
      queued: Number(stats.queued) || 0,
      active: Number(stats.active) || 0,
      running: Boolean(stats.running),
      destroyed: Boolean(stats.destroyed),
      submitted: Number(stats.submitted) || 0,
      recovered: Number(stats.recovered) || 0,
      failed: Number(stats.failed) || 0,
      retries: Number(stats.retries) || 0,
      cancelled: Number(stats.cancelled) || 0,
    };
  }

  readQueue() {
    return typeof this.orchestrator.getQueue === "function"
      ? this.orchestrator.getQueue()
      : [];
  }

  readActiveTasks() {
    return typeof this.orchestrator.getActiveTasks === "function"
      ? this.orchestrator.getActiveTasks()
      : [];
  }

  readFailedTasks() {
    return typeof this.orchestrator.getFailedTasks === "function"
      ? this.orchestrator.getFailedTasks()
      : [];
  }

  getTaskHistory(taskId) {
    if (!taskId) return [];

    return this.history
      .filter((entry) => entry.taskId === taskId)
      .map((entry) => ({ ...entry }));
  }

  getEventCounts() {
    const counts = {};

    for (const entry of this.history) {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    }

    return counts;
  }

  getFailureSummary() {
    const failedEvents = this.history.filter(
      (entry) => entry.event === "task:failed"
    );

    const byType = {};

    for (const entry of failedEvents) {
      const type = entry.taskType || "unknown";
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalFailureEvents: failedEvents.length,
      byType,
      latest: failedEvents.slice(-10).reverse(),
    };
  }

  getRecoveryRate() {
    const recovered = this.history.filter(
      (entry) => entry.event === "task:recovered"
    ).length;

    const failed = this.history.filter(
      (entry) => entry.event === "task:failed"
    ).length;

    const total = recovered + failed;

    return {
      recovered,
      failed,
      total,
      rate: total > 0 ? recovered / total : 1,
    };
  }

  getReport() {
    return this.lastReport
      ? structuredClone(this.lastReport)
      : this.inspect();
  }

  clearHistory() {
    this.history = [];
    this.lastReport = null;
    this.emit("history_cleared");
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }

    this.listeners.clear();
  }
}

export default RecoveryQueueRecoveryOrchestratorDiagnostics;