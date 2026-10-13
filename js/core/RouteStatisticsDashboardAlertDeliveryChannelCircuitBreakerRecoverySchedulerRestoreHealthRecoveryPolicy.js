import { EventEmitter } from "./EventEmitter.js";

const DEFAULTS = {
  maxAttemptsPerWindow: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 30_000,
  maxHistory: 200,
};

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryPolicy {
  constructor({
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.attempts = [];
    this.lastRecoveryAt = null;
    this.disposed = false;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  evaluate({ force = false } = {}) {
    this.assertActive();

    const now = this.clock();
    this.pruneAttempts(now);

    const maxAttempts = Math.max(
      1,
      Math.floor(Number(this.options.maxAttemptsPerWindow) || 1)
    );

    const windowMs = Math.max(0, Number(this.options.windowMs) || 0);
    const cooldownMs = Math.max(0, Number(this.options.cooldownMs) || 0);

    const latestAttempt = this.attempts.at(-1) ?? null;
    const cooldownRemaining = latestAttempt
      ? Math.max(0, cooldownMs - (now - latestAttempt.timestamp))
      : 0;

    const attemptsRemaining = Math.max(
      0,
      maxAttempts - this.attempts.length
    );

    const allowed = force || (
      attemptsRemaining > 0 &&
      cooldownRemaining === 0
    );

    const result = {
      allowed,
      forced: force,
      evaluatedAt: new Date(now).toISOString(),
      attemptsInWindow: this.attempts.length,
      attemptsRemaining,
      maxAttempts,
      windowMs,
      cooldownRemainingMs: force ? 0 : cooldownRemaining,
      reason: allowed
        ? force
          ? "forced"
          : "policy_allowed"
        : attemptsRemaining === 0
          ? "attempt_limit_reached"
          : "cooldown_active",
    };

    this.events.emit("policy:evaluated", result);

    return result;
  }

  recordAttempt({
    success = false,
    reason = "unspecified",
    recoveryId = null,
  } = {}) {
    this.assertActive();

    const timestamp = this.clock();

    const attempt = {
      id: `restore-health-policy-${timestamp}-${this.attempts.length + 1}`,
      timestamp,
      success: Boolean(success),
      reason: String(reason),
      recoveryId,
    };

    this.attempts.push(attempt);
    this.lastRecoveryAt = timestamp;

    const maxHistory = Math.max(
      1,
      Math.floor(Number(this.options.maxHistory) || 1)
    );

    if (this.attempts.length > maxHistory) {
      this.attempts.splice(0, this.attempts.length - maxHistory);
    }

    this.pruneAttempts(timestamp);

    this.events.emit("policy:attempt-recorded", {
      ...attempt,
      timestamp: new Date(timestamp).toISOString(),
    });

    return { ...attempt };
  }

  pruneAttempts(now = this.clock()) {
    const windowMs = Math.max(0, Number(this.options.windowMs) || 0);
    const cutoff = now - windowMs;

    this.attempts = this.attempts.filter(
      (attempt) => attempt.timestamp >= cutoff
    );
  }

  reset() {
    this.assertActive();

    const previousCount = this.attempts.length;

    this.attempts = [];
    this.lastRecoveryAt = null;

    this.events.emit("policy:reset", {
      previousCount,
      timestamp: new Date(this.clock()).toISOString(),
    });

    return previousCount;
  }

  getSnapshot() {
    const now = this.clock();
    this.pruneAttempts(now);

    const successes = this.attempts.filter(
      (attempt) => attempt.success
    ).length;

    const failures = this.attempts.length - successes;

    return {
      evaluatedAt: new Date(now).toISOString(),
      attemptsInWindow: this.attempts.length,
      successfulAttempts: successes,
      failedAttempts: failures,
      lastRecoveryAt: this.lastRecoveryAt
        ? new Date(this.lastRecoveryAt).toISOString()
        : null,
      policy: {
        maxAttemptsPerWindow: this.options.maxAttemptsPerWindow,
        windowMs: this.options.windowMs,
        cooldownMs: this.options.cooldownMs,
      },
      decision: this.evaluate(),
    };
  }

  exportData() {
    return {
      version: 1,
      exportedAt: new Date(this.clock()).toISOString(),
      lastRecoveryAt: this.lastRecoveryAt,
      attempts: this.attempts.map((attempt) => ({ ...attempt })),
    };
  }

  importData(data) {
    this.assertActive();

    if (
      !data ||
      data.version !== 1 ||
      !Array.isArray(data.attempts)
    ) {
      throw new TypeError("Invalid restore health recovery policy archive.");
    }

    const attempts = data.attempts
      .filter((attempt) =>
        attempt &&
        Number.isFinite(attempt.timestamp) &&
        typeof attempt.success === "boolean"
      )
      .map((attempt) => ({
        id: String(attempt.id ?? ""),
        timestamp: attempt.timestamp,
        success: attempt.success,
        reason: String(attempt.reason ?? "imported"),
        recoveryId: attempt.recoveryId ?? null,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-Math.max(1, Number(this.options.maxHistory) || 1));

    this.attempts = attempts;
    this.lastRecoveryAt = Number.isFinite(data.lastRecoveryAt)
      ? data.lastRecoveryAt
      : attempts.at(-1)?.timestamp ?? null;

    this.pruneAttempts();

    this.events.emit("policy:imported", {
      count: this.attempts.length,
      timestamp: new Date(this.clock()).toISOString(),
    });

    return this.attempts.length;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health recovery policy has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.events.emit("policy:disposed", {
      timestamp: new Date(this.clock()).toISOString(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryPolicy;