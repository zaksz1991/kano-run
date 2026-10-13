import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  maxAttempts: 3,
  retryDelayMs: 1000,
  maxHistory: 100,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecovery {
  constructor({
    health = null,
    monitor = null,
    persistence = null,
    options = {},
    clock = () => Date.now(),
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}) {
    this.health = health;
    this.monitor = monitor;
    this.persistence = persistence;
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.delay = delay;
    this.events = new EventEmitter();
    this.history = [];
    this.running = false;
    this.disposed = false;
    this.currentRecovery = null;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  async recover({ reason = "health_check_failed" } = {}) {
    this.assertActive();

    if (this.running) {
      return {
        success: false,
        reason: "recovery_in_progress",
      };
    }

    this.running = true;

    const recoveryId = `restore-health-recovery-${this.clock()}`;
    const startedAt = this.clock();

    const record = {
      id: recoveryId,
      reason,
      status: "running",
      startedAt: new Date(startedAt).toISOString(),
      completedAt: null,
      attempts: 0,
      errors: [],
    };

    this.currentRecovery = record;
    this.events.emit("recovery:started", this.clone(record));

    try {
      const maxAttempts = Math.max(
        1,
        Math.floor(Number(this.options.maxAttempts) || 1)
      );

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        this.assertActive();
        record.attempts = attempt;

        try {
          const healthResult = this.health?.check?.();

          if (healthResult?.healthy === true) {
            record.status = "recovered";
            record.completedAt = new Date(this.clock()).toISOString();

            this.finish(record);

            return {
              success: true,
              reason: "health_restored",
              recovery: this.clone(record),
            };
          }

          if (this.persistence) {
            if (typeof this.persistence.load === "function") {
              const loadResult = this.persistence.load();

              if (loadResult?.loaded) {
                record.status = "recovered";
                record.completedAt = new Date(this.clock()).toISOString();

                this.finish(record);

                return {
                  success: true,
                  reason: "persisted_health_restored",
                  recovery: this.clone(record),
                };
              }
            }

            if (typeof this.persistence.save === "function") {
              const saveResult = this.persistence.save();

              if (saveResult?.saved) {
                record.errors.push({
                  attempt,
                  message: "Health remains degraded; current state was saved.",
                  timestamp: new Date(this.clock()).toISOString(),
                });
              }
            }
          }

          if (attempt < maxAttempts) {
            await this.delay(
              Math.max(0, Number(this.options.retryDelayMs) || 0)
            );
          }
        } catch (error) {
          record.errors.push({
            attempt,
            message: error instanceof Error
              ? error.message
              : String(error),
            timestamp: new Date(this.clock()).toISOString(),
          });

          this.events.emit("recovery:attempt-failed", {
            id: recoveryId,
            attempt,
            error: record.errors[record.errors.length - 1].message,
          });

          if (attempt < maxAttempts) {
            await this.delay(
              Math.max(0, Number(this.options.retryDelayMs) || 0)
            );
          }
        }
      }

      record.status = "failed";
      record.completedAt = new Date(this.clock()).toISOString();

      this.finish(record);

      return {
        success: false,
        reason: "recovery_attempts_exhausted",
        recovery: this.clone(record),
      };
    } finally {
      this.running = false;
      this.currentRecovery = null;
    }
  }

  finish(record) {
    this.history.push(this.clone(record));

    const maxHistory = Math.max(
      1,
      Math.floor(Number(this.options.maxHistory) || 1)
    );

    if (this.history.length > maxHistory) {
      this.history.splice(0, this.history.length - maxHistory);
    }

    this.events.emit("recovery:completed", this.clone(record));
  }

  getStatus() {
    return {
      running: this.running,
      currentRecovery: this.currentRecovery
        ? this.clone(this.currentRecovery)
        : null,
      totalRecoveries: this.history.length,
      successfulRecoveries: this.history.filter(
        (item) => item.status === "recovered"
      ).length,
      failedRecoveries: this.history.filter(
        (item) => item.status === "failed"
      ).length,
    };
  }

  getHistory(limit = 20) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    return this.history.slice(-count).map((item) => this.clone(item));
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health recovery has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.events.emit("recovery:disposed", {
      timestamp: this.clock(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecovery;