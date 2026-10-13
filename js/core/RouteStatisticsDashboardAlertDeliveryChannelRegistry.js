const DEFAULT_OPTIONS = Object.freeze({
  maxChannels: 50,
  allowCustomChannels: true,
});

const BUILT_IN_CHANNELS = new Set([
  "in_app",
  "email",
  "webhook",
  "push",
  "sms",
  "custom",
]);

function normalizeName(value) {
  if (typeof value !== "string") {
    throw new TypeError("Channel name must be a string.");
  }

  const name = value.trim().toLowerCase();

  if (!/^[a-z][a-z0-9_-]{0,79}$/.test(name)) {
    throw new Error("Channel name is invalid.");
  }

  return name;
}

function cloneMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError("Channel metadata must be JSON-serializable.");
  }
}

function createChannelError(message, code) {
  const error = new Error(message);
  error.name = "AlertDeliveryChannelRegistryError";
  error.code = code;
  return error;
}

export class RouteStatisticsDashboardAlertDeliveryChannelRegistry {
  constructor(options = {}) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });

    if (
      !Number.isInteger(this.options.maxChannels) ||
      this.options.maxChannels < 1
    ) {
      throw new RangeError("maxChannels must be a positive integer.");
    }

    this.channels = new Map();
    this.disposed = false;
    this.revision = 0;

    for (const name of BUILT_IN_CHANNELS) {
      this.register(name, {
        builtIn: true,
        enabled: true,
        description: `${name.replace(/_/g, " ")} alert delivery channel.`,
      });
    }
  }

  register(name, configuration = {}, options = {}) {
    this.assertActive();

    const key = normalizeName(name);

    if (
      !BUILT_IN_CHANNELS.has(key) &&
      !this.options.allowCustomChannels
    ) {
      throw createChannelError(
        `Custom channel "${key}" is not allowed.`,
        "CUSTOM_CHANNEL_DISABLED",
      );
    }

    if (
      configuration === null ||
      typeof configuration !== "object" ||
      Array.isArray(configuration)
    ) {
      throw new TypeError("Channel configuration must be an object.");
    }

    const existing = this.channels.get(key);

    if (existing && options.replace !== true) {
      throw createChannelError(
        `Channel "${key}" is already registered.`,
        "CHANNEL_ALREADY_REGISTERED",
      );
    }

    if (!existing && this.channels.size >= this.options.maxChannels) {
      throw createChannelError(
        "Maximum registered channel count reached.",
        "CHANNEL_LIMIT_REACHED",
      );
    }

    const channel = {
      name: key,
      builtIn: BUILT_IN_CHANNELS.has(key),
      enabled: configuration.enabled !== false,
      description:
        typeof configuration.description === "string"
          ? configuration.description.slice(0, 500)
          : "",
      priority: Number.isFinite(configuration.priority)
        ? configuration.priority
        : 100,
      timeoutMs: Number.isFinite(configuration.timeoutMs) &&
        configuration.timeoutMs > 0
          ? configuration.timeoutMs
          : 15000,
      maxRetries: Number.isInteger(configuration.maxRetries) &&
        configuration.maxRetries >= 0
          ? configuration.maxRetries
          : 3,
      metadata: cloneMetadata(configuration.metadata),
      registeredAt: existing?.registeredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.channels.set(key, channel);
    this.revision += 1;

    return this.get(key);
  }

  get(name) {
    this.assertActive();

    const key = normalizeName(name);
    const channel = this.channels.get(key);

    return channel ? this.cloneChannel(channel) : null;
  }

  has(name) {
    this.assertActive();
    return this.channels.has(normalizeName(name));
  }

  enable(name) {
    return this.setEnabled(name, true);
  }

  disable(name) {
    return this.setEnabled(name, false);
  }

  setEnabled(name, enabled) {
    this.assertActive();

    const key = normalizeName(name);
    const channel = this.channels.get(key);

    if (!channel) {
      throw createChannelError(
        `Channel "${key}" is not registered.`,
        "CHANNEL_NOT_FOUND",
      );
    }

    channel.enabled = Boolean(enabled);
    channel.updatedAt = new Date().toISOString();
    this.revision += 1;

    return this.cloneChannel(channel);
  }

  update(name, changes = {}) {
    this.assertActive();

    const key = normalizeName(name);
    const existing = this.channels.get(key);

    if (!existing) {
      throw createChannelError(
        `Channel "${key}" is not registered.`,
        "CHANNEL_NOT_FOUND",
      );
    }

    if (
      changes === null ||
      typeof changes !== "object" ||
      Array.isArray(changes)
    ) {
      throw new TypeError("Channel updates must be an object.");
    }

    const allowedFields = new Set([
      "enabled",
      "description",
      "priority",
      "timeoutMs",
      "maxRetries",
      "metadata",
    ]);

    for (const field of Object.keys(changes)) {
      if (!allowedFields.has(field)) {
        throw new Error(`Unsupported channel property "${field}".`);
      }
    }

    const merged = {
      ...existing,
      ...changes,
      metadata:
        changes.metadata === undefined
          ? existing.metadata
          : changes.metadata,
    };

    return this.register(key, merged, { replace: true });
  }

  remove(name, options = {}) {
    this.assertActive();

    const key = normalizeName(name);
    const channel = this.channels.get(key);

    if (!channel) return false;

    if (channel.builtIn && options.allowBuiltIn !== true) {
      throw createChannelError(
        `Built-in channel "${key}" cannot be removed.`,
        "BUILT_IN_CHANNEL_PROTECTED",
      );
    }

    const removed = this.channels.delete(key);

    if (removed) this.revision += 1;

    return removed;
  }

  list(options = {}) {
    this.assertActive();

    let channels = Array.from(this.channels.values());

    if (options.enabledOnly === true) {
      channels = channels.filter((channel) => channel.enabled);
    }

    if (options.customOnly === true) {
      channels = channels.filter((channel) => !channel.builtIn);
    }

    channels.sort(
      (a, b) =>
        a.priority - b.priority ||
        a.name.localeCompare(b.name),
    );

    return channels.map((channel) => this.cloneChannel(channel));
  }

  getEnabledChannels() {
    return this.list({ enabledOnly: true });
  }

  getRevision() {
    this.assertActive();
    return this.revision;
  }

  exportData() {
    this.assertActive();

    return {
      version: 1,
      revision: this.revision,
      channels: this.list(),
    };
  }

  importData(data, options = {}) {
    this.assertActive();

    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.channels)
    ) {
      throw new TypeError("Invalid channel registry data.");
    }

    if (data.channels.length > this.options.maxChannels) {
      throw createChannelError(
        "Imported channel count exceeds the configured limit.",
        "CHANNEL_LIMIT_REACHED",
      );
    }

    const imported = new Map();

    for (const item of data.channels) {
      if (!item || typeof item !== "object") {
        throw new TypeError("Imported channel entries must be objects.");
      }

      const key = normalizeName(item.name);

      if (imported.has(key)) {
        throw new Error(`Duplicate imported channel "${key}".`);
      }

      imported.set(key, {
        name: key,
        builtIn: BUILT_IN_CHANNELS.has(key),
        enabled: item.enabled !== false,
        description:
          typeof item.description === "string"
            ? item.description.slice(0, 500)
            : "",
        priority: Number.isFinite(item.priority) ? item.priority : 100,
        timeoutMs:
          Number.isFinite(item.timeoutMs) && item.timeoutMs > 0
            ? item.timeoutMs
            : 15000,
        maxRetries:
          Number.isInteger(item.maxRetries) && item.maxRetries >= 0
            ? item.maxRetries
            : 3,
        metadata: cloneMetadata(item.metadata),
        registeredAt: item.registeredAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (options.merge === true) {
      const combined = new Map(this.channels);

      for (const [key, channel] of imported) {
        combined.set(key, channel);
      }

      if (combined.size > this.options.maxChannels) {
        throw createChannelError(
          "Merged channel count exceeds the configured limit.",
          "CHANNEL_LIMIT_REACHED",
        );
      }

      this.channels = combined;
    } else {
      for (const name of BUILT_IN_CHANNELS) {
        if (!imported.has(name)) {
          imported.set(name, {
            name,
            builtIn: true,
            enabled: true,
            description: `${name.replace(/_/g, " ")} alert delivery channel.`,
            priority: 100,
            timeoutMs: 15000,
            maxRetries: 3,
            metadata: {},
            registeredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (imported.size > this.options.maxChannels) {
        throw createChannelError(
          "Imported registry exceeds the configured channel limit.",
          "CHANNEL_LIMIT_REACHED",
        );
      }

      this.channels = imported;
    }

    this.revision += 1;

    return this.list();
  }

  cloneChannel(channel) {
    return {
      ...channel,
      metadata: cloneMetadata(channel.metadata),
    };
  }

  assertActive() {
    if (this.disposed) {
      throw createChannelError(
        "Channel registry has been disposed.",
        "REGISTRY_DISPOSED",
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.channels.clear();
    this.disposed = true;
    this.revision += 1;
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelRegistry;