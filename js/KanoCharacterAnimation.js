import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Kano Life character animation helpers.
 *
 * Responsibilities:
 * - Play GLB animation clips through AnimationMixer when clips exist.
 * - Provide a lightweight procedural fallback gait for rigs without clips.
 * - Animate a passenger along a world-space path for boarding/alighting.
 * - Dispose actors and mixer resources predictably.
 *
 * This module intentionally does not create a second game state, road, or
 * passenger inventory. Callers remain responsible for deciding when boarding
 * and alighting should start and for updating the authoritative passenger count.
 */
export class KanoCharacterAnimation {
  constructor({ scene, mobile = false } = {}) {
    if (!scene?.isObject3D) throw new TypeError('KanoCharacterAnimation requires a THREE.Scene or Object3D.');
    this.scene = scene;
    this.mobile = Boolean(mobile);
    this.actors = new Set();
    this.maxActors = this.mobile ? 6 : 12;
    this.disposed = false;
  }

  /** Register an already-loaded GLB character and automatically select a clip. */
  registerCharacter(root, clips = [], { role = 'pedestrian', scale = 1 } = {}) {
    this.assertActive();
    if (!root?.isObject3D) throw new TypeError('registerCharacter requires a loaded GLB scene root.');
    if (this.actors.size >= this.maxActors) return null;

    root.scale.multiplyScalar(scale);
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.frustumCulled = true;
      node.castShadow = !this.mobile;
      node.receiveShadow = false;
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => { if (material) material.needsUpdate = true; });
      } else if (node.material) {
        node.material.needsUpdate = true;
      }
    });

    const mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    const actor = {
      root,
      role,
      mixer,
      clips,
      action: null,
      procedural: { phase: Math.random() * Math.PI * 2, stride: 0, bob: 0 },
      motion: null,
      finished: false,
      originalPosition: root.position.clone(),
      originalRotation: root.rotation.clone(),
    };

    if (mixer) {
      const preferred = this.findClip(clips, role === 'driver' ? ['idle', 'sit', 'drive'] : ['walk', 'run', 'idle']);
      if (preferred) {
        actor.action = mixer.clipAction(preferred);
        actor.action.reset().play();
      }
    }

    root.userData.kanoCharacterActor = actor;
    this.actors.add(actor);
    return actor;
  }

  findClip(clips, terms) {
    const normalized = clips.map((clip) => ({ clip, name: String(clip.name || '').toLowerCase() }));
    for (const term of terms) {
      const match = normalized.find(({ name }) => name.includes(term));
      if (match) return match.clip;
    }
    return clips[0] || null;
  }

  /** Start a smooth path motion; points are world-space THREE.Vector3 values. */
  moveAlong(actor, points, { duration = 1.6, facing = true, onComplete = null } = {}) {
    this.assertActor(actor);
    if (!Array.isArray(points) || points.length < 2 || points.some((p) => !p?.isVector3)) {
      throw new TypeError('moveAlong requires at least two THREE.Vector3 path points.');
    }
    actor.motion = {
      points: points.map((point) => point.clone()),
      elapsed: 0,
      duration: Math.max(0.15, Number(duration) || 1.6),
      facing: Boolean(facing),
      onComplete: typeof onComplete === 'function' ? onComplete : null,
      start: actor.root.position.clone(),
    };
    actor.finished = false;
    this.play(actor, ['walk', 'run']);
  }

  /** Convenience for a passenger approaching a Keke doorway and boarding. */
  boardPassenger(actor, approachPoint, seatPoint, options = {}) {
    this.moveAlong(actor, [actor.root.position.clone(), approachPoint.clone(), seatPoint.clone()], {
      duration: options.duration ?? 2.0,
      facing: true,
      onComplete: options.onComplete,
    });
  }

  /** Convenience for a passenger exiting the Keke and walking to the kerb. */
  alightPassenger(actor, doorPoint, destinationPoint, options = {}) {
    this.moveAlong(actor, [actor.root.position.clone(), doorPoint.clone(), destinationPoint.clone()], {
      duration: options.duration ?? 2.2,
      facing: true,
      onComplete: options.onComplete,
    });
  }

  play(actor, terms) {
    this.assertActor(actor);
    if (!actor.mixer || !actor.clips.length) return false;
    const clip = this.findClip(actor.clips, terms);
    if (!clip) return false;
    if (actor.action?.getClip() === clip && actor.action.isRunning()) return true;
    const next = actor.mixer.clipAction(clip);
    next.reset().fadeIn(0.12).play();
    actor.action?.fadeOut(0.12);
    actor.action = next;
    return true;
  }

  update(deltaSeconds) {
    if (this.disposed) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    for (const actor of this.actors) {
      actor.mixer?.update(dt);
      if (actor.motion) this.updateMotion(actor, dt);
      else if (!actor.mixer) this.updateProcedural(actor, dt);
    }
  }

  updateMotion(actor, dt) {
    const motion = actor.motion;
    motion.elapsed = Math.min(motion.duration, motion.elapsed + dt);
    const progress = motion.elapsed / motion.duration;
    const eased = progress * progress * (3 - 2 * progress);
    const scaled = eased * (motion.points.length - 1);
    const index = Math.min(motion.points.length - 2, Math.floor(scaled));
    const localT = scaled - index;
    const from = motion.points[index];
    const to = motion.points[index + 1];
    actor.root.position.lerpVectors(from, to, localT);

    if (motion.facing) {
      const direction = new THREE.Vector3().subVectors(to, from);
      direction.y = 0;
      if (direction.lengthSq() > 1e-5) {
        const targetYaw = Math.atan2(direction.x, direction.z);
        actor.root.rotation.y = THREE.MathUtils.lerp(actor.root.rotation.y, targetYaw, 1 - Math.exp(-dt * 10));
      }
    }

    if (progress >= 1) {
      actor.motion = null;
      actor.finished = true;
      this.play(actor, ['idle', 'stand']);
      const callback = motion.onComplete;
      if (callback) callback(actor);
    }
  }

  updateProcedural(actor, dt) {
    const moving = Boolean(actor.motion);
    actor.procedural.phase += dt * (moving ? 9.5 : 1.4);
    const wave = Math.sin(actor.procedural.phase);
    actor.root.position.y = actor.originalPosition.y + (moving ? Math.abs(wave) * 0.035 : Math.sin(actor.procedural.phase * 0.5) * 0.006);
    actor.root.rotation.z = moving ? wave * 0.025 : Math.sin(actor.procedural.phase * 0.5) * 0.004;
  }

  /** Animate a driver rig using named bones or pivots, without moving the GLB root. */
  animateDriver(driverRoot, state, dt) {
    if (!driverRoot?.isObject3D) return;
    const steer = clamp(Number(state?.steer) || 0, -1, 1);
    const speed = Math.max(0, Number(state?.speed) || 0);
    const reversing = Boolean(state?.reverse) || (Number(state?.signedSpeed) || 0) < -0.05;
    const time = performance.now() * 0.001;
    const find = (names) => {
      for (const name of names) {
        const object = driverRoot.getObjectByName(name);
        if (object) return object;
      }
      return null;
    };
    const head = find(['Head', 'head', 'mixamorigHead', 'KANO_DRIVER_HEAD']);
    const shoulders = [
      find(['LeftArm', 'leftArm', 'mixamorigLeftArm', 'KANO_KEKE_DRIVER_SHOULDER_LEFT']),
      find(['RightArm', 'rightArm', 'mixamorigRightArm', 'KANO_KEKE_DRIVER_SHOULDER_RIGHT']),
    ];
    if (head) {
      head.rotation.y = lerp(head.rotation.y, reversing ? Math.PI : steer * 0.12, clamp(dt * 4, 0, 1));
      head.rotation.x = lerp(head.rotation.x, Math.sin(time * 1.7) * 0.012, clamp(dt * 3, 0, 1));
    }
    shoulders.forEach((arm, index) => {
      if (!arm) return;
      const side = index === 0 ? -1 : 1;
      arm.rotation.z = lerp(arm.rotation.z, side * (0.10 + steer * 0.09), clamp(dt * 5, 0, 1));
      arm.rotation.x = lerp(arm.rotation.x, -0.18 - Math.min(speed / 80, 0.08), clamp(dt * 5, 0, 1));
    });
  }

  remove(actor, { disposeMaterials = false } = {}) {
    if (!actor || !this.actors.has(actor)) return;
    this.actors.delete(actor);
    actor.mixer?.stopAllAction();
    actor.mixer?.uncacheRoot(actor.root);
    actor.root.parent?.remove(actor.root);
    if (disposeMaterials) this.disposeObject(actor.root);
    actor.motion = null;
    actor.root.userData.kanoCharacterActor = null;
  }

  disposeObject(root) {
    root.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
  }

  assertActive() {
    if (this.disposed) throw new Error('KanoCharacterAnimation has been disposed.');
  }

  assertActor(actor) {
    this.assertActive();
    if (!actor || !this.actors.has(actor)) throw new TypeError('Actor is not registered with this animation system.');
  }

  dispose() {
    if (this.disposed) return;
    for (const actor of [...this.actors]) this.remove(actor);
    this.disposed = true;
  }
}
