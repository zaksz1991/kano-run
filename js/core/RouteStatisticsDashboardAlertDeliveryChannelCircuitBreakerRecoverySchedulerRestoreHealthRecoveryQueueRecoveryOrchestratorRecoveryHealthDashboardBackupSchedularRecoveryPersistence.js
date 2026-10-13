import RecoveryHealthDashboardBackupSchedulerRecoveryStorage from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryStorage.js";

const DEFAULT_STATE_KEY = "recoveryState";
const DEFAULT_MAX_ATTEMPTS = 3;

export class RecoveryHealthDashboardBackupSchedulerRecoveryPersistence {
  constructor(options = {}) {
    this.storage =
      options.storage ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryStorage(options);

    this.stateKey = options.stateKey ?? DEFAULT_STATE_KEY;
    this.maxAttempts = Math.max(
      1,
      Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS
    );

    this.clock = options.clock ?? (() => Date.now());
    this.retryDelayMs = Math.max(
      0,
      Number(options.retryDelayMs) || 100
    );

    this.lastPersistedAt = null;
    this.lastRestoredAt = null;
    this.lastError = null;
    this.revision = 0;
  }

  async persist(state = {}) {
    const timestamp = this.clock();
    const envelope = {
      version: 1,
      key: this.stateKey,
      revision: this.revision + 1,
      persistedAt: timestamp,
      state: this.sanitize(state),
    };

    let lastError = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const result = this.storage.write({
          records: [
            {
              id: this.stateKey,
              timestamp,
              type: "recovery_state",
              status: "persisted",
              details: envelope,
            },
          ],
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        if (!result.success) {
          throw new Error(
            result.error?.message ?? "Unable to persist recovery state."
          );
        }

        this.revision = envelope.revision;
        this.lastPersistedAt = timestamp;
        this.lastError = null;

        return {
          success: true,
          attempt,
          revision: this.revision,
          persistedAt: timestamp,
        };
      } catch (error) {
        lastError = this.serializeError(error);

        if (attempt < this.maxAttempts) {
          await this.delay(this.retryDelayMs * attempt);
        }
      }
    }

    this.lastError = lastError;

    return {
      success: false,
      attempts: this.maxAttempts,
      error: lastError,
    };
  }

  async restore() {
    try {
      const records = this.storage.getRecords({
        type: "recovery_state",
        limit: 500,
      });

      const candidates = records
        .map((record) => record.details)
        .filter(
          (item) =>
            item &&
            item.key === this.stateKey &&
            item.version === 1 &&
            item.state &&
            typeof item.state === "object"
        )
        .sort(
          (a, b) =>
            Number(b.revision || 0) - Number(a.revision || 0)
        );

      const latest = candidates[0];

      if (!latest) {
        return {
          success: true,
          restored: false,
          reason: "no_saved_state",
          state: null,
        };
      }

      this.revision = Number(latest.revision) || 0;
      this.lastPersistedAt = Number(latest.persistedAt) || null;
      this.lastRestoredAt = this.clock();
      this.lastError = null;

      return {
        success: true,
        restored: true,
        revision: this.revision,
        persistedAt: this.lastPersistedAt,
        restoredAt: this.lastRestoredAt,
        state: this.sanitize(latest.state),
      };
    } catch (error) {
      this.lastError = this.serializeError(error);

      return {
        success: false,
        restored: false,
        error: this.lastError,
      };
    }
  }

  async update(mutator, fallbackState = {}) {
    if (typeof mutator !== "function") {
      throw new TypeError("update() requires a mutator function.");
    }

    const restored = await this.restore();
    const currentState =
      restored.success && restored.state
        ? restored.state
        : this.sanitize(fallbackState);

    const nextState = await mutator(
      this.sanitize(currentState)
    );

    if (nextState === undefined) {
      throw new Error("The state mutator must return the updated state.");
    }

    const result = await this.persist(nextState);

    return {
      ...result,
      state: this.sanitize(nextState),
    };
  }

  async clear() {
    try {
      const result = this.storage.clear();

      if (!result.success) {
        throw new Error(
          result.error?.message ?? "Unable to clear persisted state."
        );
      }

      this.revision = 0;
      this.lastPersistedAt = null;
      this.lastRestoredAt = null;
      this.lastError = null;

      return { success: true };
    } catch (error) {
      this.lastError = this.serializeError(error);

      return {
        success: false,
        error: this.lastError,
      };
    }
  }

  getStatus() {
    return {
      stateKey: this.stateKey,
      revision: this.revision,
      maxAttempts: this.maxAttempts,
      lastPersistedAt: this.lastPersistedAt,
      lastRestoredAt: this.lastRestoredAt,
      lastError: this.lastError,
    };
  }

  sanitize(value) {
    try {
      return JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Error) {
            return this.serializeError(item);
          }

          if (typeof item === "bigint") {
            return item.toString();
          }

          if (typeof item === "function") {
            return undefined;
          }

          return item;
        })
      );
    } catch {
      throw new TypeError(
        "Recovery state must be serializable."
      );
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  serializeError(error) {
    return {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryPersistence;