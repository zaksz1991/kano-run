const SUPPORTED_CHANNELS = new Set([
  "in_app",
  "email",
  "webhook",
  "push",
  "sms",
  "custom",
]);

function createError(message, code = "CHANNEL_ERROR") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeChannel(channel) {
  if (typeof channel !== "string" || !channel.trim()) {
    throw new TypeError("A delivery channel is required.");
  }

  return channel.trim().toLowerCase();
}

function normalizeResult(result, channel) {
  if (result === false || result?.success === false) {
    return {
      success: false,
      channel,
      error: result?.error || "Channel delivery failed.",
      retryable: result?.retryable !== false,
      externalId: result?.externalId ?? null,
    };
  }

  return {
    success: true,
    channel,
    externalId: result?.externalId ?? result?.id ?? null,
    deliveredAt: result?.deliveredAt ?? new Date().toISOString(),
    response: result?.response ?? null,
  };
}

export class RouteStatisticsDashboardAlertDeliveryChannelAdapter {
  constructor(options = {}) {
    this.channels = new Map();
    this.disposed = false;
    this.defaultTimeoutMs = options.timeoutMs ?? 15000;
    this.maxConcurrentPerChannel = options.maxConcurrentPerChannel ?? 5;
    this.activeCounts = new Map();

    if (
      !Number.isFinite(this.defaultTimeoutMs) ||
      this.defaultTimeoutMs < 1
    ) {
      throw new RangeError("timeoutMs must be a positive number.");
    }

    if (
      !Number.isInteger(this.maxConcurrentPerChannel) ||
      this.maxConcurrentPerChannel < 1
    ) {
      throw new RangeError(
        "maxConcurrentPerChannel must be a positive integer.",
      );
    }

    if (options.channels) {
      for (const [name, handler] of Object.entries(options.channels)) {
        this.register(name, handler);
      }
    }
  }

  register(channel, handler, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);

    if (!SUPPORTED_CHANNELS.has(name) && options.allowCustom !== true) {
      throw createError(
        `Unsupported delivery channel "${name}".`,
        "UNSUPPORTED_CHANNEL",
      );
    }

    if (typeof handler !== "function" && typeof handler?.send !== "function") {
      throw new TypeError(
        "Channel handler must be a function or an object with send().",
      );
    }

    if (this.channels.has(name) && options.replace !== true) {
      throw createError(
        `Channel "${name}" is already registered.`,
        "CHANNEL_EXISTS",
      );
    }

    this.channels.set(name, {
      handler,
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
      enabled: options.enabled !== false,
      metadata: isPlainObject(options.metadata) ? { ...options.metadata } : {},
    });

    return this.getChannelInfo(name);
  }

  unregister(channel) {
    const name = normalizeChannel(channel);
    return this.channels.delete(name);
  }

  has(channel) {
    return this.channels.has(normalizeChannel(channel));
  }

  getChannelInfo(channel) {
    const name = normalizeChannel(channel);
    const entry = this.channels.get(name);

    if (!entry) return null;

    return Object.freeze({
      name,
      enabled: entry.enabled,
      timeoutMs: entry.timeoutMs,
      activeCount: this.activeCounts.get(name) || 0,
      metadata: { ...entry.metadata },
    });
  }

  listChannels() {
    return Array.from(this.channels.keys())
      .sort()
      .map((name) => this.getChannelInfo(name));
  }

  setEnabled(channel, enabled) {
    const name = normalizeChannel(channel);
    const entry = this.channels.get(name);

    if (!entry) {
      throw createError(
        `Channel "${name}" is not registered.`,
        "CHANNEL_NOT_FOUND",
      );
    }

    entry.enabled = Boolean(enabled);

    return this.getChannelInfo(name);
  }

  async deliver(channel, delivery, options = {}) {
    this.assertActive();

    const name = normalizeChannel(channel);
    const entry = this.channels.get(name);

    if (!entry) {
      throw createError(
        `Channel "${name}" is not registered.`,
        "CHANNEL_NOT_FOUND",
      );
    }

    if (!entry.enabled) {
      return {
        success: false,
        channel: name,
        error: "Delivery channel is disabled.",
        retryable: false,
      };
    }

    if (!isPlainObject(delivery)) {
      throw new TypeError("Delivery must be a plain object.");
    }

    const activeCount = this.activeCounts.get(name) || 0;

    if (activeCount >= this.maxConcurrentPerChannel) {
      return {
        success: false,
        channel: name,
        error: "Channel concurrency limit reached.",
        retryable: true,
      };
    }

    const timeoutMs = options.timeoutMs ?? entry.timeoutMs;

    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
      throw new RangeError("Delivery timeout must be positive.");
    }

    this.activeCounts.set(name, activeCount + 1);

    try {
      const result = await this.executeWithTimeout(
        entry,
        delivery,
        {
          ...options,
          channel: name,
          timeoutMs,
        },
      );

      return normalizeResult(result, name);
    } catch (error) {
      return {
        success: false,
        channel: name,
        error: error?.message || "Channel delivery failed.",
        code: error?.code || "CHANNEL_ERROR",
        retryable: error?.retryable !== false,
      };
    } finally {
      const current = this.activeCounts.get(name) || 1;

      if (current <= 1) {
        this.activeCounts.delete(name);
      } else {
        this.activeCounts.set(name, current - 1);
      }
    }
  }

  async executeWithTimeout(entry, delivery, context) {
    let timer;

    const handlerPromise = Promise.resolve().then(() => {
      if (typeof entry.handler === "function") {
        return entry.handler(delivery, context);
      }

      return entry.handler.send(delivery, context);
    });

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = createError(
          `Channel delivery timed out after ${context.timeoutMs}ms.`,
          "CHANNEL_TIMEOUT",
        );

        error.retryable = true;
        reject(error);
      }, context.timeoutMs);
    });

    try {
      return await Promise.race([handlerPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  assertActive() {
    if (this.disposed) {
      throw createError(
        "Channel adapter has been disposed.",
        "ADAPTER_DISPOSED",
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.channels.clear();
    this.activeCounts.clear();
    this.disposed = true;
  }

  static getSupportedChannels() {
    return Array.from(SUPPORTED_CHANNELS);
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelAdapter;