import * as THREE from 'three';

/**
 * KANO LIFE — character animation runtime
 * Drop-in animation layer for existing GLTF character roots. Does not create a
 * renderer, scene, road, traffic, or replacement gameplay system.
 */
const CLIP_ALIASES = {
  idle: ['idle', 'standing', 'stand', 'breathing'],
  walk: ['walk', 'walking', 'pedestrian'],
  run: ['run', 'running', 'jog'],
  sit: ['sit', 'sitting', 'seated', 'drive', 'driving'],
  board: ['board', 'boarding', 'enter', 'getting in', 'get in'],
  alight: ['alight', 'exit', 'getting out', 'get out', 'dismount'],
  wave: ['wave', 'greet', 'hello'],
  talk: ['talk', 'talking', 'conversation'],
  react: ['react', 'hit', 'surprise', 'stumble'],
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class KanoCharacterAnimation {
  constructor({ mobile = /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || ''), maxActors, fadeDuration = 0.22 } = {}) {
    this.mobile = mobile;
    this.maxActors = maxActors ?? (mobile ? 18 : 40);
    this.fadeDuration = fadeDuration;
    this.actors = new Map();
    this.clock = 0;
    this.disposed = false;
    this._scratch = new THREE.Vector3();
  }

  registerCharacter(id, root, clips = [], options = {}) {
    if (this.disposed || !id || !root) return null;
    const existing = this.actors.get(id);
    if (existing) this.removeCharacter(id);
    if (this.actors.size >= this.maxActors) {
      const disposable = [...this.actors.values()].find((a) => a.options.crowd && !a.options.important);
      if (disposable) this.removeCharacter(disposable.id);
      else return null;
    }

    const mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    const actions = new Map();
    const names = new Map();
    if (mixer) {
      for (const clip of clips) {
        const key = this._classifyClip(clip.name);
        if (key && !actions.has(key)) {
          const action = mixer.clipAction(clip);
          action.enabled = true;
          action.clampWhenFinished = key === 'board' || key === 'alight' || key === 'react';
          actions.set(key, action);
          names.set(key, clip.name);
        }
      }
    }

    const actor = {
      id, root, mixer, actions, clipNames: names, currentAction: null, currentState: 'idle',
      stateTime: 0, phase: Math.random() * Math.PI * 2, speed: 0, turn: 0, bob: 0,
      basePosition: root.position.clone(), baseRotation: root.rotation.clone(),
      motion: null, gesture: null, removed: false, options: {
        crowd: false, important: false, scale: 1, procedural: true, faceDirection: true,
        ...options,
      },
    };
    if (actor.options.scale !== 1) root.scale.multiplyScalar(actor.options.scale);
    root.userData.kanoAnimationId = id;
    root.userData.kanoAnimation = actor;
    this.actors.set(id, actor);
    this._play(actor, 'idle', 0);
    return actor;
  }

  _classifyClip(name = '') {
    const value = name.toLowerCase().replace(/[_-]+/g, ' ');
    for (const [state, aliases] of Object.entries(CLIP_ALIASES)) {
      if (aliases.some((alias) => value.includes(alias))) return state;
    }
    return null;
  }

  _play(actor, state, fade = this.fadeDuration, { once = false, timeScale = 1 } = {}) {
    if (!actor || actor.removed) return;
    const action = actor.actions.get(state) || actor.actions.get(state === 'run' ? 'walk' : state === 'walk' ? 'idle' : 'idle');
    actor.currentState = state;
    actor.stateTime = 0;
    if (!action) return;
    if (actor.currentAction === action && action.isRunning()) {
      action.timeScale = timeScale;
      return;
    }
    if (actor.currentAction) actor.currentAction.fadeOut(Math.max(0, fade));
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.fadeIn(Math.max(0, fade)).play();
    actor.currentAction = action;
  }

  setState(id, state, options = {}) {
    const actor = this.actors.get(id);
    if (!actor) return false;
    this._play(actor, state, options.fade ?? this.fadeDuration, options);
    return true;
  }

  setLocomotion(id, { speed = 0, turn = 0, running = false } = {}) {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.speed = Number.isFinite(speed) ? speed : 0;
    actor.turn = clamp(Number(turn) || 0, -1, 1);
    const magnitude = Math.abs(actor.speed);
    const state = magnitude < 0.06 ? 'idle' : (running || magnitude > 2.2 ? 'run' : 'walk');
    if (actor.currentState !== state) this._play(actor, state);
    if (actor.currentAction) actor.currentAction.timeScale = clamp(0.65 + magnitude * 0.2, 0.65, state === 'run' ? 1.8 : 1.25);
  }

  moveAlongPath(id, points, { speed = 1.2, loop = false, faceDirection = true, onComplete } = {}) {
    const actor = this.actors.get(id);
    if (!actor || !Array.isArray(points) || points.length < 2) return false;
    const path = points.map((p) => p.isVector3 ? p.clone() : new THREE.Vector3(p.x, p.y ?? 0, p.z));
    actor.motion = { path, segment: 0, progress: 0, speed: Math.max(0.01, speed), loop, faceDirection, onComplete, lastPosition: actor.root.position.clone() };
    actor.options.faceDirection = faceDirection;
    this._play(actor, 'walk');
    return true;
  }

  stopPath(id, { idle = true } = {}) {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.motion = null;
    if (idle) this._play(actor, 'idle');
  }

  boardPassenger(id, seatPosition, { duration = 0.85, onComplete } = {}) {
    return this._playTransition(id, 'board', seatPosition, duration, onComplete);
  }

  alightPassenger(id, exitPosition, { duration = 0.8, onComplete } = {}) {
    return this._playTransition(id, 'alight', exitPosition, duration, onComplete);
  }

  _playTransition(id, state, target, duration, onComplete) {
    const actor = this.actors.get(id);
    if (!actor || !target) return false;
    const destination = target.isVector3 ? target.clone() : new THREE.Vector3(target.x, target.y ?? 0, target.z);
    actor.motion = {
      transition: true, from: actor.root.position.clone(), to: destination,
      elapsed: 0, duration: Math.max(0.1, duration), onComplete,
    };
    this._play(actor, state, 0.12, { once: true });
    return true;
  }

  gesture(id, gesture = 'wave', duration = 1.2, onComplete) {
    const actor = this.actors.get(id);
    if (!actor) return false;
    actor.gesture = { previous: actor.currentState, elapsed: 0, duration, onComplete };
    this._play(actor, gesture, 0.14, { once: true });
    return true;
  }

  /** Adds a subtle body lean to the driver's model from vehicle motion. */
  drivePose(id, { steering = 0, acceleration = 0, speed = 0 } = {}) {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.turn = clamp(steering, -1, 1);
    actor.speed = speed;
    actor.driveAcceleration = clamp(acceleration, -1, 1);
    if (actor.currentState !== 'sit') this._play(actor, actor.actions.has('sit') ? 'sit' : 'idle');
  }

  update(dt, { timeScale = 1 } = {}) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05) * clamp(timeScale, 0, 2);
    this.clock += delta;
    for (const actor of this.actors.values()) {
      if (actor.removed) continue;
      actor.stateTime += delta;
      if (actor.mixer) actor.mixer.update(delta);
      if (actor.motion) this._updateMotion(actor, delta);
      this._updateSecondaryMotion(actor, delta);
      if (!actor.mixer && actor.options.procedural) this._updateProcedural(actor, delta);
      if (actor.gesture && actor.gesture.elapsed >= actor.gesture.duration) {
        const gesture = actor.gesture;
        actor.gesture = null;
        gesture.onComplete?.(actor.root);
        this._play(actor, gesture.previous === 'wave' || gesture.previous === 'talk' ? 'idle' : gesture.previous);
      }
    }
  }

  _updateMotion(actor, dt) {
    const motion = actor.motion;
    if (motion.transition) {
      motion.elapsed += dt;
      const t = smoothstep(0, 1, motion.elapsed / motion.duration);
      actor.root.position.lerpVectors(motion.from, motion.to, t);
      if (motion.elapsed >= motion.duration) {
        actor.motion = null;
        motion.onComplete?.(actor.root);
        this._play(actor, 'idle');
      }
      return;
    }
    const a = motion.path[motion.segment];
    const b = motion.path[(motion.segment + 1) % motion.path.length];
    const distance = a.distanceTo(b);
    motion.progress += dt * motion.speed / Math.max(0.001, distance);
    const t = clamp(motion.progress, 0, 1);
    actor.root.position.lerpVectors(a, b, t);
    if (motion.faceDirection && distance > 0.001) {
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      actor.root.rotation.y = THREE.MathUtils.damp(actor.root.rotation.y, yaw, 8, dt);
    }
    if (t >= 1) {
      motion.segment += 1;
      motion.progress = 0;
      if (motion.segment >= motion.path.length - 1) {
        if (motion.loop) motion.segment = 0;
        else {
          actor.motion = null;
          motion.onComplete?.(actor.root);
          this._play(actor, 'idle');
        }
      }
    }
  }

  _updateSecondaryMotion(actor, dt) {
    if (actor.gesture) actor.gesture.elapsed += dt;
    const root = actor.root;
    const turn = actor.turn || 0;
    const speed = Math.abs(actor.speed || 0);
    const drive = actor.currentState === 'sit';
    const targetRoll = drive ? -turn * 0.045 * clamp(speed / 4, 0.25, 1.3) : 0;
    const targetPitch = drive ? -(actor.driveAcceleration || 0) * 0.025 : 0;
    root.rotation.z = THREE.MathUtils.damp(root.rotation.z, actor.baseRotation.z + targetRoll, 5, dt);
    root.rotation.x = THREE.MathUtils.damp(root.rotation.x, actor.baseRotation.x + targetPitch, 4, dt);
    if (!actor.mixer && !actor.motion && actor.options.procedural) {
      actor.phase += dt * (0.9 + speed * 0.8);
      const bobTarget = actor.currentState === 'idle' ? Math.sin(actor.phase) * 0.006 : 0;
      actor.bob = THREE.MathUtils.damp(actor.bob, bobTarget, 5, dt);
      root.position.y = actor.basePosition.y + actor.bob;
    }
  }

  _updateProcedural(actor, dt) {
    // Safe fallback when a GLB has no skeletal clips. It avoids fake limb rigs;
    // subtle breathing and body weight-shift keep static meshes from feeling frozen.
    const root = actor.root;
    if (actor.motion && !actor.motion.transition) {
      actor.phase += dt * (actor.currentState === 'run' ? 10 : 6);
      const amplitude = actor.currentState === 'run' ? 0.035 : 0.018;
      root.position.y = actor.basePosition.y + Math.abs(Math.sin(actor.phase)) * amplitude;
      root.rotation.z = actor.baseRotation.z + Math.sin(actor.phase * 0.5) * 0.025;
    }
  }

  removeCharacter(id) {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.removed = true;
    actor.mixer?.stopAllAction();
    actor.mixer?.uncacheRoot(actor.root);
    delete actor.root.userData.kanoAnimation;
    this.actors.delete(id);
  }

  getActor(id) { return this.actors.get(id) || null; }
  getStats() {
    let animated = 0;
    for (const actor of this.actors.values()) if (actor.mixer) animated++;
    return { actors: this.actors.size, skeletalActors: animated, proceduralActors: this.actors.size - animated, maxActors: this.maxActors, mobile: this.mobile };
  }

  dispose() {
    for (const id of [...this.actors.keys()]) this.removeCharacter(id);
    this.disposed = true;
    this._scratch.set(0, 0, 0);
  }
}

/** Build a reusable walk route around a street block. */
export function createKanoPedestrianRoute(THREERef, center, radius = 5, points = 6, y = 0) {
  const THREEImpl = THREERef || THREE;
  const cx = center?.x || 0;
  const cz = center?.z || 0;
  return Array.from({ length: Math.max(3, points) }, (_, i) => {
    const angle = (i / Math.max(3, points)) * Math.PI * 2;
    return new THREEImpl.Vector3(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius);
  });
}
