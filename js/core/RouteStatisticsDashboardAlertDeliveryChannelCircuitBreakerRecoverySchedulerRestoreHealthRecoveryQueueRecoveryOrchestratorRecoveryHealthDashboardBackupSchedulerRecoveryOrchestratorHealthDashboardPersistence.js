import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence.js";

import RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard from "./RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreHealthRecoveryQueueRecoveryOrchestratorRecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard.js";

export class RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardPersistence {
  constructor({
    dashboard = null,
    persistence = null,
    namespace = "kano-run-recovery-dashboard",
    autoPersist = true,
    clock = () => Date.now(),
  } = {}) {
    this.dashboard =
      dashboard ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboard();

    this.persistence =
      persistence ??
      new RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorPersistence();

    this.namespace = namespace;
    this.autoPersist = Boolean(autoPersist);
    this.clock = clock;
    this.unsubscribe = null;
    this.persisting = false;
    this.pendingPersist = false;
    this.lastPersistAt = null;
    this.lastPersistError = null;
    this.persistCount = 0;
    this.disposed = false;
  }

  start() {
    if (this.disposed) {
      throw new Error("Dashboard persistence has been disposed.");
    }

    if (this.autoPersist && !this.unsubscribe) {
      this.unsubscribe = this.dashboard.subscribe(() => {
        void this.persist();
      });
    }

    return this.getStatus();
  }

  async persist() {
    if (this.disposed) {
      throw new Error("Dashboard persistence has been disposed.");
    }

    if (this.persisting) {
      this.pendingPersist = true;
      return {
        status: "queued",
        timestamp: this.clock(),
      };
    }

    this.persisting = true;

    let result = null;

    try {
      do {
        this.pendingPersist = false;

        const payload = {
          schemaVersion: 1,
          namespace: this.namespace,
          savedAt: this.clock(),
          dashboardStatus: this.dashboard.getStatus(),
          snapshot: this.dashboard.getSnapshot(),
          history: this.dashboard.getHistory(),
        };

        result = await this.persistence.persist(payload);

        this.lastPersistAt = this.clock();
        this.lastPersistError = null;
        this.persistCount += 1;
      } while (this.pendingPersist && !this.disposed);

      return {
        status: "persisted",
        timestamp: this.lastPersistAt,
        count: this.persistCount,
        result,
      };
    } catch (error) {
      this.lastPersistError = error instanceof Error
        ? error.message
        : String(error);

      return {
        status: "failed",
        timestamp: this.clock(),
        error: this.lastPersistError,
      };
    } finally {
      this.persisting = false;
    }
  }

  async restore() {
    if (this.disposed) {
      throw new Error("Dashboard persistence has been disposed.");
    }

    try {
      const result = await this.persistence.restore();

      if (!result) {
        return {
          status: "empty",
          restoredAt: this.clock(),
        };
      }

      const payload = result.payload ?? result.data ?? result;

      if (
        payload.namespace &&
        payload.namespace !== this.namespace
      ) {
        return {
          status: "namespace_mismatch",
          expected: this.namespace,
          received: payload.namespace,
        };
      }

      if (payload.schemaVersion !== 1) {
        return {
          status: "unsupported_schema",
          schemaVersion: payload.schemaVersion ?? null,
        };
      }

      return {
        status: "available",
        restoredAt: this.clock(),
        savedAt: payload.savedAt ?? null,
        dashboardStatus: payload.dashboardStatus ?? null,
        snapshot: payload.snapshot ?? null,
        history: Array.isArray(payload.history)
          ? payload.history
          : [],
      };
    } catch (error) {
      return {
        status: "failed",
        restoredAt: this.clock(),
        error: error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  getStatus() {
    return {
      namespace: this.namespace,
      autoPersist: this.autoPersist,
      persisting: this.persisting,
      pendingPersist: this.pendingPersist,
      lastPersistAt: this.lastPersistAt,
      lastPersistError: this.lastPersistError,
      persistCount: this.persistCount,
      subscribed: Boolean(this.unsubscribe),
      disposed: this.disposed,
    };
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    return this.getStatus();
  }

  dispose() {
    this.stop();
    this.disposed = true;
  }
}

export default RecoveryHealthDashboardBackupSchedulerRecoveryOrchestratorHealthDashboardPersistence;