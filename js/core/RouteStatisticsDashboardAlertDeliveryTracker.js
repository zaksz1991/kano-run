import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const EVENTS = Object.freeze({
  RECORDED: "route-statistics-alert-delivery-tracker:recorded",
  UPDATED: "route-statistics-alert-delivery-tracker:updated",
  REMOVED: "route-statistics-alert-delivery-tracker:removed",
  CLEARED: "route-statistics-alert-delivery-tracker:cleared",
  DISPOSED: "route-statistics-alert-delivery-tracker:disposed",
});

export class RouteStatisticsDashboardAlertDeliveryTracker {
  constructor({
    eventBus = new EventBus(),
    logger = new Logger(),
    clock = () => Date.now(),
    maxRecords = 2000,
    retentionMs = 7 * 24 * 60 * 60 * 1000,
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.clock = clock;
    this.maxRecords = Math.max(
      1,
      Math.floor(Number(maxRecords) || 2000)
    );
    this.retentionMs = Math.max(
      0,
      Number(retentionMs) || 0
    );

    this.records = new Map();
    this.sequence = 0;
    this.disposed = false;
  }

  record(delivery = {}) {
    this.assertActive();

    if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
      throw new TypeError("Delivery record must be an object.");
    }

    this.prune();

    const now = this.clock();
    const id = String(
      delivery.deliveryId ??
        `delivery-record-${++this.sequence}-${now}`
    );

    const existing = this.records.get(id);

    const record = {
      id,
      alertId: delivery.alertId ?? null,
      status: this.normalizeStatus(delivery.status, delivery.success),
      attempts: this.toNonNegativeInteger(delivery.attempts ?? 1),
      error: delivery.error ? String(delivery.error) : null,
      startedAt: delivery.startedAt ?? null,
      completedAt: delivery.completedAt ?? new Date(now).toISOString(),
      durationMs: this.toNonNegativeNumber(delivery.durationMs),
      channelResults: Array.isArray(delivery.channelResults)
        ? delivery.channelResults.map((result) => ({ ...result }))
        : Array.isArray(delivery.dispatch?.results)
          ? delivery.dispatch.results.map((result) => ({ ...result }))
          : [],
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(delivery.metadata ?? {}),
      },
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    this.records.delete(id);
    this.records.set(id, record);
    this.enforceLimit();

    this.emit(EVENTS.RECORDED, {
      record: this.cloneRecord(record),
      total: this.records.size,
    });

    return this.cloneRecord(record);
  }

  update(id, changes = {}) {
    this.assertActive();

    const key = String(id);
    const current = this.records.get(key);

    if (!current) return null;

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Record changes must be an object.");
    }

    const next = {
      ...current,
      ...changes,
      id: current.id,
      metadata: {
        ...current.metadata,
        ...(changes.metadata ?? {}),
      },
      channelResults: Array.isArray(changes.channelResults)
        ? changes.channelResults.map((result) => ({ ...result }))
        : current.channelResults,
      updatedAt: new Date(this.clock()).toISOString(),
    };

    next.status = this.normalizeStatus(
      changes.status ?? next.status,
      changes.success
    );

    next.attempts = this.toNonNegativeInteger(next.attempts);
    next.durationMs = this.toNonNegativeNumber(next.durationMs);

    this.records.set(key, next);

    this.emit(EVENTS.UPDATED, {
      record: this.cloneRecord(next),
    });

    return this.cloneRecord(next);
  }

  get(id) {
    const record = this.records.get(String(id));
    return record ? this.cloneRecord(record) : null;
  }

  getAll({
    status,
    alertId,
    limit = 100,
    offset = 0,
    newestFirst = true,
  } = {}) {
    let results = [...this.records.values()];

    if (status !== undefined) {
      const normalized = this.normalizeStatus(status);
      results = results.filter((record) => record.status === normalized);
    }

    if (alertId !== undefined) {
      results = results.filter(
        (record) => String(record.alertId) === String(alertId)
      );
    }

    if (newestFirst) results.reverse();

    const safeOffset = this.toNonNegativeInteger(offset);
    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));

    return results
      .slice(safeOffset, safeOffset + safeLimit)
      .map((record) => this.cloneRecord(record));
  }

  remove(id) {
    this.assertActive();

    const key = String(id);
    const removed = this.records.delete(key);

    if (removed) {
      this.emit(EVENTS.REMOVED, {
        id: key,
        total: this.records.size,
      });
    }

    return removed;
  }

  clear() {
    this.assertActive();

    const removed = this.records.size;
    this.records.clear();

    this.emit(EVENTS.CLEARED, {
      removed,
      clearedAt: new Date(this.clock()).toISOString(),
    });

    return removed;
  }

  prune(now = this.clock()) {
    if (this.retentionMs > 0) {
      for (const [id, record] of this.records) {
        const timestamp = Date.parse(record.createdAt);

        if (
          Number.isFinite(timestamp) &&
          now - timestamp > this.retentionMs
        ) {
          this.records.delete(id);
        }
      }
    }

    this.enforceLimit();
    return this.records.size;
  }

  enforceLimit() {
    while (this.records.size > this.maxRecords) {
      const oldestId = this.records.keys().next().value;

      if (oldestId === undefined) break;

      this.records.delete(oldestId);
    }
  }

  getSummary() {
    const summary = {
      total: this.records.size,
      succeeded: 0,
      failed: 0,
      pending: 0,
      cancelled: 0,
      totalAttempts: 0,
      averageDurationMs: 0,
    };

    let durationTotal = 0;
    let durationCount = 0;

    for (const record of this.records.values()) {
      if (record.status in summary) {
        summary[record.status] += 1;
      }

      summary.totalAttempts += record.attempts;

      if (record.durationMs !== null) {
        durationTotal += record.durationMs;
        durationCount += 1;
      }
    }

    summary.averageDurationMs =
      durationCount > 0 ? durationTotal / durationCount : 0;

    return summary;
  }

  exportData() {
    return {
      version: 1,
      exportedAt: new Date(this.clock()).toISOString(),
      records: this.getAll({
        limit: this.records.size,
        newestFirst: false,
      }),
    };
  }

  importData(data, { replace = false } = {}) {
    this.assertActive();

    if (!data || !Array.isArray(data.records)) {
      throw new TypeError("Import data must contain a records array.");
    }

    if (replace) this.records.clear();

    let imported = 0;

    for (const item of data.records) {
      if (!item || typeof item !== "object" || !item.id) continue;

      const id = String(item.id);

      this.records.set(id, {
        ...item,
        id,
        status: this.normalizeStatus(item.status),
        attempts: this.toNonNegativeInteger(item.attempts),
        durationMs: this.toNonNegativeNumber(item.durationMs),
        metadata: { ...(item.metadata ?? {}) },
        channelResults: Array.isArray(item.channelResults)
          ? item.channelResults.map((result) => ({ ...result }))
          : [],
        updatedAt: new Date(this.clock()).toISOString(),
      });

      imported += 1;
    }

    this.enforceLimit();

    return {
      imported,
      total: this.records.size,
    };
  }

  normalizeStatus(status, success) {
    if (typeof success === "boolean") {
      return success ? "succeeded" : "failed";
    }

    const value = String(status ?? "pending").toLowerCase();

    if (["success", "succeeded", "delivered"].includes(value)) {
      return "succeeded";
    }

    if (["failure", "failed", "error"].includes(value)) {
      return "failed";
    }

    if (["cancelled", "canceled"].includes(value)) {
      return "cancelled";
    }

    return "pending";
  }

  toNonNegativeInteger(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(0, Math.floor(number))
      : 0;
  }

  toNonNegativeNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, number) : null;
  }

  cloneRecord(record) {
    return {
      ...record,
      metadata: { ...record.metadata },
      channelResults: record.channelResults.map((result) => ({
        ...result,
      })),
    };
  }

  getStats() {
    return {
      ...this.getSummary(),
      maxRecords: this.maxRecords,
      retentionMs: this.retentionMs,
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
      try {
        this.logger.error?.(`Failed to emit "${event}".`, error);
      } catch {
        // Logging failures must not interrupt tracking.
      }
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error(
        "RouteStatisticsDashboardAlertDeliveryTracker has been disposed."
      );
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.records.clear();

    this.emit(EVENTS.DISPOSED, {
      disposedAt: this.clock(),
    });
  }
}

export {
  EVENTS as RouteStatisticsDashboardAlertDeliveryTrackerEvents,
};

export default RouteStatisticsDashboardAlertDeliveryTracker;