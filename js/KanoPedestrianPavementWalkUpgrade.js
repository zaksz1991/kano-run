/**
 * KANO LIFE — ROADSIDE PEDESTRIAN PAVEMENT LOCOMOTION
 *
 * Additive renderer hook. Keeps existing GLB assets and renderer/game files intact.
 * Procedural roadside walkers gain independent pavement travel, a light upper-body
 * gait, and one shared InstancedMesh for near-view leg motion on phones.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import {
  KANO_PEDESTRIAN_WALK_LIMITS,
  advancePavementWalkerZ,
  clampWalkDeltaSeconds,
  getPavementGait,
  getPavementWalkDirection,
  getPavementWalkSpeed,
  selectPavementLegWalkers,
} from './KanoPedestrianPavementWalkRules.mjs';

const PATCH_KEY = Symbol.for('kano.life.pedestrianPavementWalk.v1');
const LEG_BATCH_KEY = '__kanoPavementLegBatch';
const activeRenderers = new Set();
const report = {
  version: 1,
  installed: false,
  updateCount: 0,
  rendererCount: 0,
  errors: [],
};

function noteError(renderer, stage, error) {
  const message = `${stage}: ${String(error?.message || error || 'unknown error')}`;
  report.errors.push(message);
  if (report.errors.length > 12) report.errors.splice(0, report.errors.length - 12);
  if (renderer && !renderer.__kanoPedestrianWalkWarningShown) {
    renderer.__kanoPedestrianWalkWarningShown = true;
    console.warn('[Kano Life] Pedestrian pavement motion skipped safely.', error);
  }
}

function getLegBudget(renderer) {
  if (!renderer.mobile) return KANO_PEDESTRIAN_WALK_LIMITS.legInstanceBudget.desktop;
  return KANO_PEDESTRIAN_WALK_LIMITS.legInstanceBudget[renderer.mobileTier] || 3;
}

function ensureLegBatch(renderer) {
  if (renderer[LEG_BATCH_KEY]?.mesh?.parent === renderer.world) return renderer[LEG_BATCH_KEY];
  if (!renderer.world?.isObject3D || !Array.isArray(renderer.pedestrians)) return null;

  const capacity = Math.max(2, renderer.pedestrians.length * 2);
  const geometry = new THREE.CylinderGeometry(0.052, 0.066, 0.40, 5, 1, false);
  const material = new THREE.MeshLambertMaterial({
    color: 0x303744,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'KANO_INSTANCED_SIDEWALK_WALKER_LEGS';
  mesh.userData.kanoSidewalkWalkerLegs = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < capacity; index += 1) mesh.setMatrixAt(index, zero);
  mesh.instanceMatrix.needsUpdate = true;
  renderer.world.add(mesh);

  const batch = {
    mesh,
    capacity,
    activeWalkers: 0,
    activeLegInstances: 0,
    offset: new THREE.Matrix4(),
    rotation: new THREE.Matrix4(),
    center: new THREE.Matrix4(),
    scratch: new THREE.Matrix4(),
    zero,
  };
  renderer[LEG_BATCH_KEY] = batch;
  return batch;
}

function initializeWalker(renderer, pedestrian, actor) {
  if (!pedestrian.__kanoPavementWalk) {
    const index = Number.isFinite(Number(pedestrian.index)) ? Number(pedestrian.index) : 0;
    pedestrian.__kanoPavementWalk = {
      direction: getPavementWalkDirection(index),
      speed: getPavementWalkSpeed(index),
      phaseOffset: Number(pedestrian.phase) || index * 0.73,
      actor: null,
      baseY: 0,
      baseRotationZ: 0,
    };
  }
  const motion = pedestrian.__kanoPavementWalk;
  if (motion.actor !== actor) {
    motion.actor = actor;
    motion.baseY = Number(actor.position.y) || 0;
    motion.baseRotationZ = Number(actor.rotation?.z) || 0;
    // Existing models remain the actual models. Align their root with their
    // assigned walking direction; the procedural fallback gait is kept separate.
    if (actor.rotation) actor.rotation.y = motion.direction > 0 ? Math.PI : 0;
    actor.userData.kanoPavementWalker = true;
  }
  return motion;
}

function advanceWalkerRecords(renderer, state, deltaSeconds) {
  if (
    !renderer?.ready
    || renderer.disposed
    || renderer.lifeScene !== 'road'
    || !renderer.world?.isObject3D
    || !Array.isArray(renderer.pedestrians)
    || state?.paused === true
  ) return;

  const dt = clampWalkDeltaSeconds(deltaSeconds);
  if (dt <= 0) return;
  renderer.__kanoPavementWalkTime = (Number(renderer.__kanoPavementWalkTime) || 0) + dt;
  renderer.__kanoPavementWalkLastDelta = dt;
  let moved = 0;

  for (const pedestrian of renderer.pedestrians) {
    const actor = pedestrian?.actor;
    if (!actor?.position || !actor.rotation) continue;
    const motion = initializeWalker(renderer, pedestrian, actor);
    actor.position.z = advancePavementWalkerZ(
      actor.position.z,
      motion.direction,
      motion.speed,
      dt,
    );

    const gait = getPavementGait(renderer.__kanoPavementWalkTime, motion.phaseOffset);
    actor.position.y = motion.baseY + gait.bob;
    actor.rotation.z = motion.baseRotationZ + gait.sway;

    // The renderer already swings procedural arms around Z. Adding a small X
    // swing gives the arms a forward/backward walk cycle without replacing them.
    if (!pedestrian.usingModel && Array.isArray(pedestrian.arms)) {
      if (pedestrian.arms[0]?.rotation) pedestrian.arms[0].rotation.x = gait.leftArm;
      if (pedestrian.arms[1]?.rotation) pedestrian.arms[1].rotation.x = gait.rightArm;
    }
    moved += 1;
  }
  renderer.__kanoPavementWalkMoved = moved;
  report.updateCount += 1;
  activeRenderers.add(renderer);
  report.rendererCount = activeRenderers.size;
  ensureLegBatch(renderer);
}

function syncLegInstances(renderer) {
  const batch = renderer?.[LEG_BATCH_KEY];
  if (!batch?.mesh || batch.mesh.parent !== renderer.world || renderer.lifeScene !== 'road') return;
  const cameraZ = Number(renderer.camera?.position?.z) || 0;
  const active = selectPavementLegWalkers(
    renderer.pedestrians,
    cameraZ,
    getLegBudget(renderer),
    KANO_PEDESTRIAN_WALK_LIMITS.nearbyDistance,
  );
  const mesh = batch.mesh;
  for (let index = 0; index < batch.capacity; index += 1) {
    mesh.setMatrixAt(index, batch.zero);
  }

  let slot = 0;
  for (const pedestrian of active) {
    const actor = pedestrian.actor;
    const motion = pedestrian.__kanoPavementWalk;
    if (!actor?.position || !motion) continue;
    actor.updateMatrix?.();
    const gait = getPavementGait(renderer.__kanoPavementWalkTime, motion.phaseOffset);
    for (const [side, angle] of [[-1, gait.leftLeg], [1, gait.rightLeg]]) {
      if (slot >= batch.capacity) break;
      batch.offset.makeTranslation(side * 0.095, 0.42, 0);
      batch.rotation.makeRotationX(angle);
      batch.center.makeTranslation(0, -0.20, 0);
      batch.scratch.copy(actor.matrix)
        .multiply(batch.offset)
        .multiply(batch.rotation)
        .multiply(batch.center);
      mesh.setMatrixAt(slot, batch.scratch);
      slot += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  batch.activeWalkers = Math.floor(slot / 2);
  batch.activeLegInstances = slot;
  // frustumCulled is disabled for this small, dynamically positioned batch;
  // avoid recomputing its bounding sphere every frame.
}

function installRendererRenderSync(renderer) {
  if (!renderer?.renderer?.render || renderer.__kanoPavementRenderSync) return;
  const webgl = renderer.renderer;
  const originalRender = webgl.render;
  const renderWrapper = function renderWithPavementLegSync(scene, camera, ...args) {
    try { syncLegInstances(renderer); }
    catch (error) { noteError(renderer, 'leg-instance-sync', error); }
    return originalRender.call(this, scene, camera, ...args);
  };
  webgl.render = renderWrapper;
  renderer.__kanoPavementRenderSync = { webgl, originalRender, renderWrapper };
}

function install() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[PATCH_KEY] || typeof prototype.draw !== 'function') return;
  const originalDraw = prototype.draw;
  const originalDispose = prototype.dispose;

  Object.defineProperty(prototype, PATCH_KEY, { value: true, configurable: false });
  prototype.draw = function drawWithPavementWalkers(state, deltaSeconds, ...args) {
    try {
      if (this.lifeScene === 'road' && this.ready && !this.disposed) {
        advanceWalkerRecords(this, state, deltaSeconds);
        installRendererRenderSync(this);
      }
    } catch (error) {
      noteError(this, 'walker-update', error);
    }
    return originalDraw.call(this, state, deltaSeconds, ...args);
  };

  if (typeof originalDispose === 'function') {
    prototype.dispose = function disposePavementWalkerUpgrade(...args) {
      const record = this.__kanoPavementRenderSync;
      if (record?.webgl?.render === record.renderWrapper) {
        record.webgl.render = record.originalRender;
      }
      this.__kanoPavementRenderSync = null;
      const batch = this[LEG_BATCH_KEY];
      if (batch?.mesh?.parent) batch.mesh.parent.remove(batch.mesh);
      this[LEG_BATCH_KEY] = null;
      activeRenderers.delete(this);
      report.rendererCount = activeRenderers.size;
      return originalDispose.apply(this, args);
    };
  }
  report.installed = true;
}

install();

if (typeof window !== 'undefined') {
  window.kanoPedestrianPavementWalkAudit = () => ({
    ...report,
    errors: [...report.errors],
    renderers: [...activeRenderers].map((renderer) => ({
      mobile: Boolean(renderer.mobile),
      mobileTier: renderer.mobileTier || 'desktop',
      lifeScene: renderer.lifeScene || null,
      pedestrianCount: Array.isArray(renderer.pedestrians) ? renderer.pedestrians.length : 0,
      movingPedestrians: Number(renderer.__kanoPavementWalkMoved) || 0,
      modelBackedPedestrians: (renderer.pedestrians || []).filter((item) => item?.usingModel).length,
      proceduralPedestrians: (renderer.pedestrians || []).filter((item) => !item?.usingModel).length,
      legBatchPresent: Boolean(renderer[LEG_BATCH_KEY]?.mesh?.parent === renderer.world),
      animatedLegWalkers: Number(renderer[LEG_BATCH_KEY]?.activeWalkers) || 0,
      activeLegInstances: Number(renderer[LEG_BATCH_KEY]?.activeLegInstances) || 0,
      lastDeltaSeconds: Number(renderer.__kanoPavementWalkLastDelta) || 0,
    })),
  });
}
console.info('[Kano Life] Pavement pedestrian locomotion registered.');
