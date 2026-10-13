const DEFAULT_MAX_ENTRIES = 5000;
const HISTORY_VERSION = 1;

export class RouteStatisticsDashboardAlertDeliveryHistory {
  constructor({
    storage = null,
    storageKey = "kano-run-alert-delivery-history",
    maxEntries = DEFAULT_MAX_ENTRIES,
    clock = () => Date.now(),
    logger = console,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxEntries = Math.max(
      1,
      Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES)
    );
    this.clock = clock;
    this.logger = logger;

    this.entries = [];
    this.sequence = 0;
    this.initialized = false;
    this.disposed = false;
  }

  initialize({ restore = true } = {}) {
    this.assertActive();

    if (this.initialized) return this;

    this.initialized = true;

    if (restore) {
      this.restore();
    }

    return this;
  }

  record(delivery, event = {}) {
    this.assertActive();

    if (!delivery || delivery.id == null) {
      throw new TypeError("A delivery with an id is required.");
    }

    const now = this.normalizeTimestamp(
      event.timestamp ?? event.createdAt ?? this.clock()
    );

    const entry = {
      id: this.createEntryId(delivery.id, now),
      sequence: ++this.sequence,
      deliveryId: String(delivery.id),
      alertId: this.toOptionalString(
        event.alertId ?? delivery.alertId
      ),
      channel: String(event.channel ?? delivery.channel ?? "unknown"),
      type: String(event.type ?? event.event ?? "updated"),
      status: String(event.status ?? delivery.status ?? "unknown"),
      timestamp: now,
      attempt: this.normalizeAttempt(
        event.attempt ?? delivery.attempts ?? delivery.attempt
      ),
      durationMs: this.normalizeDuration(event.durationMs),
      error: this.normalizeError(event.error ?? delivery.lastError),
      message: this.toOptionalString(event.message),
      metadata: this.cloneSafe(event.metadata ?? {}),
    };

    this.entries.push(entry);
    this.prune();
    this.persist();

    return this.clone(entry);
  }

  recordCreated(delivery, metadata = {}) {
    return this.record(delivery, {
      type: "created",
      status: delivery?.status ?? "pending",
      metadata,
    });
  }

  recordAttempt(delivery, details = {}) {
    return this.record(delivery, {
      ...details,
      type: "attempt",
      status: details.status ?? "running",
      attempt: details.attempt ?? delivery?.attempts,
    });
  }

  recordSuccess(delivery, details = {}) {
    return this.record(delivery, {
      ...details,
      type: "succeeded",
      status: "succeeded",
      error: null,
    });
  }

  recordFailure(delivery, error, details = {}) {
    return this.record(delivery, {
      ...details,
      type: "failed",
      status: details.status ?? "failed",
      error,
    });
  }

  recordRetryScheduled(delivery, details = {}) {
    return this.record(delivery, {
      ...details,
      type: "retry_scheduled",
      status: "scheduled",
    });
  }

  recordCancelled(delivery, details = {}) {
    return this.record(delivery, {
      ...details,
      type: "cancelled",
      status: "cancelled",
    });
  }

  getById(id) {
    const entry = this.entries.find(
      (item) => item.id === String(id)
    );

    return entry ? this.clone(entry) : null;
  }

  getDeliveryHistory(deliveryId, {
    limit = 100,
    newestFirst = true,
  } = {}) {
    const target = String(deliveryId);

    return this.filterEntries({
      deliveryId: target,
      limit,
      newestFirst,
    });
  }

  getAlertHistory(alertId, {
    limit = 100,
    newestFirst = true,
  } = {}) {
    return this.filterEntries({
      alertId: String(alertId),
      limit,
      newestFirst,
    });
  }

  getHistory({
    deliveryId,
    alertId,
    channel,
    type,
    status,
    since,
    until,
    limit = 100,
    newestFirst = true,
  } = {}) {
    return this.filterEntries({
      deliveryId,
      alertId,
      channel,
      type,
      status,
      since,
      until,
      limit,
      newestFirst,
    });
  }

  filterEntries({
    deliveryId,
    alertId,
    channel,
    type,
    status,
    since,
    until,
    limit = 100,
    newestFirst = true,
  } = {}) {
    this.assertActive();

    const start = since == null
      ? -Infinity
      : this.normalizeTimestamp(since);

    const end = until == null
      ? Infinity
      : this.normalizeTimestamp(until);

    let result = this.entries.filter((entry) => {
      if (deliveryId != null && entry.deliveryId !== String(deliveryId)) {
        return false;
      }

      if (alertId != null && entry.alertId !== String(alertId)) {
        return false;
      }

      if (channel != null && entry.channel !== String(channel)) {
        return false;
      }

      if (type != null && entry.type !== String(type)) {
        return false;
      }

      if (status != null && entry.status !== String(status)) {
        return false;
      }

      return entry.timestamp >= start && entry.timestamp <= end;
    });

    result.sort((a, b) => {
      const difference = a.timestamp - b.timestamp;

      if (difference !== 0) {
        return newestFirst ? -difference : difference;
      }

      return newestFirst
        ? b.sequence - a.sequence
        : a.sequence - b.sequence;
    });

    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));

    return result
      .slice(0, safeLimit)
      .map((entry) => this.clone(entry));
  }

  getLatestDeliveryState(deliveryId) {
    const history = this.getDeliveryHistory(deliveryId, {
      limit: 1,
      newestFirst: true,
    });

    return history[0] ?? null;
  }

  getSummary({
    since,
    until,
    channel,
  } = {}) {
    this.assertActive();

    const entries = this.filterEntries({
      since,
      until,
      channel,
      limit: this.entries.length,
      newestFirst: false,
    });

    const summary = {
      totalEvents: entries.length,
      uniqueDeliveries: 0,
      uniqueAlerts: 0,
      byType: {},
      byStatus: {},
      byChannel: {},
      firstEventAt: null,
      lastEventAt: null,
      failures: 0,
      successes: 0,
      retriesScheduled: 0,
      cancellations: 0,
    };

    const deliveryIds = new Set();
    const alertIds = new Set();

    for (const entry of entries) {
      deliveryIds.add(entry.deliveryId);

      if (entry.alertId != null) {
        alertIds.add(entry.alertId);
      }

      summary.byType[entry.type] =
        (summary.byType[entry.type] || 0) + 1;

      summary.byStatus[entry.status] =
        (summary.byStatus[entry.status] || 0) + 1;

      summary.byChannel[entry.channel] =
        (summary.byChannel[entry.channel] || 0) + 1;

      if (entry.type === "failed" || entry.type === "failure") {
        summary.failures += 1;
      }

      if (entry.type === "succeeded" || entry.type === "success") {
        summary.successes += 1;
      }

      if (entry.type === "retry_scheduled") {
        summary.retriesScheduled += 1;
      }

      if (entry.type === "cancelled") {
        summary.cancellations += 1;
      }
    }

    summary.uniqueDeliveries = deliveryIds.size;
    summary.uniqueAlerts = alertIds.size;

    if (entries.length) {
      summary.firstEventAt = entries[0].timestamp;
      summary.lastEventAt = entries[entries.length - 1].timestamp;
    }

    return summary;
  }

  removeEntry(id) {
    this.assertActive();

    const index = this.entries.findIndex(
      (entry) => entry.id === String(id)
    );

    if (index === -1) return false;

    this.entries.splice(index, 1);
    this.persist();

    return true;
  }

  removeDeliveryHistory(deliveryId) {
    this.assertActive();

    const target = String(deliveryId);
    const before = this.entries.length;

    this.entries = this.entries.filter(
      (entry) => entry.deliveryId !== target
    );

    const removed = before - this.entries.length;

    if (removed > 0) this.persist();

    return removed;
  }

  clear({ persist = true } = {}) {
    this.assertActive();

    this.entries = [];
    this.sequence = 0;

    if (persist) this.persist();
  }

  prune() {
    if (this.entries.length <= this.maxEntries) return 0;

    const removed = this.entries.length - this.maxEntries;

    this.entries.splice(0, removed);

    return removed;
  }

  exportData() {
    this.assertActive();

    return {
      version: HISTORY_VERSION,
      exportedAt: this.clock(),
      sequence: this.sequence,
      entries: this.entries.map((entry) => this.clone(entry)),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.entries)) {
      throw new TypeError("Invalid delivery history import.");
    }

    if (replace) {
      this.entries = [];
      this.sequence = 0;
    }

    let imported = 0;

    for (const rawEntry of data.entries) {
      if (
        !rawEntry ||
        rawEntry.id == null ||
        rawEntry.deliveryId == null
      ) {
        continue;
      }

      const entry = {
        ...this.cloneSafe(rawEntry),
        id: String(rawEntry.id),
        deliveryId: String(rawEntry.deliveryId),
        alertId: this.toOptionalString(rawEntry.alertId),
        channel: String(rawEntry.channel || "unknown"),
        type: String(rawEntry.type || "updated"),
        status: String(rawEntry.status || "unknown"),
        timestamp: this.normalizeTimestamp(rawEntry.timestamp),
        sequence: Math.max(
          0,
          Math.floor(Number(rawEntry.sequence) || 0)
        ),
        attempt: this.normalizeAttempt(rawEntry.attempt),
        durationMs: this.normalizeDuration(rawEntry.durationMs),
        error: this.normalizeError(rawEntry.error),
        metadata: this.cloneSafe(rawEntry.metadata ?? {}),
      };

      const existingIndex = this.entries.findIndex(
        (item) => item.id === entry.id
      );

      if (existingIndex >= 0) {
        this.entries[existingIndex] = entry;
      } else {
        this.entries.push(entry);
      }

      this.sequence = Math.max(this.sequence, entry.sequence);
      imported += 1;
    }

    this.sequence = Math.max(
      this.sequence,
      Math.floor(Number(data.sequence) || 0)
    );

    this.entries.sort((a, b) => {
      const difference = a.timestamp - b.timestamp;
      return difference || a.sequence - b.sequence;
    });

    this.prune();
    this.persist();

    return imported;
  }

  restore() {
    this.assertActive();

    if (!this.storage?.getItem) return 0;

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) return 0;

      const data = JSON.parse(raw);

      if (
        !data ||
        data.version !== HISTORY_VERSION ||
        !Array.isArray(data.entries)
      ) {
        this.warn("Stored delivery history has an unsupported format.");
        return 0;
      }

      return this.importData(data, { replace: true });
    } catch (error) {
      this.warn("Failed to restore delivery history.", error);
      return 0;
    }
  }

  persist() {
    if (!this.storage?.setItem) return false;

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: HISTORY_VERSION,
          savedAt: this.clock(),
          sequence: this.sequence,
          entries: this.entries,
        })
      );

      return true;
    } catch (error) {
      this.warn("Failed to persist delivery history.", error);
      return false;
    }
  }

  normalizeTimestamp(value) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);

      if (Number.isFinite(parsed)) return parsed;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : this.clock();
  }

  normalizeAttempt(value) {
    if (value == null) return null;

    const attempt = Number(value);

    return Number.isFinite(attempt)
      ? Math.max(0, Math.floor(attempt))
      : null;
  }

  normalizeDuration(value) {
    if (value == null) return null;

    const duration = Number(value);

    return Number.isFinite(duration) && duration >= 0
      ? duration
      : null;
  }

  normalizeError(error) {
    if (!error) return null;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    if (typeof error === "object") {
      return {
        name: String(error.name || "Error"),
        message: String(error.message || "Unknown error"),
      };
    }

    return {
      name: "Error",
      message: String(error),
    };
  }

  toOptionalString(value) {
    return value == null ? null : String(value);
  }

  createEntryId(deliveryId, timestamp) {
    return `delivery-history-${String(deliveryId)}-${timestamp}-${this.sequence + 1}`;
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall through to JSON serialization.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  cloneSafe(value) {
    try {
      return this.clone(value);
    } catch {
      return {};
    }
  }

  warn(message, error) {
    this.logger?.warn?.(`[AlertDeliveryHistory] ${message}`, error || "");
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Delivery history has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.persist();
    this.entries = [];
    this.disposed = true;
    this.initialized = false;
  }
}

export default RouteStatisticsDashboardAlertDeliveryHistory;