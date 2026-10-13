import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const DEFAULT_OPTIONS = {
  endpoint: null,
  method: "POST",
  timeoutMs: 15000,
  retries: 2,
  retryDelayMs: 1000,
  batchSize: 100,
  headers: {},
};

export class RouteStatisticsSync {
  constructor({
    storageManager = null,
    eventBus = EventBus,
    logger = Logger,
    fetcher = globalThis.fetch,
    options = {},
  } = {}) {
    this.storageManager = storageManager;
    this.eventBus = eventBus;
    this.logger = logger;
    this.fetcher = fetcher;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.syncing = false;
    this.disposed = false;
    this.lastSyncAt = null;
    this.lastError = null;
    this.pendingPromise = null;
  }

  async sync(records = null, options = {}) {
    this.assertActive();

    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    const task = this.performSync(records, options);
    this.pendingPromise = task;

    try {
      return await task;
    } finally {
      if (this.pendingPromise === task) {
        this.pendingPromise = null;
      }
    }
  }

  async performSync(records, options) {
    if (this.syncing) {
      return {
        synced: false,
        reason: "sync_in_progress",
      };
    }

    if (!this.options.endpoint) {
      return {
        synced: false,
        reason: "endpoint_not_configured",
      };
    }

    if (typeof this.fetcher !== "function") {
      throw new Error("Fetch is unavailable; statistics cannot be synchronized.");
    }

    this.syncing = true;
    this.lastError = null;

    const startedAt = Date.now();

    try {
      const sourceRecords = Array.isArray(records)
        ? records
        : this.loadLocalRecords();

      const batchSize = Math.max(
        1,
        Number(options.batchSize ?? this.options.batchSize) || 100,
      );

      const batches = this.createBatches(sourceRecords, batchSize);
      const results = [];

      for (let index = 0; index < batches.length; index += 1) {
        this.assertActive();

        const result = await this.sendWithRetry(
          {
            type: "route-statistics",
            version: 1,
            batchIndex: index,
            batchCount: batches.length,
            generatedAt: new Date().toISOString(),
            records: batches[index],
          },
          options,
        );

        results.push(result);
      }

      this.lastSyncAt = Date.now();

      const summary = {
        synced: true,
        batchCount: batches.length,
        recordCount: sourceRecords.length,
        durationMs: this.lastSyncAt - startedAt,
        syncedAt: new Date(this.lastSyncAt).toISOString(),
        results,
      };

      this.emit("route:statistics:sync:completed", summary);

      return summary;
    } catch (error) {
      this.lastError = error;

      const failure = {
        synced: false,
        failedAt: new Date().toISOString(),
        message: error?.message ?? String(error),
      };

      this.emit("route:statistics:sync:failed", failure);

      this.logger?.error?.(
        "RouteStatisticsSync: synchronization failed.",
        error,
      );

      throw error;
    } finally {
      this.syncing = false;
    }
  }

  async sendWithRetry(payload, options = {}) {
    const retries = Math.max(
      0,
      Number(options.retries ?? this.options.retries) || 0,
    );

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      this.assertActive();

      try {
        return await this.sendRequest(payload, options);
      } catch (error) {
        lastError = error;

        if (attempt >= retries) {
          break;
        }

        const delay =
          Math.max(0, Number(this.options.retryDelayMs) || 0) *
          (attempt + 1);

        await this.wait(delay);
      }
    }

    throw lastError ?? new Error("Statistics synchronization failed.");
  }

  async sendRequest(payload, options = {}) {
    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;

    let timeout = null;

    if (controller) {
      timeout = setTimeout(
        () => controller.abort(),
        Math.max(1000, Number(this.options.timeoutMs) || 15000),
      );
    }

    try {
      const response = await this.fetcher(this.options.endpoint, {
        method: options.method ?? this.options.method,
        headers: {
          "Content-Type": "application/json",
          ...this.options.headers,
          ...options.headers,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
        credentials: options.credentials ?? "same-origin",
      });

      if (!response.ok) {
        throw new Error(
          `Statistics sync failed with HTTP ${response.status}.`,
        );
      }

      const contentType = response.headers?.get?.("content-type") ?? "";

      let responseData = null;

      if (contentType.includes("application/json")) {
        responseData = await response.json();
      }

      return {
        status: response.status,
        data: responseData,
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Statistics sync request timed out.");
      }

      throw error;
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    }
  }

  loadLocalRecords() {
    if (!this.storageManager) {
      return [];
    }

    try {
      if (typeof this.storageManager.load === "function") {
        const result = this.storageManager.load();

        if (Array.isArray(result)) {
          return result;
        }

        if (Array.isArray(result?.records)) {
          return result.records;
        }
      }

      if (typeof this.storageManager.getHistory === "function") {
        const result = this.storageManager.getHistory();

        return Array.isArray(result) ? result : [];
      }
    } catch (error) {
      this.logger?.warn?.(
        "RouteStatisticsSync: unable to read local records.",
        error,
      );
    }

    return [];
  }

  createBatches(records, batchSize) {
    if (records.length === 0) {
      return [];
    }

    const batches = [];

    for (let index = 0; index < records.length; index += batchSize) {
      batches.push(records.slice(index, index + batchSize));
    }

    return batches;
  }

  wait(milliseconds) {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new Error("RouteStatisticsSync has been disposed."));
        return;
      }

      setTimeout(resolve, milliseconds);
    });
  }

  getStatus() {
    return {
      syncing: this.syncing,
      disposed: this.disposed,
      endpointConfigured: Boolean(this.options.endpoint),
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError
        ? {
            message: this.lastError.message,
            name: this.lastError.name,
          }
        : null,
    };
  }

  emit(eventName, payload) {
    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(eventName, payload);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(eventName, payload);
      }
    } catch (error) {
      this.logger?.warn?.(
        `RouteStatisticsSync: failed to emit ${eventName}.`,
        error,
      );
    }
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsSync has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.storageManager = null;
    this.eventBus = null;
    this.logger = null;
    this.fetcher = null;
  }
}

export default RouteStatisticsSync;