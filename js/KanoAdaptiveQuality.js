/**
 * KANO LIFE — ADAPTIVE MOBILE QUALITY + WORLD LEVEL OF DETAIL
 *
 * Drop-in replacement for js/KanoAdaptiveQuality.js.
 * Keeps the constructor/update/setLevel/getDiagnostics/dispose API used by
 * js/main.js, while managing resolution and selectively culling distant,
 * decorative world actors when sustained low frame rate is detected.
 *
 * Gameplay-critical pickups, potholes, traffic state, the player keke, and
 * the separate life-scene dioramas are deliberately never culled by this file.
 */
import * as THREE from 'three';
import { getMobileTier, getMobileRatios, getMobileRenderBudget, getRenderSharpness } from './KanoDeviceTier.js';
import { buildAdaptiveQualityPlan, chooseAdaptiveQualityAction, classifyAdaptivePerformance } from './KanoAdaptiveQualityPolicy.js';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { KanoGLBAnimationManager } from './KanoAnimationTrafficUpgrade.js';

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const nowTime = () => globalThis.performance?.now?.() ?? Date.now();

const safeDevicePixelRatio = () => {
  const value = Number(globalThis.window?.devicePixelRatio) || 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
};


// ============================================================
// REAL GLB MARKET CROWD + DIRECTION-SYNCHRONISED GAIT
// ============================================================
// The current market crowd is an InstancedMesh of featureless figures. The
// road-scroll update moves those figures along +Z/-Z, but their gait previously
// had no directional sign and their bodies never turned. This integration
// upgrades a small foreground pool with already-loaded character GLBs. Farther
// silhouettes remain instanced for mobile performance.

const KANO_CROWD_PATCH = Symbol.for('kano-life.real-model-crowd-direction.v1');
const KANO_CROWD_ANIMATION_PATCH = Symbol.for('kano-life.real-model-crowd-animation.v1');
const KANO_CHARACTER_KEYS = [
  'pedestrianWoman',
  'pedestrian',
  'passengerWoman',
  'passengerMan',
  'passenger',
];

function preferredCrowdModelKey(models, slotIndex) {
  const cache = models?.cache;
  if (!cache?.has) return null;
  const preferred = slotIndex % 2 === 0
    ? ['pedestrianWoman', 'passengerWoman', 'passenger', 'pedestrian', 'passengerMan']
    : ['pedestrian', 'passengerMan', 'passenger', 'pedestrianWoman', 'passengerWoman'];
  return preferred.find((key) => cache.has(key)) || null;
}

function disposeCrowdCharacter(root) {
  if (!root) return;
  root.parent?.remove(root);
  const materials = new Set();
  root.traverse?.((object) => {
    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      // ModelManager instances own cloned materials, but share cached GLB
      // geometry and textures. Dispose the clones only.
      material.dispose?.();
    }
  });
}

function installCrowdCharacter(instance, slotIndex, modelKey) {
  let actor = null;
  try {
    actor = instance.renderer?.models?.getInstance?.(modelKey) || null;
  } catch (error) {
    console.debug(`[Kano crowd] Could not clone ${modelKey}; retaining the lightweight crowd figure.`, error);
    return null;
  }
  if (!actor) return null;

  actor.name = `KANO_GLB_MARKET_PEDESTRIAN_${slotIndex}`;
  actor.userData.kanoModelCrowdActor = true;
  actor.userData.kanoCrowdSlot = slotIndex;
  actor.userData.kanoCrowdRole = 'walk';
  actor.traverse?.((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
  });
  instance.crowdRoot?.add(actor);
  return actor;
}

function reconcileModelledCrowd(instance, now = nowTime()) {
  if (!instance || instance.disposed || !instance.renderer?.models?.cache?.has) return;
  if (now - (instance._kanoCrowdLastReconcileAt || 0) < 900) return;
  instance._kanoCrowdLastReconcileAt = now;

  const models = instance.renderer.models;
  // KanoInteractionReliability owns the sole real-person crowd pool. This
  // patch still fixes procedural gait direction but must not clone a second
  // overlapping set of GLB pedestrians.
  const targetCount = 0;
  instance._kanoCrowdModelPool ||= new Map();
  instance._kanoModelledWalkerIndices ||= new Set();
  const pool = instance._kanoCrowdModelPool;

  for (let slot = 0; slot < targetCount; slot += 1) {
    const bestKey = preferredCrowdModelKey(models, slot);
    if (!bestKey) continue; // Keep current placeholders if no character has loaded.

    const current = pool.get(slot);
    if (current?.modelKey === bestKey && current.actor?.parent) continue;

    const actor = installCrowdCharacter(instance, slot, bestKey);
    if (!actor) continue;

    if (current?.actor) disposeCrowdCharacter(current.actor);
    pool.set(slot, { slotIndex: slot, modelKey: bestKey, actor, walkerIndex: null });
  }

  for (const [slot, record] of [...pool.entries()]) {
    if (slot >= targetCount || !record.actor) {
      disposeCrowdCharacter(record.actor);
      pool.delete(slot);
    }
  }

  const walkers = Array.isArray(instance.walkers) ? instance.walkers : [];
  const records = [...pool.values()].sort((a, b) => a.slotIndex - b.slotIndex);
  const assignedIndices = new Set(
    records.map((record) => record.walkerIndex).filter(Number.isInteger),
  );

  // Recycle a modelled foreground actor only after it has moved well into the
  // distance. The replacement is chosen from an unmodelled nearby walker, so
  // the costly GLBs remain concentrated where the driver can see them clearly.
  for (const record of records) {
    const currentWalker = walkers.find((walker) => walker.index === record.walkerIndex);
    if (currentWalker && currentWalker.z > (instance.mobile ? -48 : -58)) continue;

    const replacement = walkers
      .filter((walker) => !assignedIndices.has(walker.index) && walker.z > -31)
      .sort((a, b) => b.z - a.z)[0];

    if (replacement) {
      if (Number.isInteger(record.walkerIndex)) assignedIndices.delete(record.walkerIndex);
      record.walkerIndex = replacement.index;
      assignedIndices.add(replacement.index);
    } else if (!currentWalker) {
      record.walkerIndex = null;
    }
  }

  // Initial assignment: put each real model on a different near-road walker.
  for (const record of records) {
    if (Number.isInteger(record.walkerIndex) && walkers.some((walker) => walker.index === record.walkerIndex)) continue;
    const replacement = walkers
      .filter((walker) => !assignedIndices.has(walker.index))
      .sort((a, b) => b.z - a.z)[0];
    if (!replacement) continue;
    record.walkerIndex = replacement.index;
    assignedIndices.add(replacement.index);
  }

  instance._kanoModelledWalkerIndices = new Set(
    records.map((record) => record.walkerIndex).filter(Number.isInteger),
  );
}

function updateModelledCrowdActors(instance) {
  const pool = instance?._kanoCrowdModelPool;
  if (!pool?.size || !Array.isArray(instance.walkers)) return;
  for (const record of pool.values()) {
    const actor = record.actor;
    const walker = instance.walkers.find((candidate) => candidate.index === record.walkerIndex);
    if (!actor || !walker) {
      if (actor) actor.visible = false;
      continue;
    }
    actor.visible = true;
    const sway = Math.sin(instance.elapsed * 1.1 + walker.phase) * (walker.sway || 0.04);
    actor.position.set(walker.x + sway, 0, walker.z);
    // Character GLBs in this game use -Z as their default forward axis.
    // A walker whose Z coordinate increases therefore faces +Z (yaw = PI).
    actor.rotation.y = walker.direction > 0 ? Math.PI : 0;
    actor.userData.kanoCrowdWalkerIndex = walker.index;
  }
}

function patchedUpdateCrowdMatrices() {
  if (
    !Array.isArray(this.walkers) ||
    !this.walkers.length ||
    this.disposed ||
    !this.crowdTorso || !this.crowdHead || !this.crowdArms || !this.crowdLegs ||
    typeof this.writeMatrix !== 'function'
  ) {
    return;
  }

  // Road actor positions still advance every frame; only the decorative arm/
  // leg matrix uploads are capped to 15 Hz on mobile to reduce main-thread work.
  if (this.mobile) {
    const now = nowTime();
    if (now - (this._kanoCrowdMatricesAt || 0) < 1000 / 15) return;
    this._kanoCrowdMatricesAt = now;
  }

  reconcileModelledCrowd(this);
  updateModelledCrowdActors(this);
  const hidden = this._kanoModelledWalkerIndices || new Set();

  this.walkers.forEach((walker, index) => {
    const direction = Number(walker.direction) < 0 ? -1 : 1;
    const facingYaw = direction > 0 ? Math.PI : 0;
    const phase = this.elapsed * 6.8 * walker.speed + walker.phase;
    // Reverse the gait phase with the travel direction. This prevents the
    // procedural silhouette's feet cycling against its actual path.
    const step = Math.sin(phase) * 0.30 * direction;
    const stride = Math.cos(phase) * 0.22 * direction;
    const bob = Math.abs(step) * 0.035;
    const height = Number(walker.height) || 1;
    const x = walker.x + Math.sin(this.elapsed * 1.1 + walker.phase) * (walker.sway || 0.04);
    const z = walker.z;
    const scale = hidden.has(walker.index) ? 0.0001 : 1;

    this.writeMatrix(this.crowdTorso, index, x, 0.98 * height + bob, z, facingYaw, scale, height * scale, 0.90 * scale);
    this.writeMatrix(this.crowdHead, index, x, 1.58 * height + bob, z, facingYaw, scale, scale, 0.92 * scale);

    for (const side of [-1, 1]) {
      const partIndex = index * 2 + (side > 0 ? 1 : 0);
      const armRot = side * (0.10 + step * 0.45);
      this.writeMatrix(this.crowdArms, partIndex, x + side * 0.22, 1.02 * height + bob, z, facingYaw, scale, scale, scale);
      this.dummy.rotation.set(0, facingYaw, armRot);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.crowdArms.setMatrixAt(partIndex, this.dummy.matrix);

      this.writeMatrix(this.crowdLegs, partIndex, x + side * 0.09, 0.44 * height, z, facingYaw, scale, scale, scale);
      this.dummy.rotation.set(stride * side, facingYaw, 0);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.crowdLegs.setMatrixAt(partIndex, this.dummy.matrix);
    }
  });

  for (const mesh of [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs]) {
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function installRealCrowdPatch() {
  const scenePrototype = KanoSceneUpgrade?.prototype;
  if (scenePrototype && !scenePrototype[KANO_CROWD_PATCH]) {
    const originalBuild = scenePrototype.buildAmbientCrowd;
    const originalDispose = scenePrototype.dispose;
    scenePrototype.buildAmbientCrowd = function (...args) {
      this._kanoCrowdModelPool = new Map();
      this._kanoModelledWalkerIndices = new Set();
      this._kanoCrowdLastReconcileAt = 0;
      return originalBuild?.apply(this, args);
    };
    scenePrototype.updateCrowdMatrices = patchedUpdateCrowdMatrices;
    scenePrototype.dispose = function (...args) {
      for (const record of this._kanoCrowdModelPool?.values?.() || []) {
        disposeCrowdCharacter(record.actor);
      }
      this._kanoCrowdModelPool?.clear?.();
      this._kanoModelledWalkerIndices?.clear?.();
      return originalDispose?.apply(this, args);
    };
    Object.defineProperty(scenePrototype, KANO_CROWD_PATCH, { value: true });
    console.info('[Kano Life] Foreground crowd model upgrade installed; available GLBs will replace selected procedural figures.');
  }

  const animationPrototype = KanoGLBAnimationManager?.prototype;
  if (animationPrototype && !animationPrototype[KANO_CROWD_ANIMATION_PATCH]) {
    const originalCollect = animationPrototype.collectAnimatedRoots;
    animationPrototype.collectAnimatedRoots = function (...args) {
      const roots = originalCollect?.apply(this, args) || new Map();
      const crowdRoot = this.renderer?.scene?.getObjectByName?.('KANO_ANIMATED_MARKET_CROWD');
      crowdRoot?.traverse?.((object) => {
        if (
          object?.userData?.kanoModelCrowdActor &&
          object.userData.modelPath &&
          object.userData.modelKey &&
          KANO_CHARACTER_KEYS.includes(object.userData.modelKey)
        ) {
          roots.set(object, 'walk');
        }
      });
      return roots;
    };
    Object.defineProperty(animationPrototype, KANO_CROWD_ANIMATION_PATCH, { value: true });
  }
}

installRealCrowdPatch();

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
    this.mobileTier = this.mobile ? getMobileTier() : 'desktop';
    const mobileRatios = this.mobile ? getMobileRatios(this.mobileTier) : null;
    const mobileRenderBudget = this.mobile ? getMobileRenderBudget(this.mobileTier) : null;

    // Keep the normal phone floor at 1:1 CSS pixels. On a weak mobile GPU,
    // permit a separate emergency ladder below 1:1 only when the player has
    // left the display setting at Standard. Explicit Sharp/Max choices remain
    // respected, while sustained critical FPS can still shed distant scene LOD.
    this.maximumRatio = this.mobile ? Math.min(mobileRatios.max, mobileRenderBudget.max) : 1.72;
    this.minimumRatio = this.mobile ? mobileRenderBudget.min : 0.84;
    this.startupRatio = this.mobile ? mobileRenderBudget.start : 1.30;
    this.emergencyResolutionAllowed = Boolean(
      this.mobile &&
      this.mobileTier === 'low' &&
      getRenderSharpness() === 'standard'
    );
    this.emergencyResolutionFloor = this.emergencyResolutionAllowed ? 0.82 : null;
    this.maxSupportedRatio = Math.max(
      this.minimumRatio,
      Math.min(this.deviceRatio, this.maximumRatio),
    );
    this.baseRatio = this.maxSupportedRatio;
    this.qualityPlan = buildAdaptiveQualityPlan({
      baseRatio: this.baseRatio,
      minimumRatio: this.minimumRatio,
      startupRatio: this.startupRatio,
      mobile: this.mobile,
      emergencyFloor: this.emergencyResolutionFloor,
    });
    this.minRatio = Math.min(this.baseRatio, this.qualityPlan.minimumRatio);
    this.levels = this.qualityPlan.levels;
    this.lodDistances = this.qualityPlan.lodDistances;

    const targetStart = Math.min(this.baseRatio, this.startupRatio);
    let startIndex = this.levels.findIndex(
      (ratio) => ratio <= targetStart + 0.01,
    );
    if (startIndex < 0) startIndex = this.levels.length - 1;

    this.levelIndex = startIndex;
    this.currentRatio = this.levels[this.levelIndex] ?? targetStart;
    this.currentLodDistance = this.distanceForLevel(this.levelIndex);

    this.windowStart = nowTime();
    this.windowFrames = 0;
    this.lastFrameSampleAt = null;
    this.frameTimeEma = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.lastChangeAt = 0;
    this.lastFps = 60;
    this.lastPerformanceClass = 'stable';
    this.lastGameState = null;
    this.lastTierEventAt = 0;
    this.lastLodUpdateAt = 0;

    this.worldPosition = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.visibilityRecords = new Map();
    this.lodVisibilityStates = new Map();
    this._lodActorScratch = [];

    this.applyRatio(this.currentRatio);
    this.applySceneLod(true);
  }

  buildLevels() {
    return [...(this.qualityPlan?.levels || [this.baseRatio])];
  }

  distanceForLevel(index) {
    if (index <= 0) return Infinity;
    const safeIndex = Math.min(index, this.lodDistances.length - 1);
    return this.lodDistances[safeIndex];
  }

  applyRatio(ratio) {
    if (this.disposed || !this.webgl) return false;
    const next = clamp(Number(ratio) || 1, this.minRatio, this.baseRatio);
    try {
      const actualRatio = Number(this.webgl.getPixelRatio?.());
      if (Number.isFinite(actualRatio) && Math.abs(next - actualRatio) < 0.008) {
        this.currentRatio = next;
        return true;
      }
      this.webgl.setPixelRatio(next);
      this.renderer3d?.resize?.();
      this.currentRatio = next;
      return true;
    } catch (error) {
      console.warn(
        '[Kano Life] adaptive render resolution change failed',
        error,
      );
      return false;
    }
  }

  getWorldPosition(actor) {
    if (!actor) return null;
    try {
      if (typeof actor.getWorldPosition === 'function') {
        actor.getWorldPosition(this.worldPosition);
        return this.worldPosition;
      }
      return actor.position || null;
    } catch {
      return actor.position || null;
    }
  }

  rememberVisibility(actor) {
    if (!actor || this.visibilityRecords.has(actor)) return;
    this.visibilityRecords.set(actor, actor.visible !== false);
  }

  setActorLodVisibility(actor, maxDistance, extraBuffer = 0) {
    if (!actor || actor.isInstancedMesh) return;
    this.rememberVisibility(actor);
    const originalVisible = this.visibilityRecords.get(actor);
    if (!originalVisible) {
      actor.visible = false;
      this.lodVisibilityStates.set(actor, false);
      return;
    }

    if (!Number.isFinite(maxDistance)) {
      actor.visible = true;
      this.lodVisibilityStates.set(actor, true);
      return;
    }

    const position = this.getWorldPosition(actor);
    if (!position || !Number.isFinite(position.z)) return;

    const camera = this.renderer3d?.camera;
    if (camera?.getWorldPosition) {
      camera.getWorldPosition(this.cameraPosition);
    } else {
      this.cameraPosition.copy(camera?.position || new THREE.Vector3(0, 0, 0));
    }

    const dx = Number(position.x || 0) - this.cameraPosition.x;
    const dz = Number(position.z || 0) - this.cameraPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const wasVisible = this.lodVisibilityStates.has(actor)
      ? this.lodVisibilityStates.get(actor)
      : actor.visible !== false;
    const hysteresis = this.mobile ? 7 : 4;
    const threshold = maxDistance + extraBuffer + (wasVisible ? hysteresis : -hysteresis);
    const nextVisible = distance <= threshold;
    actor.visible = nextVisible;
    this.lodVisibilityStates.set(actor, nextVisible);
  }

  restoreRecordedVisibility() {
    for (const [actor, visible] of this.visibilityRecords) {
      if (!actor) continue;
      try {
        actor.visible = visible;
      } catch {
        // Scene objects can be disposed during a renderer transition.
      }
    }
    this.visibilityRecords.clear();
    this.lodVisibilityStates.clear();
  }

  collectDecorativeActors() {
    const renderer = this.renderer3d;
    const actors = new Set();

    for (const slot of renderer?.buildingSlots || []) {
      if (slot?.actor) actors.add(slot.actor);
    }
    for (const slot of renderer?.roadProps || []) {
      if (slot?.actor) actors.add(slot.actor);
    }
    for (const actor of renderer?.flyovers || []) {
      if (actor) actors.add(actor);
    }

    // Roadside pedestrians and waiting passenger GLBs are visual actors. Their
    // simulation records, pickup-zone parents and collision/gameplay state are
    // deliberately left active; only the character model's draw visibility is
    // managed by this controller.
    for (const pedestrian of renderer?.pedestrians || []) {
      const actor = pedestrian?.actor;
      if (!actor) continue;
      if (
        pedestrian.usingModel ||
        pedestrian.kanoAmbientCrowd ||
        actor.userData?.kanoAmbientCrowd ||
        actor.userData?.modelPath
      ) {
        actors.add(actor);
      }
    }
    for (const zone of renderer?.zoneActors?.values?.() || []) {
      const waitingActors = zone?.userData?.waitingActors;
      if (!Array.isArray(waitingActors)) continue;
      for (const actor of waitingActors) {
        if (
          actor?.isObject3D &&
          (actor.userData?.modelPath || actor.userData?.characterType)
        ) {
          actors.add(actor);
        }
      }
    }

    return actors;
  }

  applySceneLod(force = false) {
    if (this.disposed || !this.renderer3d) return;

    const renderer = this.renderer3d;
    const timestamp = nowTime();
    // A short cadence is enough because the road actors already have their own
    // update loop. Avoid adding per-frame scene traversal work on mobile.
    if (!force && timestamp - this.lastLodUpdateAt < 420) return;
    this.lastLodUpdateAt = timestamp;

    const isRoad = !renderer.lifeScene || renderer.lifeScene === 'road';
    if (!isRoad || renderer.world?.visible === false) {
      this.restoreRecordedVisibility();
      return;
    }

    const actors = this.collectDecorativeActors();
    // Dynamic passenger actors can be replaced during zone synchronisation.
    // Release stale visibility records so the LOD map cannot retain removed GLBs.
    for (const [actor, visible] of this.visibilityRecords) {
      if (actors.has(actor)) continue;
      try { actor.visible = visible; } catch { /* actor may already be disposed */ }
      this.visibilityRecords.delete(actor);
      this.lodVisibilityStates.delete(actor);
    }

    const maxDistance = this.currentLodDistance;
    const deepMobileLod = this.mobile && this.levelIndex >= Math.max(0, this.levels.length - 4);
    const pedestrianFloor = deepMobileLod ? 42 : 88;
    const pedestrianDistance = Number.isFinite(maxDistance)
      ? Math.max(pedestrianFloor, maxDistance - (this.mobile ? 18 : 4))
      : Infinity;

    for (const actor of actors) {
      const isCharacter = Boolean(
        actor.userData?.characterType ||
        actor.userData?.kanoAmbientCrowd ||
        actor.userData?.modelPath && /pedestrian|passenger|character/i.test(
          `${actor.userData?.characterType || ''} ${actor.userData?.modelPath || ''}`,
        ),
      );
      this.setActorLodVisibility(
        actor,
        isCharacter ? pedestrianDistance : maxDistance,
        isCharacter ? 0 : 8,
      );
    }
  }

  update(now = nowTime(), renderMode = '3D', gameState = 'PLAY') {
    if (
      this.disposed ||
      !this.enabled ||
      renderMode !== '3D' ||
      this.renderer3d?.disposed ||
      !this.webgl
    ) {
      return;
    }

    if (globalThis.document?.hidden) {
      this.windowStart = now;
      this.windowFrames = 0;
      this.lastFrameSampleAt = null;
      this.slowWindows = 0;
      this.fastWindows = 0;
      return;
    }

    // Do not mix menu, intro, event or life-scene frames into a driving sample.
    if (this.lastGameState !== gameState) {
      this.lastGameState = gameState;
      this.windowStart = now;
      this.windowFrames = 0;
      this.slowWindows = 0;
      this.fastWindows = 0;
    }

    if (this.lastFrameSampleAt !== null) {
      const frameDelta = now - this.lastFrameSampleAt;
      // Ignore tab-resume and long-stall samples. They are not representative
      // of renderer capacity and otherwise force an unnecessary quality drop.
      if (frameDelta > 0 && frameDelta <= 250) {
        this.frameTimeEma = this.frameTimeEma > 0
          ? this.frameTimeEma * 0.82 + frameDelta * 0.18
          : frameDelta;
      }
    }
    this.lastFrameSampleAt = now;

    this.applySceneLod();
    this.windowFrames += 1;
    if (now - this.windowStart < 1000) return;

    const duration = Math.max(1, now - this.windowStart);
    this.lastFps = (this.windowFrames * 1000) / duration;
    this.windowFrames = 0;
    this.windowStart = now;
    this.lastPerformanceClass = classifyAdaptivePerformance(this.lastFps, { mobile: this.mobile });

    if (gameState !== 'PLAY') {
      this.slowWindows = 0;
      this.fastWindows = 0;
      return;
    }

    if (this.lastPerformanceClass === 'critical' || this.lastPerformanceClass === 'slow') {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (this.lastPerformanceClass === 'headroom') {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = Math.max(0, this.slowWindows - 1);
      this.fastWindows = 0;
    }

    const action = chooseAdaptiveQualityAction({
      fps: this.lastFps,
      slowWindows: this.slowWindows,
      fastWindows: this.fastWindows,
      sinceChangeMs: now - this.lastChangeAt,
      levelIndex: this.levelIndex,
      levelCount: this.levels.length,
      mobile: this.mobile,
    });

    if (action === 'reduce') {
      this.setLevel(this.levelIndex + 1, now, 'performance');
    } else if (action === 'restore') {
      this.setLevel(this.levelIndex - 1, now, 'headroom');
    }
  }

  setLevel(index, now = nowTime(), reason = 'manual') {
    const nextIndex = clamp(
      Math.floor(Number(index) || 0),
      0,
      this.levels.length - 1,
    );
    if (nextIndex === this.levelIndex) return false;
    if (!this.applyRatio(this.levels[nextIndex])) return false;

    this.levelIndex = nextIndex;
    this.currentLodDistance = this.distanceForLevel(nextIndex);
    this.lastChangeAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.applySceneLod(true);

    if (now - this.lastTierEventAt > 1000) {
      this.lastTierEventAt = now;
      try {
        globalThis.window?.dispatchEvent?.(
          new CustomEvent('kano:adaptive-quality', {
            detail: {
              ratio: this.currentRatio,
              level: this.levelIndex + 1,
              levels: this.levels.length,
              fps: Math.round(this.lastFps),
              frameTimeMs: Number(this.frameTimeEma.toFixed(2)),
              performanceClass: this.lastPerformanceClass,
              emergencyResolution: this.emergencyResolutionAllowed,
              reason,
              lodDistance: Number.isFinite(this.currentLodDistance)
                ? this.currentLodDistance
                : 'full',
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
      frameTimeMs: Number(this.frameTimeEma.toFixed(2)),
      performanceClass: this.lastPerformanceClass,
      ratio: Number(this.currentRatio.toFixed(2)),
      level: this.levelIndex + 1,
      levels: this.levels.length,
      minimumRatio: Number(this.minRatio.toFixed(2)),
      maximumRatio: Number(this.baseRatio.toFixed(2)),
      devicePixelRatio: Number(this.deviceRatio.toFixed(2)),
      qualityProfile: this.currentRatio < 1 ? 'emergency-resolution' : 'standard-resolution',
      emergencyResolution: this.emergencyResolutionAllowed,
      lodDistance: Number.isFinite(this.currentLodDistance)
        ? this.currentLodDistance
        : 'full',
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.restoreRecordedVisibility();
    this.visibilityRecords.clear();
    this.lodVisibilityStates.clear();
    this._lodActorScratch.length = 0;

    try {
      if (this.webgl && !this.renderer3d?.disposed) {
        this.webgl.setPixelRatio(this.originalRatio);
        this.renderer3d?.resize?.();
      }
    } catch {
      // Renderer may already have been destroyed after WebGL context loss.
    }

    this.renderer3d = null;
    this.webgl = null;
  }
}
