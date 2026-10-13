import { STATES } from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreaker.js";

const DEFAULT_OPTIONS = Object.freeze({
  pollIntervalMs: 5000,
  historyLimit: 300,
  unhealthyOpenThreshold: 1,
  emitUnchangedSnapshots: false,
});

export default class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerMonitor {
  constructor(registry, options = {}) {
    if (!registry) {
      throw new TypeError("A circuit breaker registry is required.");
    }

    this.registry = registry;
    this.options = {
      pollIntervalMs: this.toPositiveInteger(
        options.pollIntervalMs,
        DEFAULT_OPTIONS.pollIntervalMs,
      ),
      historyLimit: this.toPositiveInteger(
        options.historyLimit,
        DEFAULT_OPTIONS.historyLimit,
      ),
      unhealthyOpenThreshold: this.toPositiveInteger(
        options.unhealthyOpenThreshold,
        DEFAULT_OPTIONS.unhealthyOpenThreshold,
      ),
      emitUnchangedSnapshots:
        options.emitUnchangedSnapshots === true,
    };

    this.listeners = new Map();
    this.history = [];
    this.previousSnapshot = null;
    this.timer = null;
    this.started = false;
    this.disposed = false;
    this.polling = false;
    this.pendingPoll = false;
    this.lastPollAt = null;
    this.lastError = null;
  }

  toPositiveInteger(value, fallback) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
      ? number
      : fallback;
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Circuit breaker monitor has been disposed.");
    }
  }

  subscribe(event, listener) {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    const eventName = String(event);

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const listeners = this.listeners.get(eventName);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  on(event, listener) {
    return this.subscribe(event, listener);
  }

  emit(event, payload) {
    const listeners = [
      ...(this.listeners.get(event) || []),
      ...(this.listeners.get("*") || []),
    ];

    for (const listener of listeners) {
      try {
        listener(payload, event);
      } catch (error) {
        if (event !== "listener_error") {
          this.emit("listener_error", {
            event,
            error: String(error?.message || error),
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  record(type, payload = {}) {
    const entry = {
      type,
      timestamp: Date.now(),
      payload: this.clone(payload),
    };

    this.history.push(entry);

    if (this.history.length > this.options.historyLimit) {
      this.history.splice(
        0,
        this.history.length - this.options.historyLimit,
      );
    }

    this.emit("history", this.clone(entry));

    return entry;
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Use JSON cloning for serializable snapshots.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  normalizeState(state) {
    return {
      channel: state.channel,
      state: state.state,
      failures: state.failures,
      successes: state.successes,
      halfOpenCalls: state.halfOpenCalls,
      openedAt: state.openedAt,
      nextAttemptAt: state.nextAttemptAt,
      lastFailureAt: state.lastFailureAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      transitions: state.transitions,
      canExecute: state.canExecute,
      remainingOpenMs: state.remainingOpenMs,
    };
  }

  createSnapshot() {
    const channels = this.registry
      .getAllStates()
      .map((state) => this.normalizeState(state));

    const openChannels = channels.filter(
      (channel) => channel.state === STATES.OPEN,
    );

    const halfOpenChannels = channels.filter(
      (channel) => channel.state === STATES.HALF_OPEN,
    );

    const closedChannels = channels.filter(
      (channel) => channel.state === STATES.CLOSED,
    );

    const unhealthy =
      openChannels.length >= this.options.unhealthyOpenThreshold;

    return {
      timestamp: Date.now(),
      totalChannels: channels.length,
      openCount: openChannels.length,
      halfOpenCount: halfOpenChannels.length,
      closedCount: closedChannels.length,
      unhealthy,
      status: unhealthy
        ? "unhealthy"
        : halfOpenChannels.length > 0
          ? "recovering"
          : "healthy",
      channels,
    };
  }

  snapshotsEqual(first, second) {
    if (!first || !second) {
      return false;
    }

    const normalize = (snapshot) => ({
      totalChannels: snapshot.totalChannels,
      openCount: snapshot.openCount,
      halfOpenCount: snapshot.halfOpenCount,
      closedCount: snapshot.closedCount,
      unhealthy: snapshot.unhealthy,
      status: snapshot.status,
      channels: snapshot.channels.map((channel) => ({
        channel: channel.channel,
        state: channel.state,
        failures: channel.failures,
        successes: channel.successes,
        halfOpenCalls: channel.halfOpenCalls,
        nextAttemptAt: channel.nextAttemptAt,
        canExecute: channel.canExecute,
      })),
    });

    return JSON.stringify(normalize(first)) ===
      JSON.stringify(normalize(second));
  }

  async poll() {
    this.assertActive();

    if (this.polling) {
      this.pendingPoll = true;
      return this.previousSnapshot;
    }

    this.polling = true;

    try {
      let snapshot;

      do {
        this.pendingPoll = false;
        snapshot = this.createSnapshot();

        const previous = this.previousSnapshot;
        const changed = !this.snapshotsEqual(previous, snapshot);

        this.previousSnapshot = snapshot;
        this.lastPollAt = snapshot.timestamp;
        this.lastError = null;

        if (changed || this.options.emitUnchangedSnapshots) {
          this.record("snapshot", snapshot);
          this.emit("snapshot", this.clone(snapshot));
        }

        if (previous && previous.status !== snapshot.status) {
          this.emit("status_change", {
            previousStatus: previous.status,
            currentStatus: snapshot.status,
            timestamp: snapshot.timestamp,
          });
        }

        if (previous) {
          this.emitChannelChanges(previous, snapshot);
        }
      } while (this.pendingPoll && !this.disposed);

      return this.clone(snapshot);
    } catch (error) {
      this.lastError = String(error?.message || error);

      this.record("poll_error", {
        message: this.lastError,
      });

      this.emit("error", {
        message: this.lastError,
        timestamp: Date.now(),
      });

      throw error;
    } finally {
      this.polling = false;
    }
  }

  emitChannelChanges(previous, current) {
    const previousChannels = new Map(
      previous.channels.map((channel) => [channel.channel, channel]),
    );

    for (const channel of current.channels) {
      const oldChannel = previousChannels.get(channel.channel);

      if (!oldChannel) {
        this.emit("channel_added", this.clone(channel));
        continue;
      }

      if (oldChannel.state !== channel.state) {
        const event = {
          channel: channel.channel,
          previousState: oldChannel.state,
          currentState: channel.state,
          timestamp: current.timestamp,
        };

        this.record("channel_state_change", event);
        this.emit("channel_state_change", event);
      }

      if (oldChannel.canExecute !== channel.canExecute) {
        this.emit("channel_availability_change", {
          channel: channel.channel,
          canExecute: channel.canExecute,
          timestamp: current.timestamp,
        });
      }
    }

    const currentChannels = new Set(
      current.channels.map((channel) => channel.channel),
    );

    for (const channel of previous.channels) {
      if (!currentChannels.has(channel.channel)) {
        this.emit("channel_removed", {
          channel: channel.channel,
          timestamp: current.timestamp,
        });
      }
    }
  }

  start({ immediate = true } = {}) {
    this.assertActive();

    if (this.started) {
      return false;
    }

    this.started = true;

    this.timer = setInterval(() => {
      this.poll().catch(() => {
        // Errors are recorded and emitted by poll().
      });
    }, this.options.pollIntervalMs);

    if (immediate) {
      this.poll().catch(() => {
        // Errors are recorded and emitted by poll().
      });
    }

    this.emit("started", {
      timestamp: Date.now(),
      pollIntervalMs: this.options.pollIntervalMs,
    });

    return true;
  }

  stop() {
    this.assertActive();

    if (!this.started) {
      return false;
    }

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;

    this.emit("stopped", {
      timestamp: Date.now(),
    });

    return true;
  }

  getSnapshot() {
    this.assertActive();

    return this.previousSnapshot
      ? this.clone(this.previousSnapshot)
      : this.createSnapshot();
  }

  getChannelState(channel) {
    this.assertActive();

    const normalized = String(channel).trim().toLowerCase();

    return this.getSnapshot().channels.find(
      (item) => item.channel === normalized,
    ) || null;
  }

  getHealth() {
    this.assertActive();

    const snapshot = this.getSnapshot();

    return {
      healthy: !snapshot.unhealthy,
      status: snapshot.status,
      totalChannels: snapshot.totalChannels,
      openChannels: snapshot.openCount,
      recoveringChannels: snapshot.halfOpenCount,
      closedChannels: snapshot.closedCount,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      running: this.started,
      timestamp: Date.now(),
    };
  }

  getHistory({ type, limit = 100 } = {}) {
    this.assertActive();

    const safeLimit = Math.max(
      0,
      Math.floor(Number(limit) || 0),
    );

    if (safeLimit === 0) {
      return [];
    }

    let entries = this.history;

    if (type) {
      entries = entries.filter((entry) => entry.type === type);
    }

    return entries
      .slice(-safeLimit)
      .reverse()
      .map((entry) => this.clone(entry));
  }

  clearHistory() {
    this.assertActive();

    const previousCount = this.history.length;
    this.history = [];

    this.emit("history_cleared", {
      previousCount,
      timestamp: Date.now(),
    });

    return previousCount;
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;
    this.disposed = true;

    this.listeners.clear();
    this.history = [];
    this.previousSnapshot = null;
  }
}

export { DEFAULT_OPTIONS };