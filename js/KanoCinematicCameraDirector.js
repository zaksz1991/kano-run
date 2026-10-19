import * as THREE from 'three';

/**
 * Kano Life cinematic camera director.
 * Additive camera polish: smooth chase camera, speed-responsive look-ahead/FOV,
 * bounded collision shake, and optional opening reveal. It never changes vehicle physics.
 *
 * Typical integration:
 *   const cameraDirector = new KanoCinematicCameraDirector(camera, { mobile: isMobile });
 *   cameraDirector.setTarget(kekeRoot);
 *   // once per frame, after vehicle physics:
 *   cameraDirector.update(dt, { speed: gameSpeed, steering: steer, impact: collisionImpulse });
 */
export class KanoCinematicCameraDirector {
  constructor(camera, options = {}) {
    if (!camera || !camera.position || !camera.quaternion) {
      throw new TypeError('KanoCinematicCameraDirector requires a Three.js camera.');
    }
    this.camera = camera;
    this.mobile = options.mobile ?? (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches);
    this.enabled = options.enabled !== false;
    this.reducedMotion = options.reducedMotion ?? (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.target = null;
    this.targetOffset = new THREE.Vector3(0, this.mobile ? 2.6 : 3.1, 0);
    this.followOffset = new THREE.Vector3(this.mobile ? 0 : 0.15, this.mobile ? 4.2 : 5.0, this.mobile ? 8.8 : 10.5);
    this.lookAhead = new THREE.Vector3(0, 1.1, -4);
    this._desiredPosition = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._targetWorld = new THREE.Vector3();
    this._forward = new THREE.Vector3(0, 0, -1);
    this._up = new THREE.Vector3(0, 1, 0);
    this._baseFov = camera.isPerspectiveCamera ? camera.fov : 60;
    this._shakeTime = 0;
    this._shakeStrength = 0;
    this._clock = 0;
    this._introTime = 0;
    this._introDuration = 0;
    this._introStart = new THREE.Vector3();
    this._lastSteering = 0;
    this._tempLook = new THREE.Vector3();
    this._visibilityHandler = () => { this._shakeStrength = 0; this._shakeTime = 0; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  setTarget(target, options = {}) {
    this.target = target || null;
    if (options.followOffset) this.followOffset.copy(options.followOffset);
    if (options.targetOffset) this.targetOffset.copy(options.targetOffset);
    if (target) {
      target.updateWorldMatrix?.(true, false);
      target.getWorldPosition?.(this._targetWorld);
      this._desiredPosition.copy(this._targetWorld).add(this.followOffset);
      this.camera.position.copy(this._desiredPosition);
      this._lookAt.copy(this._targetWorld).add(this.targetOffset);
      this.camera.lookAt(this._lookAt);
    }
    return this;
  }

  /** Optional gentle reveal; duration is seconds. Avoid using during active driving. */
  playIntro(duration = 2.2) {
    if (!this.target || this.reducedMotion) return this;
    this._introDuration = Math.max(0.1, duration);
    this._introTime = 0;
    this._introStart.copy(this.camera.position);
    return this;
  }

  /** Add a bounded impact shake. strength is normalized 0..1. */
  impact(strength = 0.35, duration = 0.22) {
    if (this.reducedMotion) return;
    this._shakeStrength = Math.max(this._shakeStrength, THREE.MathUtils.clamp(strength, 0, 1));
    this._shakeTime = Math.max(this._shakeTime, THREE.MathUtils.clamp(duration, 0.05, 0.8));
  }

  update(dt, state = {}) {
    if (!this.enabled || !this.target || !Number.isFinite(dt) || dt <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    dt = Math.min(dt, 0.05);
    this._clock += dt;
    this.target.updateWorldMatrix?.(true, false);
    this.target.getWorldPosition(this._targetWorld);

    const speed = THREE.MathUtils.clamp(Math.abs(Number(state.speed) || 0), 0, 1);
    const steering = THREE.MathUtils.clamp(Number(state.steering) || 0, -1, 1);
    const lerpFactor = (rate) => 1 - Math.exp(-rate * dt);

    // Follow behind the target's actual orientation, not the world's fixed Z axis.
    this._forward.set(0, 0, -1).applyQuaternion(this.target.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const right = new THREE.Vector3().crossVectors(this._forward, this._up).normalize();
    this._desiredPosition.copy(this._targetWorld)
      .addScaledVector(this._up, this.followOffset.y)
      .addScaledVector(this._forward, -this.followOffset.z)
      .addScaledVector(right, this.followOffset.x + steering * 0.28);

    this.camera.position.lerp(this._desiredPosition, lerpFactor(this.mobile ? 4.2 : 3.4));

    // Look further ahead as speed rises so players can read traffic and road hazards.
    this._lookAt.copy(this._targetWorld)
      .add(this.targetOffset)
      .addScaledVector(this._forward, -(2.0 + speed * (this.mobile ? 3.0 : 4.2)))
      .addScaledVector(right, steering * 0.5);

    if (this._introDuration > 0 && this._introTime < this._introDuration) {
      this._introTime = Math.min(this._introDuration, this._introTime + dt);
      const t = this._introTime / this._introDuration;
      const eased = t * t * (3 - 2 * t);
      const orbit = Math.sin((1 - eased) * Math.PI) * (this.mobile ? 0.45 : 0.8);
      this._tempLook.copy(this._desiredPosition).add(new THREE.Vector3(orbit, 0, 0));
      this.camera.position.lerp(this._tempLook, 1 - eased);
    }

    if (this.camera.isPerspectiveCamera) {
      const targetFov = this._baseFov + speed * (this.mobile ? 1.2 : 2.5);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 3.0, dt);
      this.camera.updateProjectionMatrix();
    }

    if (this._shakeTime > 0 && !this.reducedMotion) {
      this._shakeTime = Math.max(0, this._shakeTime - dt);
      const envelope = this._shakeTime / 0.22;
      const amplitude = 0.055 * this._shakeStrength * THREE.MathUtils.clamp(envelope, 0, 1);
      this.camera.position.x += (Math.random() - 0.5) * amplitude;
      this.camera.position.y += (Math.random() - 0.5) * amplitude * 0.65;
      this._shakeStrength *= Math.exp(-10 * dt);
    }
    this.camera.lookAt(this._lookAt);
    this._lastSteering = steering;
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); return this; }

  dispose() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibilityHandler);
    this.target = null;
  }
}
