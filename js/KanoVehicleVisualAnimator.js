import * as THREE from 'three';

/**
 * KANO LIFE — vehicle visual animation layer.
 * Additive visuals only: never changes velocity, steering, collision, or road logic.
 * Supply the existing vehicle root and any known wheel/steering meshes.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
const damp = (current, target, lambda, dt) => THREE.MathUtils.damp(current, target, lambda, dt);

export class KanoVehicleVisualAnimator {
  constructor({ suspensionTravel = 0.075, maxDt = 0.05, vibration = true } = {}) {
    this.suspensionTravel = clamp(suspensionTravel, 0.01, 0.2);
    this.maxDt = clamp(maxDt, 0.01, 0.1);
    this.vibrationEnabled = vibration;
    this.vehicles = new Map();
    this.time = 0;
    this.disposed = false;
  }

  /**
   * id: unique vehicle ID
   * root: existing GLB vehicle root (do not pass the whole scene)
   * options: { wheels: [{ object, axle: 'front'|'rear', radius, steering }],
   *            body, steeringPivot, camera, cameraOffset, followCamera }
   */
  register(id, root, options = {}) {
    if (this.disposed || !id || !root?.isObject3D) return null;
    this.unregister(id);
    const body = options.body || root;
    const camera = options.camera || null;
    const state = {
      id, root, body, wheels: (options.wheels || []).filter(w => w?.object?.isObject3D).map(w => ({
        object: w.object,
        axle: w.axle === 'front' ? 'front' : 'rear',
        radius: clamp(w.radius ?? 0.28, 0.08, 1.2),
        steering: Boolean(w.steering),
        baseRotation: w.object.rotation.clone(),
        spin: 0,
      })),
      steeringPivot: options.steeringPivot?.isObject3D ? options.steeringPivot : null,
      camera,
      cameraOffset: options.cameraOffset?.isVector3 ? options.cameraOffset.clone() : new THREE.Vector3(0, 2.8, 6.5),
      followCamera: Boolean(options.followCamera && camera),
      baseBodyPosition: body.position.clone(),
      baseBodyRotation: body.rotation.clone(),
      speed: 0, steering: 0, acceleration: 0, braking: 0, roadRoughness: 0.25,
      distance: 0, phase: Math.random() * Math.PI * 2, initializedCamera: false,
      targetCameraPosition: new THREE.Vector3(), targetLookAt: new THREE.Vector3(),
      scratch: new THREE.Vector3(), scratch2: new THREE.Vector3(),
    };
    this.vehicles.set(id, state);
    return state;
  }

  /** Supply measurements from the existing physics/game system each frame. */
  setMotion(id, {
    speed = 0, steering = 0, acceleration = 0, braking = 0,
    roadRoughness = 0.25, distanceDelta,
  } = {}) {
    const v = this.vehicles.get(id);
    if (!v) return false;
    v.speed = clamp(speed, -30, 60);
    v.steering = clamp(steering, -1, 1);
    v.acceleration = clamp(acceleration, -1, 1);
    v.braking = clamp(braking, 0, 1);
    v.roadRoughness = clamp(roadRoughness, 0, 1);
    v.distance = Number.isFinite(distanceDelta) ? distanceDelta : v.speed / 60;
    return true;
  }

  update(dt) {
    if (this.disposed) return;
    const delta = clamp(dt, 0, this.maxDt);
    this.time += delta;
    for (const v of this.vehicles.values()) this._updateVehicle(v, delta);
  }

  _updateVehicle(v, dt) {
    const absSpeed = Math.abs(v.speed);
    const moving = clamp(absSpeed / 8, 0, 1.5);
    v.phase += dt * (2.5 + moving * 11);

    // Small suspension travel and body response layered over the existing pose.
    const road = v.roadRoughness;
    const bounce = Math.sin(v.phase * 2.7) * this.suspensionTravel * road * (0.15 + moving * 0.55);
    const fineRattle = this.vibrationEnabled ? Math.sin(v.phase * 17.3) * 0.0022 * moving : 0;
    const targetY = v.baseBodyPosition.y + bounce + fineRattle;
    v.body.position.y = damp(v.body.position.y, targetY, 9, dt);

    const lateralLoad = -v.steering * moving * 0.055;
    const brakingPitch = v.braking * 0.035;
    const accelerationPitch = -v.acceleration * 0.022;
    const targetRoll = v.baseBodyRotation.z + lateralLoad;
    const targetPitch = v.baseBodyRotation.x + brakingPitch + accelerationPitch + Math.sin(v.phase * 1.35) * road * moving * 0.008;
    v.body.rotation.z = damp(v.body.rotation.z, targetRoll, 7, dt);
    v.body.rotation.x = damp(v.body.rotation.x, targetPitch, 6, dt);

    for (const wheel of v.wheels) {
      // Rolling angle follows measured vehicle travel, not an independent speed simulation.
      wheel.spin += (v.distance / wheel.radius) * (wheel.axle === 'front' || wheel.axle === 'rear' ? 1 : 1);
      wheel.object.rotation.x = wheel.baseRotation.x + wheel.spin;
      if (wheel.steering) {
        wheel.object.rotation.y = damp(wheel.object.rotation.y, wheel.baseRotation.y + v.steering * 0.42, 10, dt);
      }
    }

    if (v.steeringPivot) {
      v.steeringPivot.rotation.y = damp(v.steeringPivot.rotation.y, v.steering * 0.48, 12, dt);
    }

    if (v.followCamera && v.camera) this._updateCamera(v, dt, moving);
  }

  _updateCamera(v, dt, moving) {
    const root = v.root;
    const offset = v.cameraOffset;
    v.targetCameraPosition.copy(offset).applyQuaternion(root.quaternion).add(root.position);
    // Gentle camera lag increases with speed but remains bounded.
    v.camera.position.lerp(v.targetCameraPosition, 1 - Math.exp(-dt * (4.5 + moving)));
    v.targetLookAt.copy(root.position).add(new THREE.Vector3(0, 1.0, 0));
    const currentLook = v.scratch.copy(v.camera.getWorldDirection(v.scratch2)).multiplyScalar(5).add(v.camera.position);
    currentLook.lerp(v.targetLookAt, 1 - Math.exp(-dt * 5));
    v.camera.lookAt(currentLook);
  }

  unregister(id) {
    const v = this.vehicles.get(id);
    if (!v) return;
    // Restore body pose to avoid leaving offsets behind when the visual layer stops.
    v.body.position.copy(v.baseBodyPosition);
    v.body.rotation.copy(v.baseBodyRotation);
    for (const wheel of v.wheels) wheel.object.rotation.copy(wheel.baseRotation);
    if (v.steeringPivot) v.steeringPivot.rotation.y = 0;
    this.vehicles.delete(id);
  }

  getStats() { return { vehicles: this.vehicles.size, vibration: this.vibrationEnabled }; }

  dispose() {
    for (const id of [...this.vehicles.keys()]) this.unregister(id);
    this.disposed = true;
  }
}
