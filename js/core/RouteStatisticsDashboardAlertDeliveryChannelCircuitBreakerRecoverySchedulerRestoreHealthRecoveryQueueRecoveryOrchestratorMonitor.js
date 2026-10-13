const DEFAULT_CONFIG = {
  historyLimit: 300,
  slowTaskThreshold: 5000,
  alertCooldown: 10000,
  failureRateThreshold: 0.4,
  minimumSamples: 5,
};

export class RecoveryQueueRecoveryOrchestratorMonitor {
  constructor(orchestrator, options = {}) {
    if (!orchestrator) {
      throw new TypeError("A recovery orchestrator is required.");
    }

    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.history = [];
    this.alerts = [];
    this.lastAlertAt = new Map();
    this.listeners = new Set();
    this.disposed = false;

    this.metrics = {
      events: 0,
      tasksStarted: 0,
      tasksRecovered: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      tasksCancelled: 0,
      slowTasks: 0,
      lastEventAt: null,
    };

    this.unsubscribe = this.orchestrator.subscribe(
      (event) => this.handleEvent(event)
    );
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
        console.error("[RecoveryMonitor] Listener error:", error);
      }
    }
  }

  handleEvent(event) {
    if (this.disposed || !event) return;

    this.metrics.events += 1;
    this.metrics.lastEventAt = event.timestamp || Date.now();

    const task = event.task;
    const duration =
      task?.startedAt && task?.completedAt
        ? task.completedAt - task.startedAt
        : null;

    const record = {
      event: event.event || "unknown",
      timestamp: this.metrics.lastEventAt,
      taskId: task?.id || null,
      taskType: task?.type || null,
      status: task?.status || null,
      duration,
      error: task?.lastError || null,
    };

    this.history.push(record);

    if (this.history.length > this.config.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.config.historyLimit
      );
    }

    switch (record.event) {
      case "task:started":
        this.metrics.tasksStarted += 1;
        break;

      case "task:recovered":
        this.metrics.tasksRecovered += 1;
        this.checkSlowTask(record);
        break;

      case "task:failed":
        this.metrics.tasksFailed += 1;
        this.raiseAlert("task_failure", {
          taskId: record.taskId,
          taskType: record.taskType,
          error: record.error,
        });
        break;

      case "task:retry":
        this.metrics.tasksRetried += 1;
        break;

      case "task:cancelled":
        this.metrics.tasksCancelled += 1;
        break;

      default:
        break;
    }

    this.checkFailureRate();
    this.emit("event_recorded", record);
  }

  checkSlowTask(record) {
    if (
      record.duration !== null &&
      record.duration >= this.config.slowTaskThreshold
    ) {
      this.metrics.slowTasks += 1;

      this.raiseAlert("slow_recovery", {
        taskId: record.taskId,
        taskType: record.taskType,
        duration: record.duration,
        threshold: this.config.slowTaskThreshold,
      });
    }
  }

  checkFailureRate() {
    const terminalEvents = this.history.filter(
      (record) =>
        record.event === "task:recovered" ||
        record.event === "task:failed"
    );

    const recent = terminalEvents.slice(-50);

    if (recent.length < this.config.minimumSamples) {
      return;
    }

    const failures = recent.filter(
      (record) => record.event === "task:failed"
    ).length;

    const failureRate = failures / recent.length;

    if (failureRate >= this.config.failureRateThreshold) {
      this.raiseAlert("high_failure_rate", {
        failureRate,
        failures,
        samples: recent.length,
        threshold: this.config.failureRateThreshold,
      });
    }
  }

  raiseAlert(type, details = {}) {
    const now = Date.now();
    const previous = this.lastAlertAt.get(type) || 0;

    if (now - previous < this.config.alertCooldown) {
      return null;
    }

    this.lastAlertAt.set(type, now);

    const alert = {
      id: `recovery-alert-${now}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      type,
      severity: this.getSeverity(type, details),
      message: this.getMessage(type, details),
      details,
      createdAt: now,
      acknowledged: false,
      acknowledgedAt: null,
    };

    this.alerts.push(alert);

    if (this.alerts.length > this.config.historyLimit) {
      this.alerts.splice(
        0,
        this.alerts.length - this.config.historyLimit
      );
    }

    this.emit("alert_created", { ...alert });

    return alert;
  }

  getSeverity(type, details) {
    if (type === "task_failure") return "error";

    if (
      type === "high_failure_rate" &&
      details.failureRate >= 0.7
    ) {
      return "critical";
    }

    return "warning";
  }

  getMessage(type, details) {
    switch (type) {
      case "task_failure":
        return `Recovery task ${details.taskId || "unknown"} failed.`;

      case "slow_recovery":
        return `Recovery task ${details.taskId || "unknown"} took ${details.duration}ms.`;

      case "high_failure_rate":
        return `Recovery failure rate is ${(details.failureRate * 100).toFixed(1)}%.`;

      default:
        return "A recovery monitoring alert was raised.";
    }
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(
      (item) => item.id === alertId
    );

    if (!alert || alert.acknowledged) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();

    this.emit("alert_acknowledged", { ...alert });

    return true;
  }

  acknowledgeAll() {
    let count = 0;
    const now = Date.now();

    for (const alert of this.alerts) {
      if (!alert.acknowledged) {
        alert.acknowledged = true;
        alert.acknowledgedAt = now;
        count += 1;
      }
    }

    this.emit("alerts_acknowledged", { count });

    return count;
  }

  getActiveAlerts() {
    return this.alerts
      .filter((alert) => !alert.acknowledged)
      .map((alert) => ({ ...alert }));
  }

  getAlerts(options = {}) {
    const { type, severity, acknowledged, limit } = options;

    let result = [...this.alerts];

    if (type) {
      result = result.filter((alert) => alert.type === type);
    }

    if (severity) {
      result = result.filter(
        (alert) => alert.severity === severity
      );
    }

    if (typeof acknowledged === "boolean") {
      result = result.filter(
        (alert) => alert.acknowledged === acknowledged
      );
    }

    result.reverse();

    if (Number.isInteger(limit) && limit >= 0) {
      result = result.slice(0, limit);
    }

    return result.map((alert) => ({ ...alert }));
  }

  getHistory(options = {}) {
    const { event, since, limit } = options;

    let result = [...this.history];

    if (event) {
      result = result.filter((record) => record.event === event);
    }

    if (Number.isFinite(since)) {
      result = result.filter(
        (record) => record.timestamp >= since
      );
    }

    if (Number.isInteger(limit) && limit >= 0) {
      result = result.slice(-limit);
    }

    return result;
  }

  getMetrics() {
    const completed =
      this.metrics.tasksRecovered + this.metrics.tasksFailed;

    return {
      ...this.metrics,
      completionCount: completed,
      successRate:
        completed > 0
          ? this.metrics.tasksRecovered / completed
          : 1,
      activeAlerts: this.getActiveAlerts().length,
      totalAlerts: this.alerts.length,
      orchestrator:
        typeof this.orchestrator.getStats === "function"
          ? this.orchestrator.getStats()
          : null,
    };
  }

  resetMetrics() {
    this.metrics = {
      events: 0,
      tasksStarted: 0,
      tasksRecovered: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      tasksCancelled: 0,
      slowTasks: 0,
      lastEventAt: null,
    };

    this.emit("metrics_reset");
  }

  clearHistory() {
    this.history = [];
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

export default RecoveryQueueRecoveryOrchestratorMonitor;