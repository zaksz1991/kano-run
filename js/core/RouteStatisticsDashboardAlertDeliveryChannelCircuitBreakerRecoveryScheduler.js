import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULTS = {
  intervalMs: 15000,
  initialDelayMs: 1000,
  maxRetries: 3,
  retryDelayMs: 5000,
  maxRetryDelayMs: 60000,
  batchSize: 10,
  enabled: true,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryScheduler {
  constructor({
    recoveryManager,
    registry,
    policy,
    eventBus = new EventBus(),
    logger = new Logger(),
    config = {},
    clock = () => Date.now(),
  } = {}) {
    if (!recoveryManager) {
      throw new TypeError("recoveryManager is required.");
    }

    this.recoveryManager = recoveryManager;
    this.registry = registry ?? recoveryManager.registry ?? null;
    this.policy = policy ?? recoveryManager.policy ?? null;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.config = { ...DEFAULTS, ...config };

    this.running = false;
    this.disposed = false;
    this.timer = null;
    this.activeRun = null;
    this.runRequested = false;
    this.retryTimer = null;
    this.retryAttempts = new Map();
    this.lastRunAt = null;
    this.nextRunAt = null;
    this.lastResult = null;
    this.runCount = 0;
    this.failureCount = 0;
  }

  start({ immediate = false } = {}) {
    this.assertActive();

    if (!this.config.enabled || this.running) {
      return false;
    }

    this.running = true;
    this.emit("started", {
      at: this.clock(),
      immediate,
      intervalMs: this.config.intervalMs,
    });

    if (immediate) {
      this.scheduleRun(0);
    } else {
      this.scheduleRun(this.config.initialDelayMs);
    }

    return true;
  }

  stop() {
    if (this.disposed || !this.running) {
      return false;
    }

    this.running = false;
    this.clearTimers();
    this.nextRunAt = null;

    this.emit("stopped", {
      at: this.clock(),
      runCount: this.runCount,
      failureCount: this.failureCount,
    });

    return true;
  }

  scheduleRun(delayMs = this.config.intervalMs) {
    if (!this.running || this.disposed) {
      return false;
    }

    this.clearMainTimer();

    const delay = Math.max(0, Number(delayMs) || 0);
    this.nextRunAt = this.clock() + delay;

    this.timer = setTimeout(() => {
      this.timer = null;
      this.executeScheduledRun();
    }, delay);

    return true;
  }

  async executeScheduledRun() {
    if (!this.running || this.disposed) {
      return null;
    }

    if (this.activeRun) {
      this.runRequested = true;
      return this.activeRun;
    }

    this.activeRun = this.runRecoveryCycle();

    try {
      return await this.activeRun;
    } finally {
      this.activeRun = null;

      if (!this.running || this.disposed) {
        return;
      }

      if (this.runRequested) {
        this.runRequested = false;
        this.scheduleRun(0);
      } else {
        this.scheduleRun(this.config.intervalMs);
      }
    }
  }

  async runRecoveryCycle() {
    const startedAt = this.clock();
    const runId = `recovery-${startedAt}-${this.runCount + 1}`;

    this.lastRunAt = startedAt;
    this.runCount += 1;

    const result = {
      runId,
      startedAt,
      finishedAt: null,
      examined: 0,
      recovered: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };

    this.emit("cycle-started", {
      runId,
      startedAt,
    });

    try {
      const candidates = await this.getRecoveryCandidates();
      const batch = candidates.slice(0, this.config.batchSize);

      result.examined = batch.length;

      for (const candidate of batch) {
        if (this.disposed || !this.running) {
          break;
        }

        const key = this.getCandidateKey(candidate);

        if (!key) {
          result.skipped += 1;
          result.results.push({
            key: null,
            status: "skipped",
            reason: "Missing channel or circuit identifier.",
          });
          continue;
        }

        try {
          const recoveryResult = await this.recoverCandidate(candidate, key);

          if (recoveryResult?.recovered === true ||
              recoveryResult?.success === true) {
            result.recovered += 1;
            this.retryAttempts.delete(key);
          } else if (recoveryResult?.skipped === true) {
            result.skipped += 1;
          } else {
            result.failed += 1;
            this.recordFailure(key, recoveryResult?.error);
          }

          result.results.push({
            key,
            status: recoveryResult?.recovered === true ||
                    recoveryResult?.success === true
              ? "recovered"
              : recoveryResult?.skipped === true
                ? "skipped"
                : "failed",
            details: recoveryResult ?? null,
          });
        } catch (error) {
          result.failed += 1;
          this.recordFailure(key, error);

          result.results.push({
            key,
            status: "failed",
            error: this.serializeError(error),
          });

          this.log("error", "Circuit recovery failed.", {
            runId,
            key,
            error: this.serializeError(error),
          });
        }
      }

      result.finishedAt = this.clock();
      this.lastResult = result;

      this.emit("cycle-completed", result);

      return result;
    } catch (error) {
      this.failureCount += 1;
      result.failed += 1;
      result.finishedAt = this.clock();
      result.error = this.serializeError(error);
      this.lastResult = result;

      this.emit("cycle-failed", result);

      this.log("error", "Recovery cycle failed.", {
        runId,
        error: result.error,
      });

      return result;
    }
  }

  async getRecoveryCandidates() {
    if (typeof this.recoveryManager.getRecoveryCandidates === "function") {
      const candidates = await this.recoveryManager.getRecoveryCandidates();
      return Array.isArray(candidates) ? candidates : [];
    }

    if (typeof this.recoveryManager.getCandidates === "function") {
      const candidates = await this.recoveryManager.getCandidates();
      return Array.isArray(candidates) ? candidates : [];
    }

    if (this.registry &&
        typeof this.registry.getRecoverable === "function") {
      const candidates = await this.registry.getRecoverable();
      return Array.isArray(candidates) ? candidates : [];
    }

    if (this.registry &&
        typeof this.registry.getAll === "function") {
      const circuits = await this.registry.getAll();

      return (Array.isArray(circuits) ? circuits : [])
        .filter((circuit) => this.isRecoveryCandidate(circuit));
    }

    if (this.registry &&
        this.registry.circuits instanceof Map) {
      return [...this.registry.circuits.entries()]
        .map(([key, circuit]) => ({
          key,
          circuit,
        }))
        .filter(({ circuit }) => this.isRecoveryCandidate(circuit));
    }

    return [];
  }

  isRecoveryCandidate(candidate) {
    const circuit = candidate?.circuit ?? candidate;

    if (!circuit || typeof circuit !== "object") {
      return false;
    }

    const state = String(
      circuit.state ??
      circuit.status ??
      circuit.getState?.() ??
      "",
    ).toLowerCase();

    return [
      "open",
      "half_open",
      "half-open",
      "degraded",
      "recovering",
    ].includes(state);
  }

  async recoverCandidate(candidate, key) {
    const attempts = this.retryAttempts.get(key) ?? 0;

    if (attempts >= this.config.maxRetries) {
      return {
        skipped: true,
        reason: "Maximum recovery retries reached.",
        attempts,
      };
    }

    if (this.policy &&
        typeof this.policy.evaluate === "function") {
      const decision = await this.policy.evaluate(candidate, {
        key,
        attempts,
        now: this.clock(),
      });

      if (decision === false || decision?.allowed === false) {
        return {
          skipped: true,
          reason: decision?.reason ?? "Recovery blocked by policy.",
        };
      }
    }

    if (typeof this.recoveryManager.recoverChannel === "function") {
      return this.recoveryManager.recoverChannel(key, {
        candidate,
        scheduled: true,
        attempt: attempts + 1,
      });
    }

    if (typeof this.recoveryManager.recover === "function") {
      return this.recoveryManager.recover(candidate, {
        key,
        scheduled: true,
        attempt: attempts + 1,
      });
    }

    throw new Error(
      "Recovery manager must implement recoverChannel() or recover().",
    );
  }

  recordFailure(key, error) {
    const attempts = (this.retryAttempts.get(key) ?? 0) + 1;

    this.retryAttempts.set(key, attempts);
    this.failureCount += 1;

    const delay = Math.min(
      this.config.retryDelayMs * (2 ** Math.max(0, attempts - 1)),
      this.config.maxRetryDelayMs,
    );

    this.emit("recovery-retry", {
      key,
      attempts,
      maxRetries: this.config.maxRetries,
      nextRetryAt: this.clock() + delay,
      error: error ? this.serializeError(error) : null,
    });

    if (attempts >= this.config.maxRetries) {
      this.emit("recovery-exhausted", {
        key,
        attempts,
        error: error ? this.serializeError(error) : null,
      });
    }
  }

  getCandidateKey(candidate) {
    const circuit = candidate?.circuit ?? candidate;

    const key =
      candidate?.key ??
      candidate?.channelId ??
      candidate?.channel ??
      candidate?.id ??
      circuit?.channelId ??
      circuit?.channel ??
      circuit?.id;

    return key == null ? null : String(key);
  }

  getStatus() {
    return {
      running: this.running,
      disposed: this.disposed,
      runCount: this.runCount,
      failureCount: this.failureCount,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      activeRun: Boolean(this.activeRun),
      pendingRetries: [...this.retryAttempts.entries()].map(
        ([key, attempts]) => ({ key, attempts }),
      ),
      lastResult: this.lastResult,
    };
  }

  resetRetries(key = null) {
    if (key == null) {
      this.retryAttempts.clear();
      return true;
    }

    return this.retryAttempts.delete(String(key));
  }

  updateConfig(config = {}) {
    this.assertActive();

    this.config = {
      ...this.config,
      ...config,
    };

    if (this.running) {
      this.scheduleRun(this.config.intervalMs);
    }

    this.emit("config-updated", {
      config: { ...this.config },
      at: this.clock(),
    });

    return this.getStatus();
  }

  emit(event, payload) {
    try {
      this.eventBus?.emit?.(
        `route-statistics:alert-delivery:circuit-recovery-scheduler:${event}`,
        payload,
      );
    } catch (error) {
      this.log("warn", "Failed to emit scheduler event.", {
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
      // Logging must not interrupt recovery scheduling.
    }
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }

  clearMainTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  clearTimers() {
    this.clearMainTimer();

    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryScheduler has been disposed.",
      );
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.clearTimers();
    this.retryAttempts.clear();
    this.runRequested = false;
    this.disposed = true;

    this.emit("disposed", {
      at: this.clock(),
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoveryScheduler;