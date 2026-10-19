/**
 * Adaptive render-resolution governor for Kano Life's existing WebGL renderer.
 *
 * It only changes the drawing-buffer pixel ratio. It does not switch renderers,
 * alter scene complexity, or affect game logic. Resize calls from Renderer3D
 * do not reset this setting because Renderer3D.resize() only calls setSize().
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

    this.baseRatio = this.webgl.getPixelRatio();
    this.minRatio = Math.min(
      this.baseRatio,
      this.mobile ? 0.68 : 0.78,
    );
    this.levels = this.buildLevels();
    this.levelIndex = 0;
    this.currentRatio = this.levels[0];

    this.windowStart = performance.now();
    this.windowFrames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.lastChangeAt = 0;
    this.lastFps = 60;
    this.lastTierEventAt = 0;
  }

  buildLevels() {
    const raw = [
      this.baseRatio,
      this.baseRatio * 0.88,
      this.baseRatio * 0.76,
      this.minRatio,
    ];

    const unique = [];
    for (const value of raw) {
      const ratio = clamp(value, this.minRatio, this.baseRatio);
      if (!unique.some((prior) => Math.abs(prior - ratio) < 0.025)) {
        unique.push(ratio);
      }
    }

    return unique.sort((a, b) => b - a);
  }

  update(now = performance.now(), renderMode = '3D', gameState = 'PLAY') {
    if (this.disposed || !this.enabled || renderMode !== '3D') return;
    if (this.renderer3d?.disposed || !this.webgl) return;

    this.windowFrames += 1;
    if (now - this.windowStart < 1000) return;

    const duration = Math.max(1, now - this.windowStart);
    this.lastFps = this.windowFrames * 1000 / duration;
    this.windowFrames = 0;
    this.windowStart = now;

    if (gameState !== 'PLAY') {
      // Do not react to menu/morning scene frame-rate variation.
      this.slowWindows = 0;
      this.fastWindows = 0;
      return;
    }

    const sinceChange = now - this.lastChangeAt;

    if (this.lastFps < 52) {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (this.lastFps > 58) {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = Math.max(0, this.slowWindows - 1);
      this.fastWindows = 0;
    }

    // Sustained drops lower drawing resolution; recovery is slower to avoid flicker.
    if (
      this.slowWindows >= 2 &&
      sinceChange >= 2500 &&
      this.levelIndex < this.levels.length - 1
    ) {
      this.setLevel(this.levelIndex + 1, now, 'performance');
      return;
    }

    if (
      this.fastWindows >= 6 &&
      sinceChange >= 8000 &&
      this.levelIndex > 0
    ) {
      this.setLevel(this.levelIndex - 1, now, 'headroom');
    }
  }

  setLevel(index, now = performance.now(), reason = 'manual') {
    const nextIndex = clamp(index, 0, this.levels.length - 1);
    if (nextIndex === this.levelIndex) return false;

    this.levelIndex = nextIndex;
    this.currentRatio = this.levels[nextIndex];
    this.lastChangeAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;

    try {
      this.webgl.setPixelRatio(this.currentRatio);
    } catch (error) {
      console.warn('[Kano Life] adaptive pixel ratio update failed', error);
      return false;
    }

    // Only emit diagnostic telemetry occasionally; production UI stays untouched.
    if (now - this.lastTierEventAt > 1000) {
      this.lastTierEventAt = now;
      window.dispatchEvent(new CustomEvent('kano:adaptive-quality', {
        detail: {
          ratio: this.currentRatio,
          level: this.levelIndex,
          levels: this.levels.length,
          fps: Math.round(this.lastFps),
          reason,
        },
      }));
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
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // Restore the renderer's original requested pixel ratio before it is destroyed.
    try {
      if (this.webgl && !this.renderer3d?.disposed) {
        this.webgl.setPixelRatio(this.baseRatio);
      }
    } catch {
      // Renderer can be in context-loss or disposal state.
    }

    this.renderer3d = null;
    this.webgl = null;
  }
}
