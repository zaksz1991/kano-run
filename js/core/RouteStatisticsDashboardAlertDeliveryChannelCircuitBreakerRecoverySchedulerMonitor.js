import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  intervalMs: 10000,
  historyLimit: 200,
  alertFailureThreshold: 3,
  alertStalledAfterMs: 120000,
  autoStart: false,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor {
  constructor({
    registry,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!registry) {
      throw new TypeError("A scheduler registry is required.");
    }

    this.registry = registry;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.running = false;
    this.disposed = false;
    this.timer = null;
    this.lastSnapshot = null;
    this.history = [];
    this.alerts = new Map();
    this.previousStates = new Map();
    this.checkCount = 0;
    this.lastCheckAt = null;
    this.listeners = new Set();

    if (this.config.autoStart) {
      this.start();
    }
  }

  start() {
    this.assertActive();

    if (this.running) {
      return false;
    }

    this.running = true;

    this.emit("started", {
      at: this.clock(),
    });

    this.schedule(0);

    return true;
  }

  stop() {
    if (!this.running) {
      return false;
    }

    this.running = false;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.emit("stopped", {
      at: this.clock(),
      checkCount: this.checkCount,
    });

    return true;
  }

  schedule(delay = this.config.intervalMs) {
    if (!this.running || this.disposed) {
      return;
    }

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.check().finally(() => {
        if (this.running && !this.disposed) {
          this.schedule(this.config.intervalMs);
        }
      });
    }, Math.max(0, Number(delay) || 0));
  }

  async check() {
    this.assertActive();

    const checkedAt = this.clock();
    this.checkCount += 1;
    this.lastCheckAt = checkedAt;

    let schedulerStatuses;

    try {
      schedulerStatuses = this.registry.getStatuses();
    } catch (error) {
      this.recordAlert("registry-unavailable", {
        severity: "critical",
        message: "Unable to read recovery scheduler registry.",
        error: this.serializeError(error),
        at: checkedAt,
      });

      return this.getSnapshot();
    }

    const currentIds = new Set();
    const summaries = [];

    for (const entry of schedulerStatuses) {
      const id = String(entry.id);
      const status = entry.status ?? {};
      currentIds.add(id);

      const summary = this.summarizeScheduler(id, status, checkedAt);
      summaries.push(summary);

      this.detectStateChanges(id, summary);
      this.detectFailures(id, summary);
      this.detectStalledScheduler(id, summary, checkedAt);
    }

    for (const id of this.previousStates.keys()) {
      if (!currentIds.has(id)) {
        this.previousStates.delete(id);
        this.clearAlert(`scheduler-failed:${id}`);
        this.clearAlert(`scheduler-stalled:${id}`);
        this.emit("scheduler-removed", { id, at: checkedAt });
      }
    }

    const snapshot = {
      checkedAt,
      checkCount: this.checkCount,
      registrySummary: this.registry.getSummary?.() ?? null,
      totalSchedulers: summaries.length,
      runningSchedulers: summaries.filter((item) => item.running).length,
      idleSchedulers: summaries.filter((item) => !item.running).length,
      failedSchedulers: summaries.filter(
        (item) => item.failureCount > 0,
      ).length,
      stalledSchedulers: summaries.filter((item) => item.stalled).length,
      schedulers: summaries,
      alerts: [...this.alerts.values()],
    };

    this.lastSnapshot = snapshot;
    this.addHistory(snapshot);
    this.notifyListeners(snapshot);

    this.emit("checked", snapshot);

    return snapshot;
  }

  summarizeScheduler(id, status, checkedAt) {
    const lastRunAt = this.normalizeTimestamp(status.lastRunAt);
    const nextRunAt = this.normalizeTimestamp(status.nextRunAt);
    const running = status.running === true;
    const failureCount = Number(status.failureCount) || 0;
    const runCount = Number(status.runCount) || 0;

    const lastResult = status.lastResult ?? null;
    const resultFailed =
      lastResult?.failed > 0 ||
      Boolean(lastResult?.error);

    const lastFinishedAt = this.normalizeTimestamp(
      lastResult?.finishedAt,
    );

    const stalled =
      running &&
      lastRunAt !== null &&
      checkedAt - lastRunAt > this.config.alertStalledAfterMs &&
      nextRunAt !== null &&
      nextRunAt < checkedAt;

    return {
      id,
      running,
      disposed: status.disposed === true,
      runCount,
      failureCount,
      lastRunAt,
      nextRunAt,
      lastFinishedAt,
      lastResultFailed: resultFailed,
      stalled,
      pendingRetries: Array.isArray(status.pendingRetries)
        ? status.pendingRetries.length
        : 0,
      lastError: lastResult?.error ?? null,
    };
  }

  detectStateChanges(id, current) {
    const previous = this.previousStates.get(id);

    if (!previous) {
      this.previousStates.set(id, current);
      return;
    }

    if (previous.running !== current.running) {
      this.emit("scheduler-state-changed", {
        id,
        from: previous.running ? "running" : "stopped",
        to: current.running ? "running" : "stopped",
        at: this.clock(),
      });
    }

    if (current.runCount > previous.runCount) {
      this.emit("scheduler-run-detected", {
        id,
        previousRunCount: previous.runCount,
        runCount: current.runCount,
        at: this.clock(),
      });
    }

    this.previousStates.set(id, current);
  }

  detectFailures(id, summary) {
    const key = `scheduler-failed:${id}`;

    if (summary.failureCount >= this.config.alertFailureThreshold) {
      this.recordAlert(key, {
        severity: "warning",
        message: `Recovery scheduler "${id}" has accumulated failures.`,
        schedulerId: id,
        failureCount: summary.failureCount,
        threshold: this.config.alertFailureThreshold,
        at: this.clock(),
      });

      return;
    }

    this.clearAlert(key);
  }

  detectStalledScheduler(id, summary, checkedAt) {
    const key = `scheduler-stalled:${id}`;

    if (summary.stalled) {
      this.recordAlert(key, {
        severity: "critical",
        message: `Recovery scheduler "${id}" appears stalled.`,
        schedulerId: id,
        lastRunAt: summary.lastRunAt,
        checkedAt,
        at: checkedAt,
      });

      return;
    }

    this.clearAlert(key);
  }

  recordAlert(key, alert) {
    const previous = this.alerts.get(key);

    const next = {
      id: key,
      ...previous,
      ...alert,
      firstSeenAt: previous?.firstSeenAt ?? alert.at ?? this.clock(),
      updatedAt: this.clock(),
    };

    this.alerts.set(key, next);

    if (!previous) {
      this.emit("alert-created", next);
    } else if (
      previous.severity !== next.severity ||
      previous.message !== next.message ||
      previous.failureCount !== next.failureCount
    ) {
      this.emit("alert-updated", next);
    }
  }

  clearAlert(key) {
    const alert = this.alerts.get(key);

    if (!alert) {
      return false;
    }

    this.alerts.delete(key);

    this.emit("alert-cleared", {
      ...alert,
      clearedAt: this.clock(),
    });

    return true;
  }

  getSnapshot() {
    return {
      running: this.running,
      disposed: this.disposed,
      checkCount: this.checkCount,
      lastCheckAt: this.lastCheckAt,
      snapshot: this.lastSnapshot,
      alerts: [...this.alerts.values()],
    };
  }

  getHistory({ limit = 50 } = {}) {
    const count = Math.max(0, Number(limit) || 0);

    if (count === 0) {
      return [];
    }

    return this.history.slice(-count);
  }

  getAlerts({ severity } = {}) {
    const alerts = [...this.alerts.values()];

    if (!severity) {
      return alerts;
    }

    return alerts.filter((alert) => alert.severity === severity);
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(snapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.log("error", "Monitor subscriber failed.", {
          error: this.serializeError(error),
        });
      }
    }
  }

  addHistory(snapshot) {
    this.history.push({
      checkedAt: snapshot.checkedAt,
      totalSchedulers: snapshot.totalSchedulers,
      runningSchedulers: snapshot.runningSchedulers,
      failedSchedulers: snapshot.failedSchedulers,
      stalledSchedulers: snapshot.stalledSchedulers,
      activeAlerts: snapshot.alerts.length,
    });

    const overflow = this.history.length - this.config.historyLimit;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }
  }

  normalizeTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-monitor:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit monitor event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Monitoring must continue when logging fails.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.listeners.clear();
    this.alerts.clear();
    this.previousStates.clear();
    this.history.length = 0;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor;import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  intervalMs: 10000,
  historyLimit: 200,
  alertFailureThreshold: 3,
  alertStalledAfterMs: 120000,
  autoStart: false,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor {
  constructor({
    registry,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!registry) {
      throw new TypeError("A scheduler registry is required.");
    }

    this.registry = registry;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.running = false;
    this.disposed = false;
    this.timer = null;
    this.lastSnapshot = null;
    this.history = [];
    this.alerts = new Map();
    this.previousStates = new Map();
    this.checkCount = 0;
    this.lastCheckAt = null;
    this.listeners = new Set();

    if (this.config.autoStart) {
      this.start();
    }
  }

  start() {
    this.assertActive();

    if (this.running) {
      return false;
    }

    this.running = true;

    this.emit("started", {
      at: this.clock(),
    });

    this.schedule(0);

    return true;
  }

  stop() {
    if (!this.running) {
      return false;
    }

    this.running = false;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.emit("stopped", {
      at: this.clock(),
      checkCount: this.checkCount,
    });

    return true;
  }

  schedule(delay = this.config.intervalMs) {
    if (!this.running || this.disposed) {
      return;
    }

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.check().finally(() => {
        if (this.running && !this.disposed) {
          this.schedule(this.config.intervalMs);
        }
      });
    }, Math.max(0, Number(delay) || 0));
  }

  async check() {
    this.assertActive();

    const checkedAt = this.clock();
    this.checkCount += 1;
    this.lastCheckAt = checkedAt;

    let schedulerStatuses;

    try {
      schedulerStatuses = this.registry.getStatuses();
    } catch (error) {
      this.recordAlert("registry-unavailable", {
        severity: "critical",
        message: "Unable to read recovery scheduler registry.",
        error: this.serializeError(error),
        at: checkedAt,
      });

      return this.getSnapshot();
    }

    const currentIds = new Set();
    const summaries = [];

    for (const entry of schedulerStatuses) {
      const id = String(entry.id);
      const status = entry.status ?? {};
      currentIds.add(id);

      const summary = this.summarizeScheduler(id, status, checkedAt);
      summaries.push(summary);

      this.detectStateChanges(id, summary);
      this.detectFailures(id, summary);
      this.detectStalledScheduler(id, summary, checkedAt);
    }

    for (const id of this.previousStates.keys()) {
      if (!currentIds.has(id)) {
        this.previousStates.delete(id);
        this.clearAlert(`scheduler-failed:${id}`);
        this.clearAlert(`scheduler-stalled:${id}`);
        this.emit("scheduler-removed", { id, at: checkedAt });
      }
    }

    const snapshot = {
      checkedAt,
      checkCount: this.checkCount,
      registrySummary: this.registry.getSummary?.() ?? null,
      totalSchedulers: summaries.length,
      runningSchedulers: summaries.filter((item) => item.running).length,
      idleSchedulers: summaries.filter((item) => !item.running).length,
      failedSchedulers: summaries.filter(
        (item) => item.failureCount > 0,
      ).length,
      stalledSchedulers: summaries.filter((item) => item.stalled).length,
      schedulers: summaries,
      alerts: [...this.alerts.values()],
    };

    this.lastSnapshot = snapshot;
    this.addHistory(snapshot);
    this.notifyListeners(snapshot);

    this.emit("checked", snapshot);

    return snapshot;
  }

  summarizeScheduler(id, status, checkedAt) {
    const lastRunAt = this.normalizeTimestamp(status.lastRunAt);
    const nextRunAt = this.normalizeTimestamp(status.nextRunAt);
    const running = status.running === true;
    const failureCount = Number(status.failureCount) || 0;
    const runCount = Number(status.runCount) || 0;

    const lastResult = status.lastResult ?? null;
    const resultFailed =
      lastResult?.failed > 0 ||
      Boolean(lastResult?.error);

    const lastFinishedAt = this.normalizeTimestamp(
      lastResult?.finishedAt,
    );

    const stalled =
      running &&
      lastRunAt !== null &&
      checkedAt - lastRunAt > this.config.alertStalledAfterMs &&
      nextRunAt !== null &&
      nextRunAt < checkedAt;

    return {
      id,
      running,
      disposed: status.disposed === true,
      runCount,
      failureCount,
      lastRunAt,
      nextRunAt,
      lastFinishedAt,
      lastResultFailed: resultFailed,
      stalled,
      pendingRetries: Array.isArray(status.pendingRetries)
        ? status.pendingRetries.length
        : 0,
      lastError: lastResult?.error ?? null,
    };
  }

  detectStateChanges(id, current) {
    const previous = this.previousStates.get(id);

    if (!previous) {
      this.previousStates.set(id, current);
      return;
    }

    if (previous.running !== current.running) {
      this.emit("scheduler-state-changed", {
        id,
        from: previous.running ? "running" : "stopped",
        to: current.running ? "running" : "stopped",
        at: this.clock(),
      });
    }

    if (current.runCount > previous.runCount) {
      this.emit("scheduler-run-detected", {
        id,
        previousRunCount: previous.runCount,
        runCount: current.runCount,
        at: this.clock(),
      });
    }

    this.previousStates.set(id, current);
  }

  detectFailures(id, summary) {
    const key = `scheduler-failed:${id}`;

    if (summary.failureCount >= this.config.alertFailureThreshold) {
      this.recordAlert(key, {
        severity: "warning",
        message: `Recovery scheduler "${id}" has accumulated failures.`,
        schedulerId: id,
        failureCount: summary.failureCount,
        threshold: this.config.alertFailureThreshold,
        at: this.clock(),
      });

      return;
    }

    this.clearAlert(key);
  }

  detectStalledScheduler(id, summary, checkedAt) {
    const key = `scheduler-stalled:${id}`;

    if (summary.stalled) {
      this.recordAlert(key, {
        severity: "critical",
        message: `Recovery scheduler "${id}" appears stalled.`,
        schedulerId: id,
        lastRunAt: summary.lastRunAt,
        checkedAt,
        at: checkedAt,
      });

      return;
    }

    this.clearAlert(key);
  }

  recordAlert(key, alert) {
    const previous = this.alerts.get(key);

    const next = {
      id: key,
      ...previous,
      ...alert,
      firstSeenAt: previous?.firstSeenAt ?? alert.at ?? this.clock(),
      updatedAt: this.clock(),
    };

    this.alerts.set(key, next);

    if (!previous) {
      this.emit("alert-created", next);
    } else if (
      previous.severity !== next.severity ||
      previous.message !== next.message ||
      previous.failureCount !== next.failureCount
    ) {
      this.emit("alert-updated", next);
    }
  }

  clearAlert(key) {
    const alert = this.alerts.get(key);

    if (!alert) {
      return false;
    }

    this.alerts.delete(key);

    this.emit("alert-cleared", {
      ...alert,
      clearedAt: this.clock(),
    });

    return true;
  }

  getSnapshot() {
    return {
      running: this.running,
      disposed: this.disposed,
      checkCount: this.checkCount,
      lastCheckAt: this.lastCheckAt,
      snapshot: this.lastSnapshot,
      alerts: [...this.alerts.values()],
    };
  }

  getHistory({ limit = 50 } = {}) {
    const count = Math.max(0, Number(limit) || 0);

    if (count === 0) {
      return [];
    }

    return this.history.slice(-count);
  }

  getAlerts({ severity } = {}) {
    const alerts = [...this.alerts.values()];

    if (!severity) {
      return alerts;
    }

    return alerts.filter((alert) => alert.severity === severity);
  }

  subscribe(listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(snapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.log("error", "Monitor subscriber failed.", {
          error: this.serializeError(error),
        });
      }
    }
  }

  addHistory(snapshot) {
    this.history.push({
      checkedAt: snapshot.checkedAt,
      totalSchedulers: snapshot.totalSchedulers,
      runningSchedulers: snapshot.runningSchedulers,
      failedSchedulers: snapshot.failedSchedulers,
      stalledSchedulers: snapshot.stalledSchedulers,
      activeAlerts: snapshot.alerts.length,
    });

    const overflow = this.history.length - this.config.historyLimit;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }
  }

  normalizeTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler-monitor:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit monitor event.", {
        event,
        error: this.serializeError(error),
      });
    }
  }

  log(level, message, context = {}) {
    try {
      if (typeof this.logger?.[level] === "function") {
        this.logger[level](message, context);
      }
    } catch {
      // Monitoring must continue when logging fails.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.listeners.clear();
    this.alerts.clear();
    this.previousStates.clear();
    this.history.length = 0;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerMonitor;