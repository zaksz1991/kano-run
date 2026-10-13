import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  EVALUATION_STARTED: "route-statistics-alert-evaluator:started",
  EVALUATION_COMPLETED: "route-statistics-alert-evaluator:completed",
  EVALUATION_FAILED: "route-statistics-alert-evaluator:failed",
  DISPOSED: "route-statistics-alert-evaluator:disposed",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  errorRate: 0.1,
  warningRate: 0.05,
  minimumSamples: 5,
  responseTimeMs: 2000,
  staleDataMs: 300000,
  storageUsage: 0.9,
  failureCount: 3,
});

export class RouteStatisticsDashboardAlertEvaluator {
  constructor({
    eventBus = new EventBus(),
    logger = new Logger(),
    thresholds = {},
    clock = () => Date.now(),
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };

    this.evaluationCount = 0;
    this.failedCount = 0;
    this.disposed = false;
  }

  evaluate(snapshot = {}, context = {}) {
    this.assertActive();

    const startedAt = this.clock();
    this.evaluationCount += 1;

    this.emit(EVENTS.EVALUATION_STARTED, {
      evaluation: this.evaluationCount,
      startedAt,
    });

    try {
      const alerts = [
        ...this.evaluateErrorRate(snapshot),
        ...this.evaluateResponseTime(snapshot),
        ...this.evaluateDataFreshness(snapshot),
        ...this.evaluateStorage(snapshot),
        ...this.evaluateFailures(snapshot),
      ];

      const result = {
        success: true,
        evaluation: this.evaluationCount,
        evaluatedAt: new Date(this.clock()).toISOString(),
        durationMs: Math.max(0, this.clock() - startedAt),
        alerts,
        context,
      };

      this.emit(EVENTS.EVALUATION_COMPLETED, result);
      return result;
    } catch (error) {
      this.failedCount += 1;

      const result = {
        success: false,
        evaluation: this.evaluationCount,
        error: error?.message ?? String(error),
        alerts: [],
      };

      this.logError("Dashboard alert evaluation failed.", error);
      this.emit(EVENTS.EVALUATION_FAILED, result);

      return result;
    }
  }

  evaluateErrorRate(snapshot) {
    const metrics = snapshot.metrics ?? snapshot;
    const errors = this.toFiniteNumber(
      metrics.errorCount ?? metrics.errors
    );
    const requests = this.toFiniteNumber(
      metrics.requestCount ?? metrics.totalRequests
    );

    if (errors === null || requests === null || requests <= 0) {
      return [];
    }

    if (requests < this.thresholds.minimumSamples) {
      return [];
    }

    const rate = errors / requests;

    if (rate >= this.thresholds.errorRate) {
      return [
        this.createAlert({
          ruleId: "error-rate-critical",
          type: "error_rate",
          severity: "critical",
          subject: "error-rate",
          title: "High error rate",
          message: `The error rate is ${(rate * 100).toFixed(1)}%.`,
          value: rate,
          threshold: this.thresholds.errorRate,
        }),
      ];
    }

    if (rate >= this.thresholds.warningRate) {
      return [
        this.createAlert({
          ruleId: "error-rate-warning",
          type: "error_rate",
          severity: "warning",
          subject: "error-rate",
          title: "Elevated error rate",
          message: `The error rate is ${(rate * 100).toFixed(1)}%.`,
          value: rate,
          threshold: this.thresholds.warningRate,
        }),
      ];
    }

    return [];
  }

  evaluateResponseTime(snapshot) {
    const metrics = snapshot.metrics ?? snapshot;
    const responseTime = this.toFiniteNumber(
      metrics.averageResponseTimeMs ??
        metrics.responseTimeMs ??
        metrics.avgResponseTime
    );

    if (
      responseTime === null ||
      responseTime < this.thresholds.responseTimeMs
    ) {
      return [];
    }

    return [
      this.createAlert({
        ruleId: "response-time-high",
        type: "response_time",
        severity: "warning",
        subject: "response-time",
        title: "Slow dashboard response",
        message: `Average response time is ${Math.round(responseTime)} ms.`,
        value: responseTime,
        threshold: this.thresholds.responseTimeMs,
      }),
    ];
  }

  evaluateDataFreshness(snapshot) {
    const timestamp =
      snapshot.updatedAt ??
      snapshot.lastUpdatedAt ??
      snapshot.timestamp;

    if (timestamp === undefined || timestamp === null) {
      return [];
    }

    const parsed =
      typeof timestamp === "number"
        ? timestamp
        : Date.parse(String(timestamp));

    if (!Number.isFinite(parsed)) return [];

    const ageMs = Math.max(0, this.clock() - parsed);

    if (ageMs < this.thresholds.staleDataMs) {
      return [];
    }

    return [
      this.createAlert({
        ruleId: "statistics-data-stale",
        type: "stale_data",
        severity: "warning",
        subject: "statistics-data",
        title: "Statistics data is stale",
        message: `The latest statistics are ${Math.round(ageMs / 1000)} seconds old.`,
        value: ageMs,
        threshold: this.thresholds.staleDataMs,
      }),
    ];
  }

  evaluateStorage(snapshot) {
    const storage = snapshot.storage ?? snapshot.metrics?.storage;

    if (!storage || typeof storage !== "object") {
      return [];
    }

    const used = this.toFiniteNumber(
      storage.usedBytes ?? storage.used
    );
    const capacity = this.toFiniteNumber(
      storage.capacityBytes ?? storage.capacity
    );

    if (used === null || capacity === null || capacity <= 0) {
      return [];
    }

    const ratio = used / capacity;

    if (ratio < this.thresholds.storageUsage) {
      return [];
    }

    return [
      this.createAlert({
        ruleId: "storage-usage-high",
        type: "storage_usage",
        severity: "warning",
        subject: "storage",
        title: "Storage usage is high",
        message: `Storage usage is ${(ratio * 100).toFixed(1)}%.`,
        value: ratio,
        threshold: this.thresholds.storageUsage,
      }),
    ];
  }

  evaluateFailures(snapshot) {
    const metrics = snapshot.metrics ?? snapshot;
    const failures = this.toFiniteNumber(
      metrics.consecutiveFailures ?? metrics.failureCount
    );

    if (
      failures === null ||
      failures < this.thresholds.failureCount
    ) {
      return [];
    }

    return [
      this.createAlert({
        ruleId: "consecutive-failures",
        type: "failures",
        severity: "critical",
        subject: "consecutive-failures",
        title: "Repeated processing failures",
        message: `${Math.floor(failures)} consecutive failures were detected.`,
        value: failures,
        threshold: this.thresholds.failureCount,
      }),
    ];
  }

  createAlert({
    ruleId,
    type,
    severity,
    subject,
    title,
    message,
    value,
    threshold,
  }) {
    return {
      id: `${ruleId}:${this.clock()}`,
      ruleId,
      type,
      severity,
      subject,
      title,
      message,
      value,
      threshold,
      createdAt: new Date(this.clock()).toISOString(),
    };
  }

  toFiniteNumber(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  updateThresholds(nextThresholds = {}) {
    this.assertActive();

    for (const [key, value] of Object.entries(nextThresholds)) {
      if (
        !(key in DEFAULT_THRESHOLDS) ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
      ) {
        throw new TypeError(`Invalid alert threshold: ${key}`);
      }
    }

    this.thresholds = {
      ...this.thresholds,
      ...Object.fromEntries(
        Object.entries(nextThresholds).map(([key, value]) => [
          key,
          Number(value),
        ])
      ),
    };

    return this.getThresholds();
  }

  getThresholds() {
    return { ...this.thresholds };
  }

  getStats() {
    return {
      evaluationCount: this.evaluationCount,
      failedCount: this.failedCount,
      thresholds: this.getThresholds(),
      disposed: this.disposed,
    };
  }

  subscribe(event, handler) {
    this.assertActive();

    if (typeof handler !== "function") {
      throw new TypeError("Event handler must be a function.");
    }

    if (typeof this.eventBus.on !== "function") {
      throw new Error("The configured event bus does not support subscriptions.");
    }

    return this.eventBus.on(event, handler);
  }

  emit(event, payload) {
    try {
      if (typeof this.eventBus.emit === "function") {
        this.eventBus.emit(event, payload);
      } else if (typeof this.eventBus.publish === "function") {
        this.eventBus.publish(event, payload);
      }
    } catch (error) {
      this.logError(`Failed to emit "${event}".`, error);
    }
  }

  logError(message, error) {
    try {
      this.logger.error?.(message, error);
    } catch {
      // Logging errors must not interrupt evaluation.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertEvaluator has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export { EVENTS as RouteStatisticsDashboardAlertEvaluatorEvents };

export default RouteStatisticsDashboardAlertEvaluator;