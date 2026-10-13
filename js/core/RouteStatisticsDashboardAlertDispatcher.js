import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  DISPATCH_STARTED: "route-statistics-alert-dispatcher:started",
  DISPATCH_COMPLETED: "route-statistics-alert-dispatcher:completed",
  DISPATCH_FAILED: "route-statistics-alert-dispatcher:failed",
  CHANNEL_REGISTERED: "route-statistics-alert-dispatcher:channel-registered",
  CHANNEL_REMOVED: "route-statistics-alert-dispatcher:channel-removed",
  DISPOSED: "route-statistics-alert-dispatcher:disposed",
});

export class RouteStatisticsDashboardAlertDispatcher {
  constructor({
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    timeoutMs = 10000,
    maxRetries = 1,
    retryDelayMs = 500,
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.timeoutMs = Math.max(1, Number(timeoutMs) || 10000);
    this.maxRetries = Math.max(0, Math.floor(Number(maxRetries) || 0));
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);

    this.channels = new Map();
    this.dispatchCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.disposed = false;
  }

  registerChannel(name, handler, options = {}) {
    this.assertActive();

    const channelName = String(name ?? "").trim();

    if (!channelName) {
      throw new TypeError("Channel name is required.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Channel handler must be a function.");
    }

    const channel = {
      name: channelName,
      handler,
      enabled: options.enabled !== false,
      timeoutMs: Math.max(
        1,
        Number(options.timeoutMs) || this.timeoutMs
      ),
      maxRetries: Math.max(
        0,
        Math.floor(Number(options.maxRetries) || 0)
      ),
      metadata: { ...(options.metadata ?? {}) },
      dispatched: 0,
      failed: 0,
    };

    this.channels.set(channelName, channel);

    this.emit(EVENTS.CHANNEL_REGISTERED, {
      name: channelName,
      registeredAt: this.clock(),
    });

    return () => this.removeChannel(channelName);
  }

  removeChannel(name) {
    this.assertActive();

    const channelName = String(name);
    const removed = this.channels.delete(channelName);

    if (removed) {
      this.emit(EVENTS.CHANNEL_REMOVED, {
        name: channelName,
        removedAt: this.clock(),
      });
    }

    return removed;
  }

  setChannelEnabled(name, enabled) {
    this.assertActive();

    const channel = this.channels.get(String(name));
    if (!channel) return false;

    channel.enabled = Boolean(enabled);
    return true;
  }

  async dispatch(alert, options = {}) {
    this.assertActive();

    if (!alert || typeof alert !== "object" || Array.isArray(alert)) {
      throw new TypeError("A valid alert object is required.");
    }

    const startedAt = this.clock();
    const dispatchId = `alert-dispatch-${++this.dispatchCount}-${startedAt}`;

    const selectedChannels = this.selectChannels(options.channels);
    const results = [];

    this.emit(EVENTS.DISPATCH_STARTED, {
      dispatchId,
      alertId: alert.id ?? null,
      channelCount: selectedChannels.length,
      startedAt,
    });

    const settled = await Promise.all(
      selectedChannels.map(async (channel) => {
        const result = await this.dispatchToChannel(
          channel,
          alert,
          {
            ...options.context,
            dispatchId,
          }
        );

        results.push(result);
        return result;
      })
    );

    const successful = settled.filter((result) => result.success);
    const failed = settled.filter((result) => !result.success);

    this.successCount += successful.length;
    this.failureCount += failed.length;

    const summary = {
      success: failed.length === 0,
      dispatchId,
      alertId: alert.id ?? null,
      attempted: settled.length,
      succeeded: successful.length,
      failed: failed.length,
      results: settled,
      durationMs: Math.max(0, this.clock() - startedAt),
    };

    this.emit(
      failed.length
        ? EVENTS.DISPATCH_FAILED
        : EVENTS.DISPATCH_COMPLETED,
      summary
    );

    return summary;
  }

  selectChannels(requestedNames) {
    const requested = Array.isArray(requestedNames)
      ? new Set(requestedNames.map(String))
      : null;

    return [...this.channels.values()].filter(
      (channel) =>
        channel.enabled &&
        (!requested || requested.has(channel.name))
    );
  }

  async dispatchToChannel(channel, alert, context) {
    const startedAt = this.clock();
    let lastError = null;

    for (let attempt = 0; attempt <= channel.maxRetries; attempt += 1) {
      try {
        const result = await this.withTimeout(
          Promise.resolve().then(() =>
            channel.handler(alert, {
              ...context,
              channel: channel.name,
              attempt: attempt + 1,
              metadata: { ...channel.metadata },
            })
          ),
          channel.timeoutMs,
          channel.name
        );

        channel.dispatched += 1;

        return {
          channel: channel.name,
          success: true,
          attempt: attempt + 1,
          result,
          durationMs: Math.max(0, this.clock() - startedAt),
        };
      } catch (error) {
        lastError = error;

        if (attempt < channel.maxRetries && this.retryDelayMs > 0) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    channel.failed += 1;

    this.logError(
      `Alert dispatch failed for channel "${channel.name}".`,
      lastError
    );

    return {
      channel: channel.name,
      success: false,
      attempt: channel.maxRetries + 1,
      error: lastError?.message ?? String(lastError),
      durationMs: Math.max(0, this.clock() - startedAt),
    };
  }

  withTimeout(promise, timeoutMs, channelName) {
    let timer;

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Channel "${channelName}" timed out after ${timeoutMs} ms.`
          )
        );
      }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => {
      clearTimeout(timer);
    });
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getChannels() {
    return [...this.channels.values()].map((channel) => ({
      name: channel.name,
      enabled: channel.enabled,
      timeoutMs: channel.timeoutMs,
      maxRetries: channel.maxRetries,
      metadata: { ...channel.metadata },
      dispatched: channel.dispatched,
      failed: channel.failed,
    }));
  }

  getStats() {
    return {
      registeredChannels: this.channels.size,
      dispatchCount: this.dispatchCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
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
      // Logging failures must not interrupt dispatch.
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDispatcher has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.channels.clear();

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export {
  EVENTS as RouteStatisticsDashboardAlertDispatcherEvents,
};

export default RouteStatisticsDashboardAlertDispatcher;