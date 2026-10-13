export class AlertQueueDashboardScheduler {
  constructor(options = {}) {
    this.controller = options.controller ?? null;
    this.state = options.state ?? null;
    this.intervalMs = this.normalizeInterval(options.intervalMs ?? 30000);
    this.onError = options.onError ?? (() => {});
    this.setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;

    this.timer = null;
    this.running = false;
    this.inFlight = false;
    this.pending = false;
    this.lastRunAt = null;
    this.lastError = null;
    this.runCount = 0;
    this.listeners = new Set();
  }

  start(options = {}) {
    if (this.running) {
      return this.getStatus();
    }

    this.running = true;

    if (options.immediate !== false) {
      void this.runNow();
    }

    this.timer = this.setIntervalFn(() => {
      void this.runNow();
    }, this.intervalMs);

    this.emit("started", this.getStatus());

    return this.getStatus();
  }

  async runNow() {
    if (!this.running) {
      return {
        ok: false,
        reason: "scheduler_stopped",
      };
    }

    if (this.inFlight) {
      this.pending = true;

      return {
        ok: false,
        reason: "run_in_progress",
      };
    }

    this.inFlight = true;
    let result;

    try {
      do {
        this.pending = false;

        const startedAt = Date.now();

        this.state?.setLoading?.(true);

        try {
          if (typeof this.controller?.refresh === "function") {
            result = await this.controller.refresh();
          } else if (typeof this.controller?.runHealthCheck === "function") {
            result = await this.controller.runHealthCheck();
          } else {
            throw new Error("No dashboard refresh method is available.");
          }

          this.lastRunAt = new Date().toISOString();
          this.lastError = null;
          this.runCount += 1;

          this.emit("success", {
            result,
            durationMs: Date.now() - startedAt,
            runCount: this.runCount,
          });
        } catch (error) {
          this.lastError = error instanceof Error
            ? error.message
            : String(error);

          this.state?.setError?.(error);

          this.emit("error", {
            error,
            runCount: this.runCount,
          });

          try {
            this.onError(error);
          } catch {
            // Preserve the original dashboard error.
          }

          result = {
            ok: false,
            error: this.lastError,
          };
        } finally {
          this.state?.setLoading?.(false);
        }
      } while (this.pending && this.running);

      return result ?? { ok: true };
    } finally {
      this.inFlight = false;
    }
  }

  stop() {
    if (!this.running) {
      return this.getStatus();
    }

    this.running = false;
    this.pending = false;

    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }

    this.emit("stopped", this.getStatus());

    return this.getStatus();
  }

  setInterval(intervalMs) {
    this.intervalMs = this.normalizeInterval(intervalMs);

    if (this.running) {
      if (this.timer !== null) {
        this.clearIntervalFn(this.timer);
      }

      this.timer = this.setIntervalFn(() => {
        void this.runNow();
      }, this.intervalMs);
    }

    this.emit("interval-changed", this.getStatus());

    return this.intervalMs;
  }

  getStatus() {
    return {
      running: this.running,
      inFlight: this.inFlight,
      pending: this.pending,
      intervalMs: this.intervalMs,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      runCount: this.runCount,
    };
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
        console.error("Dashboard scheduler listener failed:", error);
      }
    }
  }

  normalizeInterval(value) {
    const interval = Number(value);

    if (!Number.isFinite(interval)) {
      return 30000;
    }

    return Math.min(3600000, Math.max(1000, Math.floor(interval)));
  }

  destroy() {
    this.stop();
    this.listeners.clear();
  }
}