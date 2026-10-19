import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const CHARACTER_KEYS = new Set([
  'passenger',
  'passengerWoman',
  'passengerMan',
  'passengerVIP',
  'security',
  'pedestrian',
  'pedestrianWoman',
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const choose = (items) => items[Math.floor(Math.random() * items.length)];

function isCharacterModel(root) {
  return Boolean(root && CHARACTER_KEYS.has(root.userData?.modelKey));
}

function safeUrlForModel(relativePath) {
  const encodedPath = String(relativePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return new URL(`/assets/models/${encodedPath}`, window.location.origin).href;
}

function disposeTemporaryGLTFScene(root) {
  if (!root) return;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);

      for (const value of Object.values(material)) {
        if (value?.isTexture && !textures.has(value)) {
          textures.add(value);
          value.dispose();
        }
      }

      material.dispose();
    }
  });
}

/**
 * Runtime add-on for safer animated character clones and lane-aware traffic.
 * The existing Game remains authoritative for traffic movement, collision,
 * fare, fuel, condition and run score. This module only selects archetypes,
 * steers traffic toward safe lane targets, and advances available GLB clips.
 */
export class KanoTrafficDirector {
  constructor({ game, mobile = false } = {}) {
    if (!game?.s) {
      throw new TypeError('KanoTrafficDirector requires an initialized Game instance.');
    }

    this.game = game;
    this.mobile = Boolean(mobile);
    this.elapsed = 0;
    this.disposed = false;
    this.originalSpawnTraffic = null;
    this.spawnWrapper = null;

    this.install();
  }

  install() {
    const game = this.game;
    const originalSpawn = game.spawnTraffic;

    if (typeof originalSpawn === 'function') {
      this.originalSpawnTraffic = originalSpawn;
      const director = this;

      this.spawnWrapper = function (...args) {
        const existing = new Set((this.s?.traffic || []).map((vehicle) => vehicle.id));
        const result = originalSpawn.apply(this, args);

        for (const vehicle of this.s?.traffic || []) {
          if (!existing.has(vehicle.id) && !vehicle.aiArchetype) {
            director.configureVehicle(vehicle);
          }
        }

        return result;
      };

      game.spawnTraffic = this.spawnWrapper;
    }

    // The Game constructor spawns its initial pool before main.js creates this
    // director, so initialise that first pool explicitly.
    for (const vehicle of game.s.traffic || []) {
      this.configureVehicle(vehicle);
    }
  }

  configureVehicle(vehicle) {
    if (!vehicle || vehicle.aiArchetype) return vehicle;

    const roll = Math.random();
    let type;
    let archetype;

    // Keep the intended Kano traffic mix close to 40% keke, 30% Okada,
    // and 30% private/commercial vehicles. Danfo buses are part of the last group.
    if (roll < 0.40) {
      type = 'keke';
      archetype = 'keke';
    } else if (roll < 0.70) {
      type = 'motorcycle';
      archetype = 'okada';
    } else if (roll < 0.78) {
      type = 'bus';
      archetype = 'danfo';
    } else {
      type = choose(['car', 'taxi', 'suv']);
      archetype = 'car';
    }

    vehicle.type = type;
    vehicle.aiArchetype = archetype;
    vehicle.aiPhase = rand(0, Math.PI * 2);
    vehicle.aiClock = rand(0, 7);
    vehicle.aiLaneChangeCooldown = rand(1.2, 3.2);
    vehicle.aiBaseLane = Number.isFinite(vehicle.lane)
      ? Math.round(vehicle.lane)
      : Math.floor(rand(0, 3));
    vehicle.lane = vehicle.aiBaseLane;
    vehicle.aiTargetLane = vehicle.aiBaseLane;
    vehicle.aiBaseSpeed = this.baseSpeedFor(archetype, vehicle.direction);
    vehicle.speedKmh = vehicle.aiBaseSpeed;
    vehicle.aiBlockingWidth = archetype === 'danfo' ? 0.58 : archetype === 'keke' ? 0.25 : 0.32;

    // The Game uses lane 0 as the opposing flow in two-way mode. Keep those
    // vehicles there; never weave an oncoming actor across the centre lanes.
    if (vehicle.direction === -1) {
      vehicle.aiBaseLane = 0;
      vehicle.aiTargetLane = 0;
      vehicle.lane = 0;
    } else if (this.game.s.roadMode === 'twoway') {
      vehicle.aiBaseLane = clamp(vehicle.aiBaseLane, 1, 2);
      vehicle.aiTargetLane = vehicle.aiBaseLane;
      vehicle.lane = vehicle.aiBaseLane;
    }

    return vehicle;
  }

  baseSpeedFor(archetype, direction = 1) {
    if (archetype === 'okada') return rand(34, 50);
    if (archetype === 'danfo') return rand(15, 24);
    if (archetype === 'keke') return rand(17, 30);
    return rand(22, 39);
  }

  getAllowedLanes(vehicle) {
    if (vehicle.direction === -1) return [0];
    return this.game.s.roadMode === 'twoway'
      ? [1, 2]
      : [0, 1, 2];
  }

  trafficAhead(vehicle) {
    const pool = this.game.s.traffic || [];
    let closest = null;
    let closestGap = Infinity;

    for (const other of pool) {
      if (other === vehicle || other.direction !== vehicle.direction) continue;
      if (Math.abs((other.lane ?? 0) - (vehicle.lane ?? 0)) > 0.38) continue;

      const gap = (Number(other.depth) || 0) - (Number(vehicle.depth) || 0);
      if (gap > 0.015 && gap < 0.23 && gap < closestGap) {
        closest = other;
        closestGap = gap;
      }
    }

    return closest ? { vehicle: closest, gap: closestGap } : null;
  }

  laneIsClear(vehicle, lane) {
    for (const other of this.game.s.traffic || []) {
      if (other === vehicle || other.direction !== vehicle.direction) continue;
      if (Math.abs((other.lane ?? 0) - lane) > 0.42) continue;
      if (Math.abs((other.depth ?? 0) - (vehicle.depth ?? 0)) < 0.14) return false;
    }
    return true;
  }

  update(deltaSeconds) {
    if (this.disposed || !this.game?.s) return;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;

    if (this.game.state !== 'PLAY' || this.game.s.event) return;

    const pool = this.game.s.traffic || [];
    for (const vehicle of pool) {
      this.configureVehicle(vehicle);
      vehicle.aiClock = (vehicle.aiClock || 0) + dt;
      vehicle.aiLaneChangeCooldown = Math.max(0, (vehicle.aiLaneChangeCooldown || 0) - dt);

      const archetype = vehicle.aiArchetype;
      const allowedLanes = this.getAllowedLanes(vehicle);
      const ahead = this.trafficAhead(vehicle);
      let target = Number.isFinite(vehicle.aiTargetLane)
        ? vehicle.aiTargetLane
        : vehicle.aiBaseLane;

      if (archetype === 'okada') {
        // A motorbike makes small, smooth weaving movements. It only changes
        // lane when a same-direction actor is sufficiently close ahead.
        if (ahead && vehicle.aiLaneChangeCooldown <= 0 && vehicle.direction !== -1) {
          const alternatives = allowedLanes.filter((lane) =>
            lane !== Math.round(vehicle.aiTargetLane) && this.laneIsClear(vehicle, lane),
          );
          if (alternatives.length) {
            target = choose(alternatives);
            vehicle.aiTargetLane = target;
            vehicle.aiLaneChangeCooldown = rand(1.7, 3.6);
          }
        }

        const weave = vehicle.direction === -1
          ? 0
          : Math.sin(vehicle.aiClock * 2.2 + vehicle.aiPhase) * 0.075;
        target = clamp(target + weave, Math.min(...allowedLanes), Math.max(...allowedLanes));
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.25);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.8 + vehicle.aiPhase) * 2.8;
      } else if (archetype === 'danfo') {
        // Danfo keeps its lane and speed, behaving like a slower, wide vehicle.
        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 2.2);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.24 + vehicle.aiPhase) * 0.8;
      } else if (archetype === 'keke') {
        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.6);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.38 + vehicle.aiPhase) * 1.5;
      } else {
        if (ahead && ahead.gap < 0.09) {
          vehicle.speedKmh = Math.min(vehicle.aiBaseSpeed, ahead.vehicle.speedKmh || vehicle.aiBaseSpeed);
        } else {
          vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.31 + vehicle.aiPhase) * 1.7;
        }
        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.8);
      }

      vehicle.speedKmh = clamp(Number(vehicle.speedKmh) || 0, 8, 52);
      vehicle.lane = clamp(Number(vehicle.lane) || 0, Math.min(...allowedLanes), Math.max(...allowedLanes));
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.originalSpawnTraffic && this.game.spawnTraffic === this.spawnWrapper) {
      this.game.spawnTraffic = this.originalSpawnTraffic;
    }
  }
}

/**
 * Plays embedded GLB animation clips on real character instances when the
 * source assets provide them. Assets without clips keep their existing
 * procedural animations. Uses SkeletonUtils.clone for skinned character
 * model instances so independent skeletons can be animated safely.
 */
export class KanoGLBAnimationManager {
  constructor({ renderer, models, mobile = false, debug = false } = {}) {
    if (!renderer || !models) {
      throw new TypeError('KanoGLBAnimationManager requires renderer and models.');
    }

    this.renderer = renderer;
    this.models = models;
    this.mobile = Boolean(mobile);
    this.debug = Boolean(debug);
    this.disposed = false;
    this.loader = new GLTFLoader();
    this.clipPromises = new Map();
    this.mixers = new Map();
    this.lastActiveRoots = new Set();
    this.originalGetInstance = models.getInstance;
    this.getInstanceWrapper = null;

    this.installSkeletonSafeCloning();
  }

  installSkeletonSafeCloning() {
    const manager = this;
    const original = this.originalGetInstance;
    if (typeof original !== 'function') return;

    this.getInstanceWrapper = function (key) {
      if (!CHARACTER_KEYS.has(key)) {
        return original.call(this, key);
      }

      if (this.disposed) return null;
      const template = this.cache?.get(key);
      if (!template) return null;

      let clone;
      try {
        clone = cloneSkeleton(template);
      } catch (error) {
        if (manager.debug) {
          console.warn(`[Kano animation] skeleton-safe clone failed for ${key}; using standard clone`, error);
        }
        return original.call(this, key);
      }

      clone.userData.sharedGeometry = true;
      clone.userData.modelManagerInstance = true;
      clone.userData.modelKey = key;
      clone.userData.modelPath = template.userData.modelPath;
      clone.userData.targetHeight = template.userData.targetHeight;

      // Each animated character needs independent materials but can safely
      // share cached geometry and texture resources.
      clone.traverse((object) => {
        if (!object.isMesh || !object.material) return;
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => material?.clone() || material)
          : object.material.clone();
      });

      return clone;
    };

    this.models.getInstance = this.getInstanceWrapper;
  }

  loadClips(relativePath) {
    if (!relativePath || this.disposed) return Promise.resolve([]);

    if (this.clipPromises.has(relativePath)) {
      return this.clipPromises.get(relativePath);
    }

    const url = safeUrlForModel(relativePath);
    const promise = this.loader.loadAsync(url)
      .then((gltf) => {
        const clips = Array.isArray(gltf.animations) ? [...gltf.animations] : [];
        disposeTemporaryGLTFScene(gltf.scene);

        if (this.debug) {
          console.info(`[Kano animation] ${clips.length} clip(s) in ${relativePath}`);
        }

        return clips;
      })
      .catch((error) => {
        if (this.debug) {
          console.info(`[Kano animation] no clip library for ${relativePath}`, error?.message || error);
        }
        return [];
      });

    this.clipPromises.set(relativePath, promise);
    return promise;
  }

  chooseClip(clips, role) {
    if (!clips?.length) return null;

    const patterns = role === 'walk'
      ? [/walk/i, /run/i, /jog/i, /move/i, /locom/i]
      : [/idle/i, /stand/i, /walk/i, /run/i, /move/i];

    for (const pattern of patterns) {
      const match = clips.find((clip) => pattern.test(clip.name || ''));
      if (match) return match;
    }

    return clips[0] || null;
  }

  collectAnimatedRoots() {
    const roots = new Map();
    const add = (root, role = 'walk') => {
      if (!root?.isObject3D || !root.userData?.modelPath || !isCharacterModel(root)) return;
      roots.set(root, role);
    };

    for (const pedestrian of this.renderer.pedestrians || []) {
      if (pedestrian.usingModel) add(pedestrian.actor, 'walk');
    }

    // Any real character models used by traffic or scene props are also
    // eligible, but vehicle models and procedural rigs are deliberately skipped.
    for (const actor of this.renderer.trafficActors?.values?.() || []) {
      add(actor, 'walk');
    }

    for (const group of this.renderer.lifeSceneGroups?.values?.() || []) {
      group.traverse((object) => {
        if (object.userData?.modelPath && isCharacterModel(object)) add(object, 'idle');
      });
    }

    for (const root of this.renderer.lifeDioramaRoot ? [this.renderer.lifeDioramaRoot] : []) {
      root.traverse((object) => {
        if (object.userData?.modelPath && isCharacterModel(object)) add(object, 'idle');
      });
    }

    return roots;
  }

  attach(root, role) {
    if (this.disposed || this.mixers.has(root) || root.userData.kanoAnimationState) return;

    const path = root.userData.modelPath;
    if (!path) return;

    root.userData.kanoAnimationState = 'loading';

    this.loadClips(path).then((clips) => {
      if (this.disposed || !root) return;

      const clip = this.chooseClip(clips, role);
      if (!clip) {
        root.userData.kanoAnimationState = 'no-clips';
        return;
      }

      try {
        const mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.clampWhenFinished = false;
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();

        this.mixers.set(root, { mixer, action, clip, role });
        root.userData.kanoAnimationState = 'playing';
      } catch (error) {
        root.userData.kanoAnimationState = 'failed';
        if (this.debug) {
          console.warn('[Kano animation] Could not bind GLB clip', error);
        }
      }
    });
  }

  update(deltaSeconds) {
    if (this.disposed) return;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    const activeRoots = this.collectAnimatedRoots();
    this.lastActiveRoots = new Set(activeRoots.keys());

    for (const [root, role] of activeRoots) {
      this.attach(root, role);
    }

    for (const [root, entry] of this.mixers) {
      if (!this.lastActiveRoots.has(root) || !root.parent) {
        entry.action.stop();
        entry.mixer.stopAllAction();
        entry.mixer.uncacheRoot(root);
        this.mixers.delete(root);
        try {
          delete root.userData.kanoAnimationState;
        } catch {
          // Detached roots may already be disposed by the renderer.
        }
        continue;
      }

      // Do not burn animation time on hidden groups during the morning scene.
      let visible = root.visible;
      let parent = root.parent;
      while (visible && parent) {
        visible = parent.visible;
        parent = parent.parent;
      }

      if (visible) entry.mixer.update(dt);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const [root, entry] of this.mixers) {
      entry.action.stop();
      entry.mixer.stopAllAction();
      entry.mixer.uncacheRoot(root);
      try {
        delete root.userData.kanoAnimationState;
      } catch {
        // Root may have been removed during renderer disposal.
      }
    }

    this.mixers.clear();
    this.clipPromises.clear();

    if (this.models.getInstance === this.getInstanceWrapper) {
      this.models.getInstance = this.originalGetInstance;
    }
  }
}
