import * as THREE from 'three';

/**
 * KANO LIFE — WORLD ANIMATION DIRECTOR
 * Ambient, low-cost motion for market crowds, roadside stalls, goats, flags,
 * hanging signs, trees, and environmental dust. This module does not create
 * assets; register existing scene objects after they are loaded.
 */
export class KanoWorldAnimationDirector {
  constructor({ scene = null, isMobile = false, maxActors, reducedMotion } = {}) {
    this.scene = scene;
    this.isMobile = Boolean(isMobile);
    this.maxActors = Math.max(4, Number(maxActors ?? (this.isMobile ? 24 : 60)));
    this.reducedMotion = reducedMotion ?? (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.actors = new Map();
    this.nextId = 1;
    this.elapsed = 0;
    this.paused = false;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._onVisibility = () => { this.paused = typeof document !== 'undefined' && document.hidden; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
  }

  /** Register an existing Object3D. type: pedestrian | goat | flag | sign | stall | tree | dust. */
  register(object, options = {}) {
    if (!object?.isObject3D) throw new TypeError('register() requires a THREE.Object3D');
    if (this.actors.size >= this.maxActors) return null;
    const type = options.type ?? 'pedestrian';
    const id = options.id ?? `world-actor-${this.nextId++}`;
    if (this.actors.has(id)) this.unregister(id);
    const origin = object.position.clone();
    const actor = {
      id, object, type, origin,
      phase: Math.random() * Math.PI * 2,
      amplitude: Math.max(0, Number(options.amplitude ?? this._defaultAmplitude(type))),
      speed: Math.max(0, Number(options.speed ?? this._defaultSpeed(type))),
      radius: Math.max(0, Number(options.radius ?? (type === 'goat' ? 1.8 : 0.8))),
      wander: Boolean(options.wander ?? ['pedestrian', 'goat'].includes(type)),
      bounds: options.bounds ?? null,
      baseRotation: object.rotation.clone(),
      baseScale: object.scale.clone(),
      target: origin.clone(),
      targetTimer: 0,
      enabled: options.enabled !== false,
      seed: Math.random() * 1000,
    };
    this.actors.set(id, actor);
    return id;
  }

  _defaultAmplitude(type) {
    return ({ pedestrian: 0.035, goat: 0.06, flag: 0.22, sign: 0.035, stall: 0.012, tree: 0.025, dust: 0.08 })[type] ?? 0.02;
  }
  _defaultSpeed(type) {
    return ({ pedestrian: 0.55, goat: 0.8, flag: 1.8, sign: 0.7, stall: 0.4, tree: 0.3, dust: 0.7 })[type] ?? 0.5;
  }

  unregister(id) {
    const actor = this.actors.get(id);
    if (!actor) return false;
    // The director never disposes geometry/materials because registered assets may be shared.
    this.actors.delete(id);
    return true;
  }

  setEnabled(id, enabled) {
    const actor = this.actors.get(id);
    if (actor) actor.enabled = Boolean(enabled);
  }

  setReducedMotion(enabled) { this.reducedMotion = Boolean(enabled); }
  setMobile(enabled) { this.isMobile = Boolean(enabled); }
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  update(deltaSeconds, { playerPosition = null, maxDistance = this.isMobile ? 75 : 120 } = {}) {
    if (this.paused || this.reducedMotion) return;
    const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
    if (!dt) return;
    this.elapsed += dt;
    const maxDistSq = maxDistance * maxDistance;

    for (const actor of this.actors.values()) {
      if (!actor.enabled || !actor.object.parent) continue;
      if (playerPosition && actor.object.position.distanceToSquared(playerPosition) > maxDistSq) continue;
      const t = this.elapsed * actor.speed + actor.phase;
      const obj = actor.object;
      switch (actor.type) {
        case 'pedestrian': this._animatePedestrian(actor, dt, t); break;
        case 'goat': this._animateGoat(actor, dt, t); break;
        case 'flag': obj.rotation.z = actor.baseRotation.z + Math.sin(t) * actor.amplitude; break;
        case 'sign': obj.rotation.y = actor.baseRotation.y + Math.sin(t) * actor.amplitude; break;
        case 'stall': obj.position.y = actor.origin.y + Math.sin(t) * actor.amplitude; break;
        case 'tree': obj.rotation.z = actor.baseRotation.z + Math.sin(t * 0.7) * actor.amplitude; break;
        case 'dust':
          obj.position.y = actor.origin.y + (0.5 + 0.5 * Math.sin(t)) * actor.amplitude;
          if (obj.material && 'opacity' in obj.material) obj.material.opacity = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t));
          break;
        default: obj.rotation.y = actor.baseRotation.y + Math.sin(t) * actor.amplitude * 0.25;
      }
    }
  }

  _animatePedestrian(actor, dt, t) {
    const obj = actor.object;
    if (actor.wander) this._wander(actor, dt, 0.45);
    // Gentle torso/head sway. Avoid rotating the whole actor's yaw each frame.
    obj.position.y = actor.origin.y + Math.abs(Math.sin(t * 2.8)) * actor.amplitude;
    if (actor.wander) {
      const dx = actor.target.x - obj.position.x;
      const dz = actor.target.z - obj.position.z;
      if (dx * dx + dz * dz > 0.0004) obj.rotation.y = Math.atan2(dx, dz);
    }
  }

  _animateGoat(actor, dt, t) {
    if (actor.wander) this._wander(actor, dt, 0.7);
    actor.object.position.y = actor.origin.y + Math.abs(Math.sin(t * 4.2)) * actor.amplitude * 0.35;
    actor.object.rotation.z = actor.baseRotation.z + Math.sin(t * 2.1) * actor.amplitude * 0.15;
  }

  _wander(actor, dt, pace) {
    actor.targetTimer -= dt;
    if (actor.targetTimer <= 0 || actor.object.position.distanceToSquared(actor.target) < 0.16) {
      actor.targetTimer = 1.5 + Math.random() * 3.5;
      const b = actor.bounds;
      const radius = actor.radius;
      const cx = actor.origin.x;
      const cz = actor.origin.z;
      actor.target.set(
        b ? THREE.MathUtils.clamp(cx + (Math.random() * 2 - 1) * radius, b.minX, b.maxX) : cx + (Math.random() * 2 - 1) * radius,
        actor.origin.y,
        b ? THREE.MathUtils.clamp(cz + (Math.random() * 2 - 1) * radius, b.minZ, b.maxZ) : cz + (Math.random() * 2 - 1) * radius,
      );
    }
    const obj = actor.object;
    this._tmp.copy(actor.target).sub(obj.position);
    this._tmp.y = 0;
    const distance = this._tmp.length();
    if (distance > 0.001) {
      const step = Math.min(distance, pace * dt);
      this._tmp.multiplyScalar(step / distance);
      obj.position.add(this._tmp);
    }
  }

  /** Restore registered objects to their captured starting transforms. */
  reset() {
    for (const actor of this.actors.values()) {
      actor.object.position.copy(actor.origin);
      actor.object.rotation.copy(actor.baseRotation);
      actor.object.scale.copy(actor.baseScale);
      actor.target.copy(actor.origin);
      actor.targetTimer = 0;
    }
    this.elapsed = 0;
  }

  dispose() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
    this.actors.clear();
    this.scene = null;
  }
}

export default KanoWorldAnimationDirector;
