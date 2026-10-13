const STORAGE_KEY = "kano-run-route-statistics-alert-delivery";
const STORAGE_VERSION = 1;

export class RouteStatisticsDashboardAlertDeliveryStorage {
  constructor({
    storage = globalThis.localStorage,
    key = STORAGE_KEY,
    logger = console,
    maxRecords = 2000,
  } = {}) {
    this.storage = storage;
    this.key = key;
    this.logger = logger;
    this.maxRecords = Math.max(1, Number(maxRecords) || 2000);
    this.records = new Map();
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this;

    this.initialized = true;
    this.restore();
    return this;
  }

  save(record) {
    if (!record || typeof record !== "object") {
      throw new TypeError("A delivery record is required.");
    }

    const id = String(record.id ?? "").trim();

    if (!id) {
      throw new TypeError("A delivery record must have an id.");
    }

    const normalized = {
      ...this.clone(record),
      id,
      updatedAt: new Date().toISOString(),
    };

    if (!normalized.createdAt) {
      normalized.createdAt = normalized.updatedAt;
    }

    this.records.delete(id);
    this.records.set(id, normalized);
    this.prune();
    this.persist();

    return this.clone(normalized);
  }

  saveMany(records = []) {
    if (!Array.isArray(records)) {
      throw new TypeError("Delivery records must be an array.");
    }

    const saved = [];

    for (const record of records) {
      saved.push(this.save(record));
    }

    return saved;
  }

  get(id) {
    const record = this.records.get(String(id));
    return record ? this.clone(record) : null;
  }

  getAll({
    status,
    alertId,
    channel,
    limit = this.maxRecords,
    newestFirst = true,
  } = {}) {
    let records = Array.from(this.records.values());

    if (status !== undefined) {
      records = records.filter(
        (record) => record.status === status
      );
    }

    if (alertId !== undefined) {
      records = records.filter(
        (record) => record.alertId === alertId
      );
    }

    if (channel !== undefined) {
      records = records.filter(
        (record) => record.channel === channel
      );
    }

    records.sort((a, b) => {
      const timeA = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
      const timeB = Date.parse(b.updatedAt || b.createdAt || 0) || 0;

      return newestFirst ? timeB - timeA : timeA - timeB;
    });

    const safeLimit = Math.max(0, Number(limit) || 0);

    return records
      .slice(0, safeLimit)
      .map((record) => this.clone(record));
  }

  update(id, changes) {
    const existing = this.get(id);

    if (!existing) return null;

    const patch =
      typeof changes === "function"
        ? changes(this.clone(existing))
        : changes;

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new TypeError("Delivery updates must be an object.");
    }

    return this.save({
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    });
  }

  remove(id) {
    const removed = this.records.delete(String(id));

    if (removed) this.persist();

    return removed;
  }

  removeByAlert(alertId) {
    const target = String(alertId);
    let removed = 0;

    for (const [id, record] of this.records) {
      if (String(record.alertId) === target) {
        this.records.delete(id);
        removed += 1;
      }
    }

    if (removed > 0) this.persist();

    return removed;
  }

  clear() {
    this.records.clear();
    this.persist();
  }

  restore() {
    if (!this.storage?.getItem) return 0;

    try {
      const raw = this.storage.getItem(this.key);

      if (!raw) return 0;

      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        parsed.version !== STORAGE_VERSION ||
        !Array.isArray(parsed.records)
      ) {
        this.warn("Stored delivery records have an unsupported format.");
        return 0;
      }

      this.records.clear();

      for (const record of parsed.records) {
        if (!record || record.id == null) continue;

        this.records.set(String(record.id), this.clone(record));
      }

      this.prune();
      return this.records.size;
    } catch (error) {
      this.warn("Failed to restore delivery records.", error);
      return 0;
    }
  }

  persist() {
    if (!this.storage?.setItem) return false;

    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({
          version: STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          records: Array.from(this.records.values()),
        })
      );

      return true;
    } catch (error) {
      this.warn("Failed to persist delivery records.", error);
      return false;
    }
  }

  exportData() {
    return {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      records: this.getAll({
        limit: this.maxRecords,
        newestFirst: false,
      }),
    };
  }

  importData(data, { replace = false } = {}) {
    if (!data || !Array.isArray(data.records)) {
      throw new TypeError("Invalid delivery storage import.");
    }

    if (replace) this.records.clear();

    let imported = 0;

    for (const record of data.records) {
      if (!record || record.id == null) continue;

      const id = String(record.id);

      this.records.set(id, {
        ...this.clone(record),
        id,
      });

      imported += 1;
    }

    this.prune();
    this.persist();

    return imported;
  }

  getStats() {
    const stats = {
      total: this.records.size,
      byStatus: {},
      byChannel: {},
      oldestCreatedAt: null,
      newestUpdatedAt: null,
    };

    let oldest = Infinity;
    let newest = -Infinity;

    for (const record of this.records.values()) {
      const status = String(record.status || "unknown");
      const channel = String(record.channel || "unknown");

      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;

      const created = Date.parse(record.createdAt || "") || 0;
      const updated = Date.parse(record.updatedAt || "") || 0;

      if (created > 0 && created < oldest) oldest = created;
      if (updated > newest) newest = updated;
    }

    if (oldest !== Infinity) {
      stats.oldestCreatedAt = new Date(oldest).toISOString();
    }

    if (newest !== -Infinity) {
      stats.newestUpdatedAt = new Date(newest).toISOString();
    }

    return stats;
  }

  prune() {
    while (this.records.size > this.maxRecords) {
      const oldestId = this.records.keys().next().value;

      if (oldestId === undefined) break;

      this.records.delete(oldestId);
    }
  }

  clone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        // Fall through for values unsupported by structuredClone.
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  warn(message, error) {
    if (typeof this.logger?.warn === "function") {
      this.logger.warn(message, error || "");
    }
  }

  dispose() {
    this.persist();
    this.records.clear();
    this.initialized = false;
  }
}

export default RouteStatisticsDashboardAlertDeliveryStorage;