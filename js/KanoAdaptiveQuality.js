/**
 * KANO LIFE — SHARP-FIRST ADAPTIVE 3D QUALITY
 *
 * Complete replacement for js/KanoAdaptiveQuality.js.
 *
 * Goals:
 * - Start at a crisp device-pixel ratio instead of forcing mobile to 1x.
 * - Keep a sensible minimum resolution during demanding gameplay.
 * - Lower resolution only after sustained low frame rate.
 * - Restore resolution gradually after sustained performance headroom.
 * - Preserve the existing constructor, update(), diagnostics, and dispose() API.
 *
 * This module changes rendering resolution only. It does not alter gameplay,
 * models, vehicle physics, scene contents, controls, or the user interface.
 */

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const safeDevicePixelRatio = () => {
  const value = Number(globalThis.window?.devicePixelRatio) || 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export class KanoAdaptiveQuality {
  constructor({ renderer, mobile = false, enabled = true } = {}) {
    if (
      !renderer?.renderer?.setPixelRatio ||
      !renderer?.renderer?.getPixelRatio
    ) {
      throw new TypeError(
        'KanoAdaptiveQuality requires a live Renderer3D instance.',
      );
    }

    this.renderer3d = renderer;
    this.webgl = renderer.renderer;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;

    this.originalRatio = Number(this.webgl.getPixelRatio()) || 1;
    this.deviceRatio = safeDevicePixelRatio();

    // Renderer3D starts mobile at 1x. Lift the initial ratio toward the
    // device's actual pixel density, while capping the GPU cost on phones.
    this.maximumRatio = this.mobile ? 1.55 : 1.9;
    this.baseRatio = clamp(
      Math.max(
        this.originalRatio,
        Math.min(this.deviceRatio, this.maximumRatio),
      ),
      1,
      this.maximumRatio,
    );

    // Do not let routine adaptation collapse into the visibly soft 0.6–0.8x
    // range. It can still lower resolution modestly on slower devices.
    this.minRatio = Math.min(
      this.baseRatio,
      Math.max(1, this.baseRatio * (this.mobile ? 0.78 : 0.72)),
    );

    this.levels = this.buildLevels();
    this.levelIndex = 0;
    this.currentRatio = this.levels[0] ?? this.baseRatio;

    this.windowStart = globalThis.performance?.now?.() ?? Date.now();
    this.windowFrames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.lastChangeAt = 0;
    this.lastFps = 60;
    this.lastTierEventAt = 0;

    // setPixelRatio alone does not resize the drawing buffer immediately.
    // Apply the selected ratio and ask the existing renderer to resize.
    this.applyRatio(this.baseRatio);
  }

  buildLevels() {
    const raw = [
      this.baseRatio,
      this.baseRatio * 0.90,
      this.baseRatio * 0.82,
      this.minRatio,
    ];
    const unique = [];

    for (const value of raw) {
      const ratio = clamp(value, this.minRatio, this.baseRatio);
      if (!unique.some((previous) => Math.abs(previous - ratio) < 0.025)) {
        unique.push(ratio);
      }
    }

    unique.sort((a, b) => b - a);
    if (!unique.length) unique.push(this.baseRatio);
    return unique;
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
      console.warn('[Kano Life] render resolution adjustment failed', error);
      return false;
    }
  }

  update(now = globalThis.performance?.now?.() ?? Date.now(), renderMode = '3D', gameState = 'PLAY') {
    if (this.disposed || !this.enabled || renderMode !== '3D') return;
    if (this.renderer3d?.disposed || !this.webgl) return;

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

    if (this.lastFps < 48) {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (this.lastFps > 57) {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = Math.max(0, this.slowWindows - 1);
      this.fastWindows = 0;
    }

    // Lower resolution only after two sustained slow windows and a cooldown.
    if (
      this.slowWindows >= 2 &&
      sinceChange >= 2500 &&
      this.levelIndex < this.levels.length - 1
    ) {
      this.setLevel(this.levelIndex + 1, now, 'performance');
      return;
    }

    // Recover more slowly so resolution does not oscillate from one second to
    // the next when frame rate is near the threshold.
    if (
      this.fastWindows >= 6 &&
      sinceChange >= 8000 &&
      this.levelIndex > 0
    ) {
      this.setLevel(this.levelIndex - 1, now, 'headroom');
    }
  }

  setLevel(index, now = globalThis.performance?.now?.() ?? Date.now(), reason = 'manual') {
    const nextIndex = clamp(index, 0, this.levels.length - 1);
    if (nextIndex === this.levelIndex) return false;

    const nextRatio = this.levels[nextIndex];
    if (!this.applyRatio(nextRatio)) return false;

    this.levelIndex = nextIndex;
    this.lastChangeAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;

    if (now - this.lastTierEventAt > 1000) {
      this.lastTierEventAt = now;
      try {
        globalThis.window?.dispatchEvent?.(
          new CustomEvent('kano:adaptive-quality', {
            detail: {
              ratio: this.currentRatio,
              level: this.levelIndex,
              levels: this.levels.length,
              fps: Math.round(this.lastFps),
              reason,
            },
          }),
        );
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

    // Renderer3D is disposed immediately afterward by main.js. Restore its
    // initial setting during teardown, matching the previous module contract.
    try {
      if (this.webgl && !this.renderer3d?.disposed) {
        this.webgl.setPixelRatio(this.originalRatio);
      }
    } catch {
      // Ignore renderer teardown/context-loss errors.
    }

    this.renderer3d = null;
    this.webgl = null;
  }
}
