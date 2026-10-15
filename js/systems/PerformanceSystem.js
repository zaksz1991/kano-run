/**
 * Phase 6 — mobile-first quality tier.
 * Detects low-end devices and emits performance:quality for other systems.
 */
export default class PerformanceSystem {
  constructor({ eventBus = null, renderer = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.config = config;
    this.tier = "medium";
    this.lowPower = false;
    this._frames = 0;
    this._fpsAccum = 0;
    this._fps = 60;
    this._last = performance.now();
  }

  async initialize() {
    this.tier = this._detectTier();
    this.lowPower = this.tier === "low";
    this._applyRenderer();
    if (typeof window !== "undefined" && window.modelCache?.setLowPower) {
      window.modelCache.setLowPower(this.lowPower);
    }
    try {
      const { modelCache } = await import("../core/SmartModelCache.js");
      modelCache.setLowPower?.(this.lowPower);
    } catch {}
    this.eventBus?.emit?.("performance:quality", {
      tier: this.tier,
      lowPower: this.lowPower,
      targetFps: this.lowPower ? 30 : 60,
      pixelRatio: this.lowPower ? 1 : Math.min(2, window.devicePixelRatio || 1),
      shadows: !this.lowPower,
      maxVehicles: this.lowPower ? 18 : 28,
      maxWalkers: this.lowPower ? 10 : 16,
      maxStreetlights: this.lowPower ? 10 : 16,
    });
    return this;
  }

  _detectTier() {
    if (typeof navigator === "undefined") return "medium";
    const mem = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const dm = window.devicePixelRatio || 1;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (mem <= 2 || cores <= 4 && mobile) return "low";
    if (mem <= 4 && mobile) return "medium";
    if (dm >= 3 && mobile) return "medium";
    return mobile ? "medium" : "high";
  }

  _applyRenderer() {
    const r = this.renderer;
    if (!r) return;
    const pr =
      this.tier === "low"
        ? 1
        : Math.min(this.tier === "medium" ? 1.5 : 2, window.devicePixelRatio || 1);
    r.setPixelRatio(pr);
    if (r.shadowMap) {
      r.shadowMap.enabled = this.tier !== "low";
      if (r.shadowMap.type != null) {
        // keep default
      }
    }
  }

  update(dt = 0) {
    this._frames++;
    this._fpsAccum += dt || 0.016;
    if (this._fpsAccum >= 1) {
      this._fps = this._frames / this._fpsAccum;
      this._frames = 0;
      this._fpsAccum = 0;
      // Adaptive: if FPS tanks, drop to low mid-run
      if (this._fps < 22 && this.tier !== "low") {
        this.tier = "low";
        this.lowPower = true;
        this._applyRenderer();
        this.eventBus?.emit?.("performance:quality", {
          tier: "low",
          lowPower: true,
          targetFps: 30,
          adaptive: true,
        });
      }
    }
  }

  dispose() {}
}
