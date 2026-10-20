/**
 * KANO LIFE — PERFORMANCE-BALANCED MOBILE 3D QUALITY
 *
 * Keeps the main renderer's public adaptive-quality interface while avoiding
 * an expensive high-DPI render target on mobile from the first frame. It
 * adapts resolution only after sustained frame-rate measurements.
 */
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const safeDevicePixelRatio = () => {
  const value = Number(globalThis.window?.devicePixelRatio) || 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export class KanoAdaptiveQuality {
  constructor({ renderer, mobile = false, enabled = true } = {}) {
    if (!renderer?.renderer?.setPixelRatio || !renderer?.renderer?.getPixelRatio) {
      throw new TypeError('KanoAdaptiveQuality requires a live Renderer3D instance.');
    }
    this.renderer3d = renderer;
    this.webgl = renderer.renderer;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.originalRatio = Number(this.webgl.getPixelRatio()) || 1;
    this.deviceRatio = safeDevicePixelRatio();

    // Mobile starts at a moderate resolution, then earns additional clarity
    // after sustained headroom. This avoids the 1.5x+ initial render cost.
    this.maximumRatio = this.mobile ? 1.28 : 1.85;
    this.minimumRatio = this.mobile ? 0.78 : 0.82;
    this.startupRatio = this.mobile ? 1.08 : 1.42;
    this.maxSupportedRatio = Math.max(0.75, Math.min(this.deviceRatio, this.maximumRatio));
    this.baseRatio = this.maxSupportedRatio;
    this.minRatio = Math.min(this.baseRatio, this.minimumRatio);
    this.levels = this.buildLevels();
    const targetStart = Math.min(this.baseRatio, this.startupRatio);
    let startIndex = this.levels.findIndex((ratio) => ratio <= targetStart + 0.01);
    if (startIndex < 0) startIndex = this.levels.length - 1;
    this.levelIndex = startIndex;
    this.currentRatio = this.levels[this.levelIndex] ?? targetStart;
    this.windowStart = globalThis.performance?.now?.() ?? Date.now();
    this.windowFrames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.lastChangeAt = 0;
    this.lastFps = 60;
    this.lastTierEventAt = 0;
    this.applyRatio(this.currentRatio);
  }

  buildLevels() {
    const raw = [
      this.baseRatio,
      this.baseRatio * 0.90,
      this.baseRatio * 0.82,
      this.baseRatio * 0.72,
      this.minRatio,
    ];
    const unique = [];
    for (const value of raw) {
      const ratio = clamp(value, this.minRatio, this.baseRatio);
      if (!unique.some((previous) => Math.abs(previous - ratio) < 0.025)) unique.push(ratio);
    }
    unique.sort((a, b) => b - a);
    return unique.length ? unique : [this.baseRatio];
  }

  applyRatio(ratio) {
    if (this.disposed || !this.webgl) return false;
    const next = clamp(Number(ratio) || 1, this.minRatio, this.baseRatio);
    try {
      this.webgl.setPixelRatio(next);
      this.renderer3d?.resize?.();
      this.currentRatio = next;
      return true;
    } catch (error) {
      console.warn('[Kano Life] adaptive render resolution change failed', error);
      return false;
    }
  }

  update(now = globalThis.performance?.now?.() ?? Date.now(), renderMode = '3D', gameState = 'PLAY') {
    if (this.disposed || !this.enabled || renderMode !== '3D' || this.renderer3d?.disposed || !this.webgl) return;
    this.windowFrames += 1;
    if (now - this.windowStart < 1000) return;
    const duration = Math.max(1, now - this.windowStart);
    this.lastFps = (this.windowFrames * 1000) / duration;
    this.windowFrames = 0;
    this.windowStart = now;
    if (gameState !== 'PLAY') {
      this.slowWindows = 0;
      this.fastWindows = 0;
      return;
    }
    const sinceChange = now - this.lastChangeAt;
    if (this.lastFps < (this.mobile ? 42 : 46)) {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (this.lastFps > 57) {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = Math.max(0, this.slowWindows - 1);
      this.fastWindows = 0;
    }
    if (this.slowWindows >= 2 && sinceChange >= 2200 && this.levelIndex < this.levels.length - 1) {
      this.setLevel(this.levelIndex + 1, now, 'performance');
      return;
    }
    if (this.fastWindows >= 7 && sinceChange >= 9000 && this.levelIndex > 0) {
      this.setLevel(this.levelIndex - 1, now, 'headroom');
    }
  }

  setLevel(index, now = globalThis.performance?.now?.() ?? Date.now(), reason = 'manual') {
    const nextIndex = clamp(Math.floor(Number(index) || 0), 0, this.levels.length - 1);
    if (nextIndex === this.levelIndex) return false;
    if (!this.applyRatio(this.levels[nextIndex])) return false;
    this.levelIndex = nextIndex;
    this.lastChangeAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;
    if (now - this.lastTierEventAt > 1000) {
      this.lastTierEventAt = now;
      try {
        globalThis.window?.dispatchEvent?.(new CustomEvent('kano:adaptive-quality', {
          detail: {
            ratio: this.currentRatio,
            level: this.levelIndex + 1,
            levels: this.levels.length,
            fps: Math.round(this.lastFps),
            reason,
          },
        }));
      } catch {
        // Telemetry is optional; rendering must continue if unavailable.
      }
    }
    return true;
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      fps: Math.round(this.lastFps),
      ratio: Number(this.currentRatio.toFixed(2)),
      level: this.levelIndex + 1,
      levels: this.levels.length,
      minimumRatio: Number(this.minRatio.toFixed(2)),
      maximumRatio: Number(this.baseRatio.toFixed(2)),
      devicePixelRatio: Number(this.deviceRatio.toFixed(2)),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      if (this.webgl && !this.renderer3d?.disposed) {
        this.webgl.setPixelRatio(this.originalRatio);
        this.renderer3d?.resize?.();
      }
    } catch {
      // Renderer may have been destroyed following WebGL context loss.
    }
    this.renderer3d = null;
    this.webgl = null;
  }
}
