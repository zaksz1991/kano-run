import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  STARTED: "route-statistics-alert-pipeline:started",
  COMPLETED: "route-statistics-alert-pipeline:completed",
  REJECTED: "route-statistics-alert-pipeline:rejected",
  FAILED: "route-statistics-alert-pipeline:failed",
  DISPOSED: "route-statistics-alert-pipeline:disposed",
});

export class RouteStatisticsDashboardAlertPipeline {
  constructor({
    evaluator,
    policy,
    engine,
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    maxConcurrentRuns = 1,
  } = {}) {
    if (!evaluator || typeof evaluator.evaluate !== "function") {
      throw new TypeError("An alert evaluator is required.");
    }

    if (!policy || typeof policy.evaluate !== "function") {
      throw new TypeError("An alert policy is required.");
    }

    if (!engine || typeof engine.evaluate !== "function") {
      throw new TypeError("An alert engine is required.");
    }

    this.evaluator = evaluator;
    this.policy = policy;
    this.engine = engine;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.maxConcurrentRuns = Math.max(
      1,
      Math.floor(Number(maxConcurrentRuns) || 1)
    );

    this.running = 0;
    this.runCount = 0;
    this.failedCount = 0;
    this.rejectedCount = 0;
    this.disposed = false;
  }

  async process(snapshot = {}, context = {}) {
    this.assertActive();

    if (this.running >= this.maxConcurrentRuns) {
      return {
        success: false,
        skipped: true,
        reason: "pipeline-busy",
        alerts: [],
      };
    }

    this.running += 1;
    this.runCount += 1;

    const runId = `alert-pipeline-${this.runCount}-${this.clock()}`;
    const startedAt = this.clock();

    this.emit(EVENTS.STARTED, {
      runId,
      startedAt,
      runCount: this.runCount,
    });

    try {
      const evaluation = await this.evaluator.evaluate(snapshot, context);

      if (!evaluation?.success) {
        throw new Error(
          evaluation?.error ?? "Alert evaluation did not succeed."
        );
      }

      const candidates = this.normalizeCandidates(evaluation);
      const approved = [];
      const rejected = [];

      for (const candidate of candidates) {
        this.assertActive();

        const decision = this.policy.evaluate(candidate);

        if (decision.approved) {
          approved.push(candidate);
        } else {
          rejected.push({
            alert: candidate,
            reason: decision.reason,
          });

          this.rejectedCount += 1;

          this.emit(EVENTS.REJECTED, {
            runId,
            alert: candidate,
            decision,
          });
        }
      }

      const engineResult = approved.length
        ? await this.engine.evaluate(
            {
              ...snapshot,
              alerts: approved,
            },
            {
              ...context,
              runId,
              approvedAlerts: approved,
              pipeline: true,
            }
          )
        : {
            success: true,
            triggered: [],
            suppressed: [],
            candidates: 0,
          };

      if (engineResult?.success === false) {
        throw new Error(
          engineResult.error ?? "The alert engine failed."
        );
      }

      const result = {
        success: true,
        runId,
        durationMs: Math.max(0, this.clock() - startedAt),
        evaluated: candidates.length,
        approved: approved.length,
        rejected: rejected.length,
        rejectedAlerts: rejected,
        evaluation,
        engine: engineResult,
      };

      this.emit(EVENTS.COMPLETED, result);
      return result;
    } catch (error) {
      this.failedCount += 1;

      const result = {
        success: false,
        runId,
        error: error?.message ?? String(error),
        durationMs: Math.max(0, this.clock() - startedAt),
      };

      this.logError("Alert pipeline processing failed.", error);
      this.emit(EVENTS.FAILED, result);

      return result;
    } finally {
      this.running = Math.max(0, this.running - 1);
    }
  }

  normalizeCandidates(evaluation) {
    if (Array.isArray(evaluation)) {
      return evaluation.filter(Boolean);
    }

    if (Array.isArray(evaluation?.alerts)) {
      return evaluation.alerts.filter(Boolean);
    }

    if (Array.isArray(evaluation?.matches)) {
      return evaluation.matches.filter(Boolean);
    }

    return [];
  }

  getStats() {
    return {
      runCount: this.runCount,
      running: this.running,
      maxConcurrentRuns: this.maxConcurrentRuns,
      failedCount: this.failedCount,
      rejectedCount: this.rejectedCount,
      disposed: this.disposed,
    };
  }

  subscribe(event, handler) {
    this.assertActive();

    if (typeof handler !== "function") {
      throw new TypeError("Event handler must be a function.");
    }

    if (typeof this.eventBus.on !== "function") {
      throw new Error(
        "The configured event bus does not support subscriptions."
      );
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
      // Logging failures must not interrupt pipeline processing.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertPipeline has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
      activeRuns: this.running,
    });
  }
}

export { EVENTS as RouteStatisticsDashboardAlertPipelineEvents };

export default RouteStatisticsDashboardAlertPipeline;