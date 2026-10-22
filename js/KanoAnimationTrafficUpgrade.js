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

const PEDESTRIAN_MODEL_KEYS = [
  'pedestrianWoman',
  'pedestrian',
  'passengerWoman',
  'passengerMan',
  'passenger',
];

// Role-appropriate fallback order. The renderer's pedestrian index selects a
// preferred archetype, and this list supplies an already-loaded alternative
// only when that preferred model is unavailable.
const CHARACTER_FALLBACKS = {
  pedestrianWoman: [
    'pedestrianWoman', 'passengerWoman', 'pedestrian', 'passenger', 'passengerMan',
  ],
  pedestrian: [
    'pedestrian', 'passengerMan', 'passenger', 'pedestrianWoman', 'passengerWoman',
  ],
  passengerWoman: [
    'passengerWoman', 'pedestrianWoman', 'passenger', 'pedestrian', 'passengerMan',
  ],
  passengerMan: [
    'passengerMan', 'pedestrian', 'passenger', 'passengerWoman', 'pedestrianWoman',
  ],
  passenger: [
    'passenger', 'passengerMan', 'passengerWoman', 'pedestrian', 'pedestrianWoman',
  ],
};

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

/** Dispose a detached placeholder or model instance without destroying cached
 * GLB geometry/textures shared by other pedestrians or passengers. */
function disposeRemovedCharacter(root) {
  if (!root) return;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  const visit = (object, inheritedShared = false) => {
    const shared = inheritedShared ||
      object.userData?.sharedGeometry === true ||
      object.userData?.modelManagerInstance === true;

    if (object.geometry && !shared && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }

    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);

      if (!shared) {
        for (const value of Object.values(material)) {
          if (value?.isTexture && !textures.has(value)) {
            textures.add(value);
            value.dispose?.();
          }
        }
      }

      // Skeleton-safe clones receive independent materials, so their materials
      // can be disposed even when their geometry and textures are shared.
      material.dispose?.();
    }

    for (const child of object.children || []) visit(child, shared);
  };

  visit(root);
}

/**
 * Runtime add-on for safer animated character clones and lane-aware traffic.
 * Game remains authoritative for traffic movement, collision, fares, fuel,
 * vehicle condition and score. This module only directs traffic archetypes,
 * upgrades character fallback selection and advances available GLB clips.
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

    // Game creates its first traffic pool before main.js constructs this
    // director, so configure that pool explicitly.
    for (const vehicle of game.s.traffic || []) {
      this.configureVehicle(vehicle);
    }
  }

  configureVehicle(vehicle) {
    if (!vehicle || vehicle.aiArchetype) return vehicle;

    const roll = Math.random();
    let type;
    let archetype;

    // Kano street traffic: 40% keke, 30% motorcycles, 30% other vehicles.
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
    vehicle.aiBlockingWidth = archetype === 'danfo'
      ? 0.58
      : archetype === 'keke'
        ? 0.25
        : 0.32;

    // Lane 0 is opposing flow in two-way mode. Keep oncoming traffic there.
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

    for (const vehicle of this.game.s.traffic || []) {
      this.configureVehicle(vehicle);
      vehicle.aiClock = (vehicle.aiClock || 0) + dt;
      vehicle.aiLaneChangeCooldown = Math.max(
        0,
        (vehicle.aiLaneChangeCooldown || 0) - dt,
      );

      const archetype = vehicle.aiArchetype;
      const allowedLanes = this.getAllowedLanes(vehicle);
      const ahead = this.trafficAhead(vehicle);
      let target = Number.isFinite(vehicle.aiTargetLane)
        ? vehicle.aiTargetLane
        : vehicle.aiBaseLane;

      if (archetype === 'okada') {
        if (
          ahead &&
          vehicle.aiLaneChangeCooldown <= 0 &&
          vehicle.direction !== -1
        ) {
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

        target = clamp(
          target + weave,
          Math.min(...allowedLanes),
          Math.max(...allowedLanes),
        );
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.25);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.8 + vehicle.aiPhase) * 2.8;
      } else if (archetype === 'danfo') {
        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 2.2);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.24 + vehicle.aiPhase) * 0.8;
      } else if (archetype === 'keke') {
        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.6);
        vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.38 + vehicle.aiPhase) * 1.5;
      } else {
        if (ahead && ahead.gap < 0.09) {
          vehicle.speedKmh = Math.min(
            vehicle.aiBaseSpeed,
            ahead.vehicle.speedKmh || vehicle.aiBaseSpeed,
          );
        } else {
          vehicle.speedKmh = vehicle.aiBaseSpeed + Math.sin(vehicle.aiClock * 0.31 + vehicle.aiPhase) * 1.7;
        }

        target = vehicle.aiBaseLane;
        vehicle.lane += (target - vehicle.lane) * Math.min(1, dt * 1.8);
      }

      vehicle.speedKmh = clamp(Number(vehicle.speedKmh) || 0, 8, 52);
      vehicle.lane = clamp(
        Number(vehicle.lane) || 0,
        Math.min(...allowedLanes),
        Math.max(...allowedLanes),
      );
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
 * Animates GLB character clips, uses skeleton-safe model instances, and fixes
 * the renderer's one-choice-only pedestrian upgrade so an available GLB is
 * used when a preferred character asset is missing. Existing game physics and
 * rendering remain authoritative.
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
    this.elapsed = 0;
    this.loader = new GLTFLoader();
    this.clipPromises = new Map();
    this.mixers = new Map();
    this.lastActiveRoots = new Set();
    this.originalGetInstance = models.getInstance;
    this.getInstanceWrapper = null;
    this.originalUpgradePedestrians = null;
    this.upgradePedestriansWrapper = null;
    this.originalSyncZones = null;
    this.syncZonesWrapper = null;

    this.installSkeletonSafeCloning();
    this.installPedestrianModelFallbacks();
    this.installRoadsidePassengerModelFallbacks();
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
          console.warn(
            `[Kano animation] skeleton-safe clone failed for ${key}; using standard clone`,
            error,
          );
        }
        return original.call(this, key);
      }

      clone.userData.sharedGeometry = true;
      clone.userData.modelManagerInstance = true;
      clone.userData.modelKey = key;
      clone.userData.modelPath = template.userData.modelPath;
      clone.userData.targetHeight = template.userData.targetHeight;

      // Independent materials, shared cached geometry/textures.
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

  installPedestrianModelFallbacks() {
    const renderer = this.renderer;
    if (typeof renderer.upgradePedestrians !== 'function') return;

    this.originalUpgradePedestrians = renderer.upgradePedestrians;
    const manager = this;

    this.upgradePedestriansWrapper = function (...args) {
      const modelCache = manager.models?.cache;

      for (const pedestrian of this.pedestrians || []) {
        if (!pedestrian || pedestrian.usingModel) continue;

        const initialIndex = Number.isInteger(pedestrian.preferredModelIndex)
          ? pedestrian.preferredModelIndex
          : Number.isInteger(pedestrian.index)
            ? pedestrian.index % PEDESTRIAN_MODEL_KEYS.length
            : 0;

        pedestrian.preferredModelIndex = initialIndex;

        const preferredKey = PEDESTRIAN_MODEL_KEYS[initialIndex];
        const orderedKeys = CHARACTER_FALLBACKS[preferredKey] || PEDESTRIAN_MODEL_KEYS;
        const availableKey = orderedKeys.find((key) => modelCache?.has(key));

        if (availableKey) {
          // Renderer3D.upgradePedestrians() uses this index to request the
          // selected key. Store the original preference separately so it is
          // not lost while asynchronous asset batches are still loading.
          pedestrian.index = PEDESTRIAN_MODEL_KEYS.indexOf(availableKey);
        }
      }

      return manager.originalUpgradePedestrians.apply(this, args);
    };

    renderer.upgradePedestrians = this.upgradePedestriansWrapper;
  }

  /**
   * Renderer3D.syncZones currently tries only the preferred passenger model
   * and then the generic `passenger` key. If those are unavailable, an already
   * loaded `pedestrianWoman`, `pedestrian`, or `passengerMan` model is ignored
   * and the procedural placeholder stays visible. This hook retries on every
   * sync so late-loading GLBs replace the placeholder without editing the
   * large renderer source file.
   */
  installRoadsidePassengerModelFallbacks() {
    const renderer = this.renderer;
    if (typeof renderer.syncZones !== 'function') return;

    this.originalSyncZones = renderer.syncZones;
    const manager = this;

    this.syncZonesWrapper = function (...args) {
      const result = manager.originalSyncZones.apply(this, args);
      manager.upgradeRoadsidePassengerModels();
      return result;
    };

    renderer.syncZones = this.syncZonesWrapper;
  }

  upgradeRoadsidePassengerModels() {
    if (this.disposed) return;

    const modelCache = this.models?.cache;
    if (!modelCache?.has) return;

    for (const actor of this.renderer.zoneActors?.values?.() || []) {
      if (!actor?.isObject3D || actor.userData?.zoneType !== 'pickup') continue;

      const waitingActors = actor.userData?.waitingActors;
      const oldPerson = waitingActors?.[0];
      if (!oldPerson?.isObject3D) continue;

      const preferredKey = actor.userData.waitingModelKey || 'passenger';
      const orderedKeys = CHARACTER_FALLBACKS[preferredKey] ||
        CHARACTER_FALLBACKS.passenger;
      const availableKey = orderedKeys.find((key) => modelCache.has(key));
      if (!availableKey) continue;

      const currentKey = oldPerson.userData?.modelKey ||
        actor.userData.waitingActiveModelKey || null;

      // Keep the best available role-appropriate model. This also lets a
      // preferred female/male GLB replace a generic model that loaded first.
      if (currentKey === availableKey) {
        actor.userData.waitingUsingModel = true;
        actor.userData.waitingActiveModelKey = availableKey;
        continue;
      }

      let person = null;
      try {
        person = this.models.getInstance(availableKey);
      } catch (error) {
        if (this.debug) {
          console.warn(`[Kano characters] Could not clone ${availableKey}`, error);
        }
      }
      if (!person) continue;

      // Preserve the exact local transform set by Renderer3D.syncZones so
      // alignment with the roadside marker remains unchanged.
      person.position.copy(oldPerson.position);
      person.rotation.copy(oldPerson.rotation);
      person.scale.copy(oldPerson.scale);
      person.userData.characterType = availableKey;

      actor.remove(oldPerson);
      disposeRemovedCharacter(oldPerson);
      actor.add(person);

      actor.userData.waitingActors = [person];
      actor.userData.waitingUsingModel = true;
      actor.userData.waitingActiveModelKey = availableKey;

      if (this.debug) {
        console.info(`[Kano characters] roadside passenger model active: ${availableKey}`);
      }
    }
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
          console.info(
            `[Kano animation] no clip library for ${relativePath}`,
            error?.message || error,
          );
        }
        return [];
      });

    this.clipPromises.set(relativePath, promise);
    return promise;
  }

  chooseClip(clips, role) {
    if (!Array.isArray(clips) || clips.length === 0) return null;

    if (role === 'walk') {
      const movementPatterns = [
        /walk/i,
        /run/i,
        /jog/i,
        /locomotion/i,
        /move/i,
      ];

      for (const pattern of movementPatterns) {
        const match = clips.find((clip) => pattern.test(clip.name || ''));
        if (match) return match;
      }

      // Traffic actors may use the first available movement clip when the
      // source asset has unnamed animation tracks.
      return clips[0] || null;
    }

    // Ambient roadside pedestrians and waiting passengers are carried
    // toward the camera by the scrolling-world illusion. Playing a walk
    // cycle on them makes their feet cycle against that movement, creating
    // the appearance of walking backwards. Only use a genuine idle/wait clip
    // for these stationary scene actors. The caller applies a restrained
    // idle sway when the model has no matching clip.
    const idlePatterns = [
      /idle/i,
      /stand/i,
      /wait/i,
      /breath/i,
      /look/i,
      /shift/i,
      /sit/i,
      /talk/i,
    ];

    for (const pattern of idlePatterns) {
      const match = clips.find((clip) => pattern.test(clip.name || ''));
      if (match) return match;
    }

    return null;
  }

  collectAnimatedRoots() {
    const roots = new Map();
    const add = (root, role = 'walk') => {
      if (!root?.isObject3D || !root.userData?.modelPath || !isCharacterModel(root)) return;
      roots.set(root, role);
    };

    for (const pedestrian of this.renderer.pedestrians || []) {
      // These are roadside set-dressing actors moved by renderer world-scroll,
      // not actors with their own world-space locomotion. Use idle clips so
      // walking root motion cannot make them appear to moonwalk backwards.
      if (pedestrian.usingModel) add(pedestrian.actor, 'idle');
    }

    // Character models used by traffic actors.
    for (const actor of this.renderer.trafficActors?.values?.() || []) {
      add(actor, 'walk');
    }

    // Roadside passenger models are children of zone actors. Include them so
    // idle clips can play while the passenger waits for the keke.
    for (const actor of this.renderer.zoneActors?.values?.() || []) {
      if (!actor?.isObject3D) continue;
      actor.traverse((object) => add(object, 'idle'));
    }

    // The bedroom, breakfast, walk and school dioramas are hidden during the
    // road-driving scene. Do not traverse or bind their GLB rigs every frame.
    // Only discover rigs in the currently active life scene; road traffic and
    // roadside passengers above remain unaffected.
    const activeLifeScene = this.renderer.lifeScene;
    if (activeLifeScene && activeLifeScene !== 'road' && activeLifeScene !== 'garage') {
      const activeGroup = this.renderer.lifeSceneGroups?.get?.(activeLifeScene);
      activeGroup?.traverse((object) => {
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
        root.userData.kanoFallbackAnimation = {
          baseY: root.position.y,
          baseZ: root.rotation.z,
          phase: Math.random() * Math.PI * 2,
        };
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
    this.elapsed += dt;

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
          // Detached roots may already be disposed.
        }
        continue;
      }

      let visible = root.visible;
      let parent = root.parent;
      while (visible && parent) {
        visible = parent.visible;
        parent = parent.parent;
      }

      if (visible) entry.mixer.update(dt);
    }

    // Subtle idle motion for valid GLB characters whose source asset has no
    // animation clips. This is intentionally restrained and never substitutes
    // more geometry for a failed/missing model.
    for (const root of activeRoots.keys()) {
      if (
        root.userData.kanoAnimationState !== 'no-clips' ||
        !root.userData.kanoFallbackAnimation
      ) {
        continue;
      }

      let visible = root.visible;
      let parent = root.parent;
      while (visible && parent) {
        visible = parent.visible;
        parent = parent.parent;
      }
      if (!visible) continue;

      const fallback = root.userData.kanoFallbackAnimation;
      const phase = this.elapsed * 3.2 + fallback.phase;
      root.position.y = fallback.baseY + Math.abs(Math.sin(phase)) * 0.012;
      root.rotation.z = fallback.baseZ + Math.sin(phase * 0.5) * 0.012;
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
        delete root.userData.kanoFallbackAnimation;
      } catch {
        // Root may have been removed during renderer disposal.
      }
    }

    this.mixers.clear();
    this.clipPromises.clear();

    if (this.models.getInstance === this.getInstanceWrapper) {
      this.models.getInstance = this.originalGetInstance;
    }

    if (
      this.upgradePedestriansWrapper &&
      this.renderer.upgradePedestrians === this.upgradePedestriansWrapper
    ) {
      this.renderer.upgradePedestrians = this.originalUpgradePedestrians;
    }

    if (
      this.syncZonesWrapper &&
      this.renderer.syncZones === this.syncZonesWrapper
    ) {
      this.renderer.syncZones = this.originalSyncZones;
    }
  }
}
