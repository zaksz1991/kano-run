import { EventEmitter } from "./EventEmitter.js";

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryManager {
  constructor({
    recovery = null,
    policy = null,
    health = null,
    options = {},
    clock = () => Date.now(),
  } = {}) {
    this.recovery = recovery;
    this.policy = policy;
    this.health = health;
    this.options = { ...options };
    this.clock = clock;
    this.events = new EventEmitter();
    this.history = [];
    this.running = false;
    this.disposed = false;
    this.currentOperation = null;
  }

  on(type, handler) {
    return this.events.on(type, handler);
  }

  async execute({
    reason = "health_check_failed",
    force = false,
  } = {}) {
    this.assertActive();

    if (this.running) {
      return {
        success: false,
        reason: "recovery_in_progress",
      };
    }

    if (!this.recovery || typeof this.recovery.recover !== "function") {
      return {
        success: false,
        reason: "recovery_service_unavailable",
      };
    }

    const decision = this.policy?.evaluate?.({ force }) ?? {
      allowed: true,
      reason: "no_policy_configured",
    };

    if (!decision.allowed) {
      const result = {
        success: false,
        reason: decision.reason ?? "policy_denied",
        decision,
      };

      this.events.emit("manager:blocked", result);
      return result;
    }

    this.running = true;

    const startedAt = this.clock();
    const operationId = `restore-health-manager-${startedAt}`;

    this.currentOperation = {
      id: operationId,
      reason,
      startedAt: new Date(startedAt).toISOString(),
      status: "running",
    };

    this.events.emit("manager:started", {
      ...this.currentOperation,
      decision,
    });

    try {
      const recoveryResult = await this.recovery.recover({ reason });

      const success = recoveryResult?.success === true;

      const result = {
        id: operationId,
        success,
        reason: recoveryResult?.reason ?? reason,
        startedAt: this.currentOperation.startedAt,
        completedAt: new Date(this.clock()).toISOString(),
        durationMs: Math.max(0, this.clock() - startedAt),
        decision,
        recovery: recoveryResult,
      };

      this.policy?.recordAttempt?.({
        success,
        reason: result.reason,
        recoveryId: recoveryResult?.recovery?.id ?? operationId,
      });

      this.history.push(result);

      const maxHistory = Math.max(
        1,
        Math.floor(Number(this.options.maxHistory) || 100)
      );

      if (this.history.length > maxHistory) {
        this.history.splice(0, this.history.length - maxHistory);
      }

      this.events.emit(
        success ? "manager:succeeded" : "manager:failed",
        result
      );

      return result;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      const result = {
        id: operationId,
        success: false,
        reason: "recovery_execution_failed",
        error: message,
        startedAt: this.currentOperation.startedAt,
        completedAt: new Date(this.clock()).toISOString(),
        durationMs: Math.max(0, this.clock() - startedAt),
      };

      this.policy?.recordAttempt?.({
        success: false,
        reason: result.reason,
        recoveryId: operationId,
      });

      this.history.push(result);

      this.events.emit("manager:failed", result);

      return result;
    } finally {
      this.running = false;
      this.currentOperation = null;
    }
  }

  async recoverIfUnhealthy() {
    this.assertActive();

    let healthResult;

    try {
      healthResult = this.health?.check?.();
    } catch (error) {
      healthResult = {
        healthy: false,
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!healthResult) {
      return {
        success: false,
        reason: "health_checker_unavailable",
      };
    }

    if (healthResult.healthy === true) {
      return {
        success: true,
        reason: "already_healthy",
        health: healthResult,
      };
    }

    return this.execute({
      reason: "automatic_health_recovery",
    });
  }

  getStatus() {
    return {
      running: this.running,
      currentOperation: this.currentOperation
        ? { ...this.currentOperation }
        : null,
      totalOperations: this.history.length,
      successfulOperations: this.history.filter(
        (item) => item.success
      ).length,
      failedOperations: this.history.filter(
        (item) => !item.success
      ).length,
      policy: this.policy?.getSnapshot?.() ?? null,
    };
  }

  getHistory(limit = 20) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));

    if (count === 0) return [];

    return this.history.slice(-count).map((item) => ({
      ...item,
      decision: item.decision ? { ...item.decision } : undefined,
    }));
  }

  clearHistory() {
    this.assertActive();

    const count = this.history.length;
    this.history = [];

    this.events.emit("manager:history-cleared", {
      count,
      timestamp: new Date(this.clock()).toISOString(),
    });

    return count;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Restore health recovery manager has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.events.emit("manager:disposed", {
      timestamp: new Date(this.clock()).toISOString(),
    });

    this.events.clear?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryManager;