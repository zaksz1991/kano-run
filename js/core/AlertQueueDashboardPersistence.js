export class AlertQueueDashboardPersistence {
  constructor(options = {}) {
    this.storage = options.storage ?? this.getDefaultStorage();
    this.storageKey = options.storageKey ?? "kano-run-alert-dashboard";
    this.version = 1;
    this.maxHistory = this.normalizeLimit(options.maxHistory ?? 100);
  }

  save(state = {}) {
    if (!this.storage) {
      return { ok: false, reason: "storage_unavailable" };
    }

    try {
      const payload = {
        version: this.version,
        savedAt: new Date().toISOString(),
        state: this.sanitizeState(state),
      };

      this.storage.setItem(this.storageKey, JSON.stringify(payload));

      return {
        ok: true,
        savedAt: payload.savedAt,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "save_failed",
        error,
      };
    }
  }

  restore() {
    if (!this.storage) {
      return { ok: false, reason: "storage_unavailable", state: null };
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return { ok: true, reason: "empty", state: null };
      }

      const payload = JSON.parse(raw);

      if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "invalid_data", state: null };
      }

      if (payload.version !== this.version) {
        return {
          ok: false,
          reason: "version_mismatch",
          state: null,
        };
      }

      if (!payload.state || typeof payload.state !== "object") {
        return { ok: false, reason: "invalid_state", state: null };
      }

      return {
        ok: true,
        reason: "restored",
        savedAt: payload.savedAt ?? null,
        state: this.sanitizeState(payload.state),
      };
    } catch (error) {
      return {
        ok: false,
        reason: "restore_failed",
        state: null,
        error,
      };
    }
  }

  clear() {
    if (!this.storage) {
      return { ok: false, reason: "storage_unavailable" };
    }

    try {
      this.storage.removeItem(this.storageKey);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: "clear_failed",
        error,
      };
    }
  }

  hasSavedState() {
    if (!this.storage) return false;

    try {
      return this.storage.getItem(this.storageKey) !== null;
    } catch {
      return false;
    }
  }

  getMetadata() {
    const restored = this.restore();

    if (!restored.ok || !restored.state) {
      return {
        exists: false,
        reason: restored.reason,
      };
    }

    return {
      exists: true,
      savedAt: restored.savedAt,
      version: this.version,
    };
  }

  sanitizeState(state) {
    const source =
      state && typeof state === "object" && !Array.isArray(state)
        ? state
        : {};

    const metrics =
      source.metrics &&
      typeof source.metrics === "object" &&
      !Array.isArray(source.metrics)
        ? source.metrics
        : {};

    const notifications = Array.isArray(source.notifications)
      ? source.notifications
          .filter((item) => item && typeof item === "object")
          .slice(0, 500)
          .map((item) => this.cloneSerializable(item))
          .filter((item) => item !== null)
      : [];

    const history = Array.isArray(source.history)
      ? source.history
          .filter((item) => item && typeof item === "object")
          .slice(0, this.maxHistory)
          .map((item) => this.cloneSerializable(item))
          .filter((item) => item !== null)
      : [];

    return {
      status: String(source.status ?? "idle"),
      metrics: this.cloneSerializable(metrics) ?? {},
      notifications,
      history,
      lastUpdated: source.lastUpdated ?? null,
    };
  }

  cloneSerializable(value) {
    try {
      const json = JSON.stringify(value);

      if (json === undefined) return null;

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  getDefaultStorage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  normalizeLimit(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 100;

    return Math.min(1000, Math.max(1, Math.floor(number)));
  }
}