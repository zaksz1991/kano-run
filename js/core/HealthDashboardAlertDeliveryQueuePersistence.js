const DEFAULT_STORAGE_KEY = "kanoRun.alertDeliveryQueue";
const DEFAULT_MAX_JOBS = 500;

export class HealthDashboardAlertDeliveryQueuePersistence {
  constructor({
    storage = globalThis.localStorage,
    storageKey = DEFAULT_STORAGE_KEY,
    maxJobs = DEFAULT_MAX_JOBS,
    queue = null,
    autoRestore = false,
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxJobs = Math.max(1, Number(maxJobs) || DEFAULT_MAX_JOBS);
    this.queue = queue;
    this.lastSavedAt = null;
    this.lastRestoredAt = null;
    this.lastError = null;

    if (autoRestore) {
      this.restore();
    }
  }

  save(jobs = null) {
    try {
      if (!this.storage) {
        throw new Error("Storage is unavailable.");
      }

      const source =
        jobs ??
        this.queue?.getJobs?.() ??
        [];

      const records = source
        .slice(-this.maxJobs)
        .map((job) => this.#sanitize(job));

      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        count: records.length,
        jobs: records,
      };

      this.storage.setItem(
        this.storageKey,
        JSON.stringify(payload),
      );

      this.lastSavedAt = payload.savedAt;
      this.lastError = null;

      return {
        success: true,
        count: records.length,
        savedAt: payload.savedAt,
      };
    } catch (error) {
      this.lastError = error.message;

      return {
        success: false,
        count: 0,
        error: error.message,
      };
    }
  }

  restore({ replace = false } = {}) {
    try {
      if (!this.storage) {
        throw new Error("Storage is unavailable.");
      }

      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return {
          success: true,
          count: 0,
          jobs: [],
          empty: true,
        };
      }

      const payload = JSON.parse(raw);

      if (
        !payload ||
        payload.version !== 1 ||
        !Array.isArray(payload.jobs)
      ) {
        throw new Error("Invalid alert queue persistence data.");
      }

      const jobs = payload.jobs
        .slice(-this.maxJobs)
        .filter((job) => job && typeof job.id === "string")
        .map((job) => this.#sanitize(job));

      if (this.queue) {
        if (replace && typeof this.queue.clear === "function") {
          this.queue.clear();
        }

        for (const job of jobs) {
          this.queue.enqueue?.({
            ...job,
            restored: true,
          });
        }
      }

      this.lastRestoredAt = new Date().toISOString();
      this.lastError = null;

      return {
        success: true,
        count: jobs.length,
        jobs,
        savedAt: payload.savedAt ?? null,
        restoredAt: this.lastRestoredAt,
      };
    } catch (error) {
      this.lastError = error.message;

      return {
        success: false,
        count: 0,
        jobs: [],
        error: error.message,
      };
    }
  }

  getStatus() {
    return {
      storageKey: this.storageKey,
      maxJobs: this.maxJobs,
      lastSavedAt: this.lastSavedAt,
      lastRestoredAt: this.lastRestoredAt,
      lastError: this.lastError,
      storageAvailable: Boolean(this.storage),
    };
  }

  clear() {
    try {
      this.storage?.removeItem(this.storageKey);
      this.lastError = null;
      return { success: true };
    } catch (error) {
      this.lastError = error.message;
      return {
        success: false,
        error: error.message,
      };
    }
  }

  #sanitize(job) {
    return {
      id: String(job.id ?? ""),
      type: String(job.type ?? "alert"),
      status: String(job.status ?? "pending"),
      priority: Number.isFinite(Number(job.priority))
        ? Number(job.priority)
        : 0,
      attempts: Number.isFinite(Number(job.attempts))
        ? Number(job.attempts)
        : 0,
      createdAt: job.createdAt ?? null,
      updatedAt: job.updatedAt ?? null,
      completedAt: job.completedAt ?? null,
      message: String(job.message ?? ""),
      payload:
        job.payload && typeof job.payload === "object"
          ? job.payload
          : {},
    };
  }
}

export default HealthDashboardAlertDeliveryQueuePersistence;