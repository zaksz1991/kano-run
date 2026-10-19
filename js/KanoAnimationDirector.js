import * as THREE from 'three';

/**
 * KANO LIFE — Animation Director
 * Coordinates the existing character and vehicle visual animation systems.
 * It does not own gameplay physics, traffic logic, the renderer, or the scene.
 *
 * Example:
 * const director = new KanoAnimationDirector({ characterAnimator, vehicleAnimator, camera });
 * director.registerPlayerVehicle('player-keke', kekeRoot, { wheels, body, steeringPivot });
 * // each frame: director.update(dt, { speed, steering, acceleration, braking, roadRoughness, distanceDelta });
 */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));

export class KanoAnimationDirector {
  constructor({ characterAnimator = null, vehicleAnimator = null, camera = null, mobile, reducedMotion, maxDelta = 0.05 } = {}) {
    this.characters = characterAnimator;
    this.vehicles = vehicleAnimator;
    this.camera = camera;
    this.mobile = mobile ?? /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '');
    this.reducedMotion = reducedMotion ?? Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.maxDelta = clamp(maxDelta, 0.01, 0.1);
    this.playerVehicleId = null;
    this.driverId = null;
    this.lastMotion = { speed: 0, steering: 0, acceleration: 0, braking: 0, roadRoughness: 0.25, distanceDelta: 0 };
    this.elapsed = 0;
    this.paused = false;
    this.disposed = false;
    this._onVisibility = () => { this.paused = document.visibilityState === 'hidden'; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
  }

  /** Register the existing loaded Keke root; optional mesh references must be real meshes from that model. */
  registerPlayerVehicle(id, root, { wheels = [], body = root, steeringPivot = null, followCamera = false, cameraOffset } = {}) {
    if (this.disposed || !this.vehicles || !root?.isObject3D) return null;
    const vehicle = this.vehicles.register(id, root, {
      wheels, body, steeringPivot, camera: this.camera,
      followCamera: Boolean(followCamera && this.camera),
      cameraOffset: cameraOffset?.isVector3 ? cameraOffset : new THREE.Vector3(0, 2.8, 6.5),
    });
    if (vehicle) this.playerVehicleId = id;
    return vehicle;
  }

  /** Link the already registered driver character to the player vehicle for synchronized pose. */
  linkDriver(characterId, vehicleId = this.playerVehicleId) {
    if (!this.characters?.getActor(characterId) || !vehicleId) return false;
    this.driverId = characterId;
    this.playerVehicleId = vehicleId;
    return true;
  }

  registerPedestrian(id, root, clips = [], options = {}) {
    if (!this.characters) return null;
    return this.characters.registerCharacter(id, root, clips, {
      crowd: true, important: false, procedural: true,
      ...options,
    });
  }

  setPedestrianRoute(id, points, options = {}) {
    return this.characters?.moveAlongPath(id, points, options) ?? false;
  }

  setPedestrianGesture(id, gesture = 'wave', duration = 1.2, onComplete) {
    return this.characters?.gesture(id, gesture, duration, onComplete) ?? false;
  }

  /** Call this once per render frame. Pass measured values from existing gameplay physics. */
  update(dt, motion = {}) {
    if (this.disposed || this.paused) return;
    const delta = clamp(dt, 0, this.maxDelta);
    if (delta <= 0) return;
    this.elapsed += delta;
    this.lastMotion = { ...this.lastMotion, ...motion };
    const m = this.lastMotion;
    const motionScale = this.reducedMotion ? 0.35 : 1;

    if (this.vehicles) {
      if (this.playerVehicleId) this.vehicles.setMotion(this.playerVehicleId, m);
      this.vehicles.update(delta * motionScale);
    }
    if (this.characters) {
      if (this.driverId) {
        this.characters.drivePose(this.driverId, {
          steering: m.steering ?? 0,
          acceleration: m.acceleration ?? 0,
          speed: m.speed ?? 0,
        });
      }
      this.characters.update(delta * motionScale);
    }
  }

  /** Returns a compact diagnostics object for a developer HUD or model-audit panel. */
  getStats() {
    return {
      paused: this.paused,
      reducedMotion: this.reducedMotion,
      mobile: this.mobile,
      playerVehicleId: this.playerVehicleId,
      driverId: this.driverId,
      characters: this.characters?.getStats?.() ?? null,
      vehicles: this.vehicles?.getStats?.() ?? null,
    };
  }

  dispose({ disposeSystems = false } = {}) {
    if (this.disposed) return;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
    if (disposeSystems) {
      this.characters?.dispose?.();
      this.vehicles?.dispose?.();
    }
    this.playerVehicleId = null;
    this.driverId = null;
    this.disposed = true;
  }
}

export default KanoAnimationDirector;
