import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  DELIVERY_STARTED: "route-statistics-alert-delivery:started",
  DELIVERY_SUCCEEDED: "route-statistics-alert-delivery:succeeded",
  DELIVERY_FAILED: "route-statistics-alert-delivery:failed",
  DELIVERY_RETRIED: "route-statistics-alert-delivery:retried",
  DISPOSED: "route-statistics-alert-delivery:disposed",
});

export class RouteStatisticsDashboardAlertDelivery {
  constructor({
    dispatcher,
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    maxRetries = 2,
    retryDelayMs = 1000,
    maxConcurrentDeliveries = 5,
  } = {}) {
    if (!dispatcher || typeof dispatcher.dispatch !== "function") {
      throw new TypeError("An alert dispatcher is required.");
    }

    this.dispatcher = dispatcher;
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;

    this.maxRetries = Math.max(0, Math.floor(Number(maxRetries) || 0));
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
    this.maxConcurrentDeliveries = Math.max(
      1,
      Math.floor(Number(maxConcurrentDeliveries) || 5)
    );

    this.activeDeliveries = 0;
    this.deliveryCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.retryCount = 0;
    this.disposed = false;
  }

  async deliver(alert, options = {}) {
    this.assertActive();

    if (!alert || typeof alert !== "object" || Array.isArray(alert)) {
      throw new TypeError("A valid alert object is required.");
    }

    if (this.activeDeliveries >= this.maxConcurrentDeliveries) {
      return {
        success: false,
        skipped: true,
        reason: "delivery-capacity-reached",
        alertId: alert.id ?? null,
      };
    }

    this.activeDeliveries += 1;
    this.deliveryCount += 1;

    const deliveryId = `alert-delivery-${this.deliveryCount}-${this.clock()}`;
    const startedAt = this.clock();
    let lastResult = null;
    let lastError = null;

    this.emit(EVENTS.DELIVERY_STARTED, {
      deliveryId,
      alertId: alert.id ?? null,
      startedAt,
    });

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        this.assertActive();

        try {
          lastResult = await this.dispatcher.dispatch(alert, {
            ...options,
            context: {
              ...(options.context ?? {}),
              deliveryId,
              attempt: attempt + 1,
            },
          });

          if (lastResult?.success) {
            this.successCount += 1;

            const result = {
              success: true,
              deliveryId,
              alertId: alert.id ?? null,
              attempts: attempt + 1,
              dispatch: lastResult,
              durationMs: Math.max(0, this.clock() - startedAt),
            };

            this.emit(EVENTS.DELIVERY_SUCCEEDED, result);
            return result;
          }

          lastError = new Error(
            lastResult?.error ??
              `${lastResult?.failed ?? 0} alert channel(s) failed.`
          );
        } catch (error) {
          lastError = error;
        }

        if (attempt < this.maxRetries) {
          this.retryCount += 1;

          this.emit(EVENTS.DELIVERY_RETRIED, {
            deliveryId,
            alertId: alert.id ?? null,
            attempt: attempt + 1,
            nextAttempt: attempt + 2,
            error: lastError?.message ?? String(lastError),
          });

          if (this.retryDelayMs > 0) {
            await this.delay(this.retryDelayMs * (attempt + 1));
          }
        }
      }

      this.failureCount += 1;

      const failure = {
        success: false,
        deliveryId,
        alertId: alert.id ?? null,
        attempts: this.maxRetries + 1,
        error: lastError?.message ?? String(lastError),
        dispatch: lastResult,
        durationMs: Math.max(0, this.clock() - startedAt),
      };

      this.logError("Alert delivery failed.", lastError);
      this.emit(EVENTS.DELIVERY_FAILED, failure);

      return failure;
    } finally {
      this.activeDeliveries = Math.max(0, this.activeDeliveries - 1);
    }
  }

  async deliverMany(alerts, options = {}) {
    this.assertActive();

    if (!Array.isArray(alerts)) {
      throw new TypeError("Alerts must be provided as an array.");
    }

    const results = [];

    for (let index = 0; index < alerts.length; index += 1) {
      this.assertActive();

      const result = await this.deliver(alerts[index], {
        ...options,
        context: {
          ...(options.context ?? {}),
          batchIndex: index,
          batchSize: alerts.length,
        },
      });

      results.push(result);
    }

    return {
      success: results.every((result) => result.success),
      total: results.length,
      succeeded: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      skipped: results.filter((result) => result.skipped).length,
      results,
    };
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      deliveryCount: this.deliveryCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      retryCount: this.retryCount,
      activeDeliveries: this.activeDeliveries,
      maxConcurrentDeliveries: this.maxConcurrentDeliveries,
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
      // Logging errors must not interrupt delivery.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDelivery has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
      activeDeliveries: this.activeDeliveries,
    });
  }
}

export {
  EVENTS as RouteStatisticsDashboardAlertDeliveryEvents,
};

export default RouteStatisticsDashboardAlertDelivery;