import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator.js";
import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor.js";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SAMPLES = 1000;

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics {
  constructor(options = {}) {
    this.orchestrator =
      options.orchestrator ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestrator(options);

    this.monitor =
      options.monitor ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMonitor({
        ...options,
        orchestrator: this.orchestrator,
      });

    this.windowMs = Math.max(
      60_000,
      Number(options.windowMs) || DEFAULT_WINDOW_MS
    );

    this.maxSamples = Math.max(
      100,
      Number(options.maxSamples) || DEFAULT_MAX_SAMPLES
    );

    this.clock = options.clock ?? (() => Date.now());

    this.samples = [];

    this.counters = {
      checks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      processingRuns: 0,
      processingFailures: 0,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0,
    };

    this.previousTaskCounts = {
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    this.lastSnapshot = null;
  }

  recordHealthCheck(result) {
    const timestamp = this.clock();
    const healthy = result?.healthy === true;

    this.counters.checks += 1;

    if (healthy) {
      this.counters.healthyChecks += 1;
    } else {
      this.counters.unhealthyChecks += 1;
    }

    this.addSample({
      type: "health_check",
      timestamp,
      success: healthy,
    });

    this.lastSnapshot = {
      timestamp,
      healthy,
      result: this.sanitize(result),
    };

    return this.snapshot();
  }

  recordProcessingRun(result) {
    const timestamp = this.clock();
    const failed = result?.success === false;

    this.counters.processingRuns += 1;

    if (failed) {
      this.counters.processingFailures += 1;
    }

    this.addSample({
      type: "processing",
      timestamp,
      success: !failed,
    });

    this.lastSnapshot = {
      timestamp,
      processingSuccess: !failed,
      result: this.sanitize(result),
    };

    return this.snapshot();
  }

  async collect() {
    const health = await this.monitor.check();
    this.recordHealthCheck(health);

    const status = this.orchestrator.getStatus();

    const completed = Number(status.completedCount) || 0;
    const failed = Number(status.failedCount) || 0;
    const cancelled = Number(status.cancelledCount) || 0;

    this.counters.completedTasks = completed;
    this.counters.failedTasks = failed;
    this.counters.cancelledTasks = cancelled;

    this.previousTaskCounts = {
      completed,
      failed,
      cancelled,
    };

    return {
      timestamp: this.clock(),
      health,
      orchestrator: status,
      metrics: this.snapshot(),
    };
  }

  addSample(sample) {
    this.samples.push(sample);

    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }

    this.prune();
  }

  prune() {
    const cutoff = this.clock() - this.windowMs;

    this.samples = this.samples.filter(
      (sample) => sample.timestamp >= cutoff
    );
  }

  getWindowMetrics() {
    this.prune();

    const groups = {
      health_check: [],
      processing: [],
    };

    for (const sample of this.samples) {
      if (groups[sample.type]) {
        groups[sample.type].push(sample);
      }
    }

    return {
      windowMs: this.windowMs,
      sampleCount: this.samples.length,
      healthChecks: this.summarize(groups.health_check),
      processingRuns: this.summarize(groups.processing),
    };
  }

  summarize(samples) {
    const total = samples.length;
    const successes = samples.filter((sample) => sample.success).length;

    return {
      total,
      successes,
      failures: total - successes,
      successRate: total ? successes / total : null,
      failureRate: total ? (total - successes) / total : null,
    };
  }

  snapshot() {
    return {
      counters: { ...this.counters },
      window: this.getWindowMetrics(),
      lastSnapshot: this.lastSnapshot,
      monitor: this.monitor.getStatus(),
      orchestrator: this.orchestrator.getStatus(),
    };
  }

  reset() {
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }

    this.samples = [];
    this.lastSnapshot = null;

    this.previousTaskCounts = {
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    return this.snapshot();
  }

  sanitize(value) {
    try {
      return JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Error) {
            return {
              name: item.name,
              message: item.message,
            };
          }

          if (typeof item === "bigint") {
            return item.toString();
          }

          if (typeof item === "function") {
            return undefined;
          }

          return item;
        })
      );
    } catch {
      return { summary: String(value) };
    }
  }

  destroy() {
    this.samples = [];
    this.monitor.destroy();
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorMetrics;