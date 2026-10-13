import RecoveryHealthDashboardBackupScheduler from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupScheduler.js";

const DEFAULT_OPTIONS = {
  sampleLimit: 100,
  alertFailureThreshold: 3,
  alertCooldownMs: 60_000,
};

export class RecoveryHealthDashboardBackupSchedulerMonitor {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.scheduler =
      options.scheduler ||
      new RecoveryHealthDashboardBackupScheduler({
        ...options.schedulerOptions,
        enabled: false,
      });

    this.samples = [];
    this.listeners = new Set();
    this.alerts = [];
    this.lastAlertAt = 0;
    this.consecutiveFailures = 0;
    this.started = false;
    this.disposed = false;

    this.unsubscribeScheduler =
      typeof this.scheduler.subscribe === "function"
        ? this.scheduler.subscribe((event) =>
            this._handleSchedulerEvent(event)
          )
        : null;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Monitor listener must be a function.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event, detail = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // Monitoring listeners must not interrupt scheduler activity.
      }
    }
  }

  _record(type, detail = {}) {
    const sample = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    this.samples.push(sample);

    const limit = Math.max(
      1,
      Number(this.options.sampleLimit) || 100
    );

    if (this.samples.length > limit) {
      this.samples.splice(0, this.samples.length - limit);
    }

    this._emit("sample-recorded", { sample });

    return sample;
  }

  _handleSchedulerEvent(event) {
    if (!event || typeof event !== "object") return;

    switch (event.event) {
      case "backup-run-started":
        this._record("run-started", {
          source: event.source || "unknown",
        });
        break;

      case "backup-run-completed":
        this.consecutiveFailures = 0;
        this._record("run-completed", {
          result: event.result || null,
        });
        break;

      case "backup-run-failed":
        this.consecutiveFailures += 1;

        this._record("run-failed", {
          error: event.error || null,
          consecutiveFailures: this.consecutiveFailures,
        });

        this._checkFailureThreshold();
        break;

      case "next-run-scheduled":
        this._record("next-run-scheduled", {
          nextRunAt: event.nextRunAt || null,
          delayMs: event.delayMs ?? null,
        });
        break;

      case "scheduler-started":
        this._record("scheduler-started", {
          nextRunAt: event.nextRunAt || null,
        });
        break;

      case "scheduler-stopped":
        this._record("scheduler-stopped");
        break;

      default:
        this._record("scheduler-event", {
          originalEvent: event.event,
        });
    }
  }

  _checkFailureThreshold() {
    const threshold = Math.max(
      1,
      Number(this.options.alertFailureThreshold) || 3
    );

    if (this.consecutiveFailures < threshold) return;

    const now = Date.now();
    const cooldown = Math.max(
      0,
      Number(this.options.alertCooldownMs) || 0
    );

    if (now - this.lastAlertAt < cooldown) return;

    this.lastAlertAt = now;

    const alert = {
      id: `backup-alert-${now}`,
      type: "consecutive-backup-failures",
      severity: "warning",
      count: this.consecutiveFailures,
      message: `Backup scheduler has failed ${this.consecutiveFailures} consecutive times.`,
      timestamp: new Date(now).toISOString(),
    };

    this.alerts.push(alert);
    this._record("alert-raised", { alert });
    this._emit("alert", { alert });
  }

  start() {
    if (this.disposed || this.started) return false;

    this.started = true;

    if (typeof this.scheduler.start === "function") {
      this.scheduler.start();
    }

    this._record("monitor-started");
    this._emit("monitor-started");

    return true;
  }

  stop() {
    if (!this.started) return false;

    this.started = false;

    if (typeof this.scheduler.stop === "function") {
      this.scheduler.stop();
    }

    this._record("monitor-stopped");
    this._emit("monitor-stopped");

    return true;
  }

  getSamples(options = {}) {
    const limit = Math.max(
      1,
      Number(options.limit) || this.samples.length || 1
    );

    let result = [...this.samples];

    if (options.type) {
      result = result.filter(
        (sample) => sample.type === options.type
      );
    }

    return result.slice(-limit);
  }

  getAlerts(options = {}) {
    let result = [...this.alerts];

    if (options.severity) {
      result = result.filter(
        (alert) => alert.severity === options.severity
      );
    }

    const limit = Math.max(
      1,
      Number(options.limit) || result.length || 1
    );

    return result.slice(-limit);
  }

  clearAlerts() {
    const count = this.alerts.length;
    this.alerts = [];

    this._emit("alerts-cleared", { count });

    return count;
  }

  getStatus() {
    const schedulerStatus =
      typeof this.scheduler.getStatus === "function"
        ? this.scheduler.getStatus()
        : null;

    const completed = this.samples.filter(
      (sample) => sample.type === "run-completed"
    ).length;

    const failed = this.samples.filter(
      (sample) => sample.type === "run-failed"
    ).length;

    return {
      started: this.started,
      disposed: this.disposed,
      consecutiveFailures: this.consecutiveFailures,
      totalSamples: this.samples.length,
      totalAlerts: this.alerts.length,
      observedCompletedRuns: completed,
      observedFailedRuns: failed,
      scheduler: schedulerStatus,
    };
  }

  dispose() {
    if (this.disposed) return;

    this.stop();

    if (typeof this.unsubscribeScheduler === "function") {
      this.unsubscribeScheduler();
      this.unsubscribeScheduler = null;
    }

    if (
      this.options.disposeScheduler !== false &&
      typeof this.scheduler.dispose === "function"
    ) {
      this.scheduler.dispose();
    }

    this.listeners.clear();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerMonitor;