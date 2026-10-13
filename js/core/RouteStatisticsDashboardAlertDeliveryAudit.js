const DEFAULT_MAX_RECORDS = 5000;
const AUDIT_VERSION = 1;

export class RouteStatisticsDashboardAlertDeliveryAudit {
  constructor({
    storage = null,
    storageKey = "kano-run-alert-delivery-audit",
    maxRecords = DEFAULT_MAX_RECORDS,
    clock = () => Date.now(),
    logger = console,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxRecords = Math.max(
      1,
      Math.floor(Number(maxRecords) || DEFAULT_MAX_RECORDS)
    );
    this.clock = clock;
    this.logger = logger;

    this.records = [];
    this.sequence = 0;
    this.disposed = false;
  }

  record({
    action,
    deliveryId,
    alertId = null,
    channel = "unknown",
    actor = "system",
    outcome = "success",
    details = {},
    timestamp = this.clock(),
  } = {}) {
    this.assertActive();

    if (!action || !String(action).trim()) {
      throw new TypeError("An audit action is required.");
    }

    if (deliveryId == null || String(deliveryId).trim() === "") {
      throw new TypeError("A delivery ID is required.");
    }

    const time = this.normalizeTimestamp(timestamp);

    const entry = {
      id: this.createId(time),
      sequence: ++this.sequence,
      timestamp: time,
      action: String(action),
      deliveryId: String(deliveryId),
      alertId: alertId == null ? null : String(alertId),
      channel: String(channel || "unknown"),
      actor: String(actor || "system"),
      outcome: String(outcome || "unknown"),
      details: this.cloneSafe(details),
    };

    this.records.push(entry);
    this.prune();
    this.persist();

    return this.clone(entry);
  }

  recordCreated(delivery, options = {}) {
    return this.record({
      ...options,
      action: "delivery.created",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      details: {
        status: delivery?.status ?? "pending",
        ...(options.details || {}),
      },
    });
  }

  recordAttempt(delivery, {
    attempt,
    durationMs,
    ...options
  } = {}) {
    return this.record({
      ...options,
      action: "delivery.attempted",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      details: {
        attempt: attempt ?? delivery?.attempts ?? null,
        durationMs: this.normalizeDuration(durationMs),
        ...(options.details || {}),
      },
    });
  }

  recordSucceeded(delivery, options = {}) {
    return this.record({
      ...options,
      action: "delivery.succeeded",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      outcome: "success",
      details: {
        status: delivery?.status ?? "succeeded",
        ...(options.details || {}),
      },
    });
  }

  recordFailed(delivery, error, options = {}) {
    return this.record({
      ...options,
      action: "delivery.failed",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      outcome: "failure",
      details: {
        error: this.normalizeError(error),
        status: delivery?.status ?? "failed",
        ...(options.details || {}),
      },
    });
  }

  recordRetryScheduled(delivery, options = {}) {
    return this.record({
      ...options,
      action: "delivery.retry_scheduled",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      outcome: "pending",
      details: {
        nextAttemptAt: options.nextAttemptAt ?? null,
        ...(options.details || {}),
      },
    });
  }

  recordCancelled(delivery, options = {}) {
    return this.record({
      ...options,
      action: "delivery.cancelled",
      deliveryId: delivery?.id,
      alertId: options.alertId ?? delivery?.alertId,
      channel: options.channel ?? delivery?.channel,
      outcome: "cancelled",
      details: options.details || {},
    });
  }

  getById(id) {
    const record = this.records.find(
      (item) => item.id === String(id)
    );

    return record ? this.clone(record) : null;
  }

  query({
    deliveryId,
    alertId,
    channel,
    action,
    actor,
    outcome,
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

    let results = this.records.filter((record) => {
      if (
        deliveryId != null &&
        record.deliveryId !== String(deliveryId)
      ) {
        return false;
      }

      if (alertId != null && record.alertId !== String(alertId)) {
        return false;
      }

      if (channel != null && record.channel !== String(channel)) {
        return false;
      }

      if (action != null && record.action !== String(action)) {
        return false;
      }

      if (actor != null && record.actor !== String(actor)) {
        return false;
      }

      if (outcome != null && record.outcome !== String(outcome)) {
        return false;
      }

      return record.timestamp >= start && record.timestamp <= end;
    });

    results.sort((a, b) => {
      const difference = a.timestamp - b.timestamp;

      if (difference !== 0) {
        return newestFirst ? -difference : difference;
      }

      return newestFirst
        ? b.sequence - a.sequence
        : a.sequence - b.sequence;
    });

    return results
      .slice(0, Math.max(0, Math.floor(Number(limit) || 0)))
      .map((record) => this.clone(record));
  }

  getDeliveryAudit(deliveryId, options = {}) {
    return this.query({
      ...options,
      deliveryId: String(deliveryId),
    });
  }

  getAlertAudit(alertId, options = {}) {
    return this.query({
      ...options,
      alertId: String(alertId),
    });
  }

  getSummary({ since, until } = {}) {
    const records = this.query({
      since,
      until,
      limit: this.records.length,
      newestFirst: false,
    });

    const summary = {
      total: records.length,
      uniqueDeliveries: 0,
      uniqueAlerts: 0,
      byAction: {},
      byOutcome: {},
      byChannel: {},
      byActor: {},
      firstRecordAt: null,
      lastRecordAt: null,
    };

    const deliveryIds = new Set();
    const alertIds = new Set();

    for (const record of records) {
      deliveryIds.add(record.deliveryId);

      if (record.alertId != null) {
        alertIds.add(record.alertId);
      }

      summary.byAction[record.action] =
        (summary.byAction[record.action] || 0) + 1;

      summary.byOutcome[record.outcome] =
        (summary.byOutcome[record.outcome] || 0) + 1;

      summary.byChannel[record.channel] =
        (summary.byChannel[record.channel] || 0) + 1;

      summary.byActor[record.actor] =
        (summary.byActor[record.actor] || 0) + 1;
    }

    summary.uniqueDeliveries = deliveryIds.size;
    summary.uniqueAlerts = alertIds.size;

    if (records.length) {
      summary.firstRecordAt = records[0].timestamp;
      summary.lastRecordAt = records[records.length - 1].timestamp;
    }

    return summary;
  }

  verifyDelivery(deliveryId) {
    const history = this.getDeliveryAudit(deliveryId, {
      limit: this.records.length,
      newestFirst: false,
    });

    const actions = history.map((entry) => entry.action);

    return {
      deliveryId: String(deliveryId),
      recordCount: history.length,
      created: actions.includes("delivery.created"),
      attempted: actions.includes("delivery.attempted"),
      succeeded: actions.includes("delivery.succeeded"),
      failed: actions.includes("delivery.failed"),
      cancelled: actions.includes("delivery.cancelled"),
      latestRecord: history.length
        ? this.clone(history[history.length - 1])
        : null,
    };
  }

  removeByDelivery(deliveryId) {
    this.assertActive();

    const target = String(deliveryId);
    const before = this.records.length;

    this.records = this.records.filter(
      (record) => record.deliveryId !== target
    );

    const removed = before - this.records.length;

    if (removed > 0) this.persist();

    return removed;
  }

  clear({ persist = true } = {}) {
    this.assertActive();

    this.records = [];
    this.sequence = 0;

    if (persist) this.persist();
  }

  exportData() {
    this.assertActive();

    return {
      version: AUDIT_VERSION,
      exportedAt: this.clock(),
      sequence: this.sequence,
      records: this.records.map((record) => this.clone(record)),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.records)) {
      throw new TypeError("Invalid delivery audit import data.");
    }

    if (replace) {
      this.records = [];
      this.sequence = 0;
    }

    let imported = 0;

    for (const raw of data.records) {
      if (
        !raw ||
        raw.id == null ||
        raw.deliveryId == null ||
        raw.action == null
      ) {
        continue;
      }

      const record = {
        id: String(raw.id),
        sequence: Math.max(0, Math.floor(Number(raw.sequence) || 0)),
        timestamp: this.normalizeTimestamp(raw.timestamp),
        action: String(raw.action),
        deliveryId: String(raw.deliveryId),
        alertId: raw.alertId == null ? null : String(raw.alertId),
        channel: String(raw.channel || "unknown"),
        actor: String(raw.actor || "system"),
        outcome: String(raw.outcome || "unknown"),
        details: this.cloneSafe(raw.details || {}),
      };

      const existingIndex = this.records.findIndex(
        (item) => item.id === record.id
      );

      if (existingIndex >= 0) {
        this.records[existingIndex] = record;
      } else {
        this.records.push(record);
      }

      this.sequence = Math.max(this.sequence, record.sequence);
      imported += 1;
    }

    this.sequence = Math.max(
      this.sequence,
      Math.floor(Number(data.sequence) || 0)
    );

    this.records.sort((a, b) => {
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
        data?.version !== AUDIT_VERSION ||
        !Array.isArray(data.records)
      ) {
        this.warn("Stored delivery audit has an unsupported format.");
        return 0;
      }

      return this.importData(data, { replace: true });
    } catch (error) {
      this.warn("Failed to restore delivery audit.", error);
      return 0;
    }
  }

  persist() {
    if (!this.storage?.setItem) return false;

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: AUDIT_VERSION,
          savedAt: this.clock(),
          sequence: this.sequence,
          records: this.records,
        })
      );

      return true;
    } catch (error) {
      this.warn("Failed to persist delivery audit.", error);
      return false;
    }
  }

  prune() {
    if (this.records.length <= this.maxRecords) return 0;

    const removed = this.records.length - this.maxRecords;
    this.records.splice(0, removed);

    return removed;
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

  createId(timestamp) {
    return `delivery-audit-${timestamp}-${this.sequence + 1}`;
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall back to JSON cloning.
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
    this.logger?.warn?.(`[AlertDeliveryAudit] ${message}`, error || "");
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Delivery audit has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    this.persist();
    this.records = [];
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertDeliveryAudit;