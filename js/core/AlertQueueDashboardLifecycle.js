export class AlertQueueDashboardLifecycle {
  constructor(options = {}) {
    this.controller = options.controller ?? null;
    this.scheduler = options.scheduler ?? null;
    this.state = options.state ?? null;
    this.persistence = options.persistence ?? null;
    this.sync = options.sync ?? null;

    this.started = false;
    this.destroyed = false;
    this.listeners = new Set();
    this.cleanups = [];
  }

  start(options = {}) {
    if (this.destroyed) {
      throw new Error("Dashboard lifecycle has been destroyed.");
    }

    if (this.started) {
      return this.getStatus();
    }

    this.started = true;

    try {
      this.restoreState();

      if (typeof this.sync?.start === "function") {
        this.sync.start();
      }

      if (typeof this.scheduler?.subscribe === "function") {
        const unsubscribe = this.scheduler.subscribe((event) => {
          this.emit("scheduler", event);
        });

        this.addCleanup(unsubscribe);
      }

      if (typeof this.state?.subscribe === "function") {
        const unsubscribe = this.state.subscribe((snapshot) => {
          this.persistState(snapshot);
          this.emit("state-changed", snapshot);
        });

        this.addCleanup(unsubscribe);
      }

      if (typeof this.scheduler?.start === "function") {
        this.scheduler.start({
          immediate: options.immediate !== false,
        });
      } else if (options.immediate !== false) {
        void this.refresh();
      }

      this.emit("started", this.getStatus());

      return this.getStatus();
    } catch (error) {
      this.started = false;
      this.runCleanups();
      this.sync?.stop?.();
      this.scheduler?.stop?.();
      throw error;
    }
  }

  restoreState() {
    if (typeof this.persistence?.restore !== "function") {
      return false;
    }

    const result = this.persistence.restore();

    if (!result?.ok || !result.state) {
      return false;
    }

    if (typeof this.state?.applyDashboardData === "function") {
      this.state.applyDashboardData(result.state);
      return true;
    }

    if (typeof this.state?.update === "function") {
      this.state.update(result.state);
      return true;
    }

    return false;
  }

  persistState(snapshot) {
    if (!this.started || !snapshot) return;

    try {
      this.persistence?.save?.(snapshot);
    } catch (error) {
      this.emit("error", {
        operation: "persist",
        error,
      });
    }
  }

  async refresh() {
    if (!this.started) {
      return {
        ok: false,
        reason: "lifecycle_stopped",
      };
    }

    try {
      let result;

      if (typeof this.controller?.refresh === "function") {
        result = await this.controller.refresh();
      } else if (typeof this.controller?.runHealthCheck === "function") {
        result = await this.controller.runHealthCheck();
      } else {
        throw new Error("No dashboard refresh method is available.");
      }

      this.emit("refreshed", { result });

      return {
        ok: true,
        result,
      };
    } catch (error) {
      this.emit("error", {
        operation: "refresh",
        error,
      });

      return {
        ok: false,
        error,
      };
    }
  }

  addCleanup(cleanup) {
    if (typeof cleanup === "function") {
      this.cleanups.push(cleanup);
    }
  }

  runCleanups() {
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error("Dashboard cleanup failed:", error);
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Dashboard lifecycle listener failed:", error);
      }
    }
  }

  getStatus() {
    return {
      started: this.started,
      destroyed: this.destroyed,
      scheduler: this.scheduler?.getStatus?.() ?? null,
    };
  }

  stop() {
    if (!this.started) {
      return this.getStatus();
    }

    this.started = false;

    this.scheduler?.stop?.();
    this.sync?.stop?.();
    this.runCleanups();

    const snapshot = this.state?.getState?.();

    if (snapshot) {
      try {
        this.persistence?.save?.(snapshot);
      } catch (error) {
        this.emit("error", {
          operation: "final-persist",
          error,
        });
      }
    }

    this.emit("stopped", this.getStatus());

    return this.getStatus();
  }

  destroy() {
    if (this.destroyed) return;

    this.stop();
    this.destroyed = true;

    this.controller?.stop?.();
    this.scheduler?.destroy?.();
    this.sync?.stop?.();

    this.state?.destroy?.();
    this.listeners.clear();
  }
}