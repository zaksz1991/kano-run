/**
 * KANO LIFE — GAME LOOP BRIDGE
 * Coordinates existing visual directors from one requestAnimationFrame loop.
 * It does not own physics, rendering, scene assets, or gameplay state.
 *
 * Example:
 * const bridge = new KanoGameLoopBridge({ animationDirector, worldAnimator, cameraDirector });
 * function frame(now) {
 *   const dt = (now - lastFrame) / 1000; lastFrame = now;
 *   bridge.update(dt, {
 *     speed: playerSpeed, steering: steeringInput, acceleration: throttle,
 *     braking: brakeInput, roadRoughness, playerPosition: kekeRoot.position,
 *   });
 *   renderer.render(scene, camera);
 *   requestAnimationFrame(frame);
 * }
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

export class KanoGameLoopBridge {
  constructor({ animationDirector = null, worldAnimator = null, cameraDirector = null,
    maxDelta = 0.05, worldMaxDistance, onError = null } = {}) {
    this.animationDirector = animationDirector;
    this.worldAnimator = worldAnimator;
    this.cameraDirector = cameraDirector;
    this.maxDelta = clamp(maxDelta, 0.01, 0.1);
    this.worldMaxDistance = Number.isFinite(worldMaxDistance) ? Math.max(10, worldMaxDistance) : null;
    this.onError = typeof onError === 'function' ? onError : null;
    this.frame = 0;
    this.elapsed = 0;
    this.paused = false;
    this.disposed = false;
    this.lastState = {};
    this._visibilityHandler = () => { this.paused = typeof document !== 'undefined' && document.hidden; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  /** Pass values already calculated by the game's real physics/input systems. */
  update(dtSeconds, state = {}) {
    if (this.disposed || this.paused) return false;
    const dt = clamp(dtSeconds, 0, this.maxDelta);
    if (dt <= 0) return false;

    const motion = {
      speed: Number(state.speed) || 0,
      steering: clamp(Number(state.steering) || 0, -1, 1),
      acceleration: clamp(Number(state.acceleration) || 0, -1, 1),
      braking: clamp(Number(state.braking) || 0, 0, 1),
      roadRoughness: clamp(Number(state.roadRoughness ?? 0.25), 0, 1),
      distanceDelta: Math.max(0, Number(state.distanceDelta) || 0),
    };
    this.lastState = { ...motion, playerPosition: state.playerPosition ?? null };
    this.elapsed += dt;
    this.frame += 1;

    // Keep the systems isolated: a broken optional visual system should not stop gameplay.
    this._safe('animationDirector.update', () => this.animationDirector?.update(dt, motion));
    this._safe('worldAnimator.update', () => this.worldAnimator?.update(dt, {
      playerPosition: state.playerPosition ?? null,
      maxDistance: this.worldMaxDistance ?? (this.worldAnimator?.isMobile ? 55 : 100),
    }));
    this._safe('cameraDirector.update', () => this.cameraDirector?.update(dt, motion));
    return true;
  }

  /** Call this when existing collision code reports an impact; no collision is created here. */
  reportImpact(strength = 0.3, duration = 0.22) {
    if (this.disposed) return false;
    if (typeof this.cameraDirector?.impact !== 'function') return false;
    this._safe('cameraDirector.impact', () => this.cameraDirector.impact(
      clamp(strength, 0, 1.5), clamp(duration, 0.05, 1.5)));
    return true;
  }

  pause() { this.paused = true; }
  resume() { if (!this.disposed) this.paused = false; }

  getStats() {
    return {
      frame: this.frame,
      elapsedSeconds: Number(this.elapsed.toFixed(2)),
      paused: this.paused,
      disposed: this.disposed,
      connected: {
        animationDirector: Boolean(this.animationDirector),
        worldAnimator: Boolean(this.worldAnimator),
        cameraDirector: Boolean(this.cameraDirector),
      },
      lastMotion: {
        speed: this.lastState.speed ?? 0,
        steering: this.lastState.steering ?? 0,
        braking: this.lastState.braking ?? 0,
      },
    };
  }

  _safe(label, operation) {
    try { operation(); }
    catch (error) {
      if (this.onError) this.onError({ system: label, error });
      else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(`[KanoGameLoopBridge] ${label} failed`, error);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibilityHandler);
    // Directors are borrowed dependencies; bridge disposal deliberately does not dispose them.
    this.animationDirector = null;
    this.worldAnimator = null;
    this.cameraDirector = null;
    this.disposed = true;
  }
}

export default KanoGameLoopBridge;
