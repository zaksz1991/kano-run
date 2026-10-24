/**
 * KANO LIFE — LOW-COST SIDEWALK WALK CYCLE
 *
 * Adds a true alternating leg gait to the existing roadside pedestrians without
 * replacing their current cloth, kufi-cap, hijab, skin-tone or body meshes.
 * Real GLB pedestrians keep their own model; the instanced gait is suppressed
 * for actors promoted to GLB. A single InstancedMesh batches both legs for all
 * procedural walkers to limit the added draw-call cost on phones.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import {
  KANO_NORTHERN_GAIT,
  gaitInstanceCount,
  pedestrianGaitAngle,
  pedestrianLegLocalX,
  pedestrianTorsoBob,
  shouldAnimateFallbackWalker,
} from './KanoNorthernPedestrianGaitRules.js';

const PATCH_KEY = Symbol.for('kano.life.northernPedestrianGait.v1');
const liveGaitRenderers = new Set();
const TROUSER_COLOURS = [
  0xf1e7ce, 0x2b8067, 0x99472e, 0x343d56, 0xdec15c, 0xb88fa8, 0x42749a,
];

function removeOldStaticFallbackLegs(group) {
  if (!group?.children?.length) return;
  const removable = [];
  for (const child of group.children) {
    if (!child?.isMesh || !child.geometry || !child.position) continue;
    const x = Number(child.position.x);
    const y = Number(child.position.y);
    if (Math.abs(Math.abs(x) - 0.095) > 0.018 || Math.abs(y - 0.22) > 0.035) continue;
    try {
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      const size = child.geometry.boundingBox?.getSize(new THREE.Vector3());
      if (!size) continue;
      // Match only the old 0.40 m pedestrian-leg cylinders; never remove torso,
      // kufi, hijab/scarf, arm pivots, or any imported GLB mesh.
      if (size.y >= 0.35 && size.y <= 0.45 && size.x <= 0.16 && size.z <= 0.16) {
        removable.push(child);
      }
    } catch {
      // If geometry cannot be measured, leave the original mesh alone.
    }
  }
  for (const child of removable) {
    group.remove(child);
    child.geometry?.dispose?.();
    // The old leg material may also colour a cap or hijab; do not dispose it.
  }
}

function registerBatchedGait(renderer) {
  if (!renderer || renderer._kanoNorthernGait || !renderer.world?.isObject3D) return;
  const walkers = Array.isArray(renderer.pedestrians) ? renderer.pedestrians : [];
  if (!walkers.length) return;

  const capacity = gaitInstanceCount(walkers.length);
  if (!capacity) return;

  const geometry = new THREE.CapsuleGeometry(0.045, 0.26, 2, 6);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const legs = new THREE.InstancedMesh(geometry, material, capacity);
  legs.name = 'KANO_NORTHERN_PEDestrian_GAIT_INSTANCES';
  legs.userData.kanoNorthernPedestrianGait = true;
  legs.frustumCulled = false;
  legs.castShadow = false;
  legs.receiveShadow = false;
  legs.count = capacity;

  for (let walkerIndex = 0; walkerIndex < walkers.length; walkerIndex += 1) {
    const colour = new THREE.Color(TROUSER_COLOURS[(walkers[walkerIndex].index + 3) % TROUSER_COLOURS.length]);
    legs.setColorAt(walkerIndex * 2, colour);
    legs.setColorAt(walkerIndex * 2 + 1, colour);
    if (walkers[walkerIndex].actor?.userData?.fallbackPedestrian) {
      walkers[walkerIndex].kanoGaitEligible = true;
    }
  }
  if (legs.instanceColor) legs.instanceColor.needsUpdate = true;
  renderer.world.add(legs);
  renderer._kanoNorthernGait = {
    legs,
    walkers,
    dummy: new THREE.Object3D(),
    upAxis: new THREE.Vector3(0, 1, 0),
    swingAxis: new THREE.Vector3(1, 0, 0),
    yawQuaternion: new THREE.Quaternion(),
    swingQuaternion: new THREE.Quaternion(),
    capacity,
    lastTimeSeconds: 0,
  };
  liveGaitRenderers.add(renderer);
  updateBatchedGait(renderer, 0);
}

function updateBatchedGait(renderer, nowMs = (globalThis.performance?.now?.() ?? Date.now())) {
  const gait = renderer?._kanoNorthernGait;
  if (!gait?.legs || renderer.disposed) return;
  const timeSeconds = Math.max(0, Number(nowMs) || 0) / 1000;
  gait.lastTimeSeconds = timeSeconds;
  const { legs, walkers, dummy, yawQuaternion, swingQuaternion, upAxis, swingAxis } = gait;
  const walkCount = Math.min(walkers.length, Math.floor(legs.count / 2));

  for (let walkerIndex = 0; walkerIndex < walkCount; walkerIndex += 1) {
    const walker = walkers[walkerIndex];
    const actor = walker?.actor;
    const canAnimate = shouldAnimateFallbackWalker({
      usingModel: Boolean(walker?.usingModel),
      fallback: Boolean(actor?.userData?.fallbackPedestrian && walker?.kanoGaitEligible),
      visible: actor?.visible !== false,
    });

    for (let legIndex = 0; legIndex < 2; legIndex += 1) {
      const instanceIndex = walkerIndex * 2 + legIndex;
      if (!canAnimate || !actor?.position || !actor?.scale) {
        dummy.position.set(0, -100, 0);
        dummy.quaternion.identity();
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        legs.setMatrixAt(instanceIndex, dummy.matrix);
        continue;
      }

      const yaw = Number(actor.rotation?.y) || 0;
      const scale = Math.max(0.1, Math.abs(Number(actor.scale.y) || 1));
      const localX = pedestrianLegLocalX(legIndex) * scale;
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      dummy.position.set(
        actor.position.x + localX * cosine,
        actor.position.y + KANO_NORTHERN_GAIT.hipHeight * scale,
        actor.position.z - localX * sine,
      );
      yawQuaternion.setFromAxisAngle(upAxis, yaw);
      swingQuaternion.setFromAxisAngle(
        swingAxis,
        pedestrianGaitAngle(timeSeconds, Number(walker.phase) || 0, legIndex),
      );
      dummy.quaternion.copy(yawQuaternion).multiply(swingQuaternion);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      legs.setMatrixAt(instanceIndex, dummy.matrix);
    }

    if (canAnimate) {
      const bob = pedestrianTorsoBob(timeSeconds, Number(walker.phase) || 0);
      actor.position.y = bob;
      const arms = walker.arms || [];
      for (let armIndex = 0; armIndex < arms.length; armIndex += 1) {
        if (arms[armIndex]) {
          arms[armIndex].rotation.z = Math.sin(
            timeSeconds * KANO_NORTHERN_GAIT.angularFrequency
              + (Number(walker.phase) || 0)
              + armIndex * Math.PI,
          ) * 0.12;
        }
      }
    }
  }
  legs.instanceMatrix.needsUpdate = true;
}

function installPatch() {
  if (Renderer3D.prototype[PATCH_KEY]) return;
  Renderer3D.prototype[PATCH_KEY] = true;

  const originalMerge = Renderer3D.prototype.mergeMobilePedestrianStaticParts;
  if (typeof originalMerge === 'function') {
    Renderer3D.prototype.mergeMobilePedestrianStaticParts = function (...args) {
      const [group] = args;
      // The game's current static leg meshes are direct children at these known
      // positions. Remove only those original generated legs; a single batched
      // gait mesh below replaces them on mobile and desktop.
      removeOldStaticFallbackLegs(group);
      return originalMerge.apply(this, args);
    };
  }

  const originalBuild = Renderer3D.prototype.buildSidewalkLife;
  if (typeof originalBuild === 'function') {
    Renderer3D.prototype.buildSidewalkLife = function (...args) {
      const result = originalBuild.apply(this, args);
      registerBatchedGait(this);
      return result;
    };
  }

  const originalCull = Renderer3D.prototype.updateMobileDistanceCulling;
  if (typeof originalCull === 'function') {
    Renderer3D.prototype.updateMobileDistanceCulling = function (...args) {
      const result = originalCull.apply(this, args);
      updateBatchedGait(this);
      return result;
    };
  }

  const originalDispose = Renderer3D.prototype.dispose;
  if (typeof originalDispose === 'function') {
    Renderer3D.prototype.dispose = function (...args) {
      const result = originalDispose.apply(this, args);
      liveGaitRenderers.delete(this);
      this._kanoNorthernGait = null;
      return result;
    };
  }

  if (typeof window !== 'undefined') {
    window.kanoNorthernPedestrianGaitAudit = () => {
      const renderers = [...liveGaitRenderers].filter((renderer) => !renderer.disposed);
      return {
        installed: true,
        version: 1,
        rendererInstancesWithGait: renderers.length,
        proceduralWalkers: renderers.reduce((sum, renderer) => sum + (renderer.pedestrians || []).filter((walker) => walker.kanoGaitEligible && !walker.usingModel).length, 0),
        modelBackedWalkers: renderers.reduce((sum, renderer) => sum + (renderer.pedestrians || []).filter((walker) => walker.usingModel).length, 0),
        legInstances: renderers.reduce((sum, renderer) => sum + (renderer._kanoNorthernGait?.legs?.count || 0), 0),
        batchedDrawCalls: renderers.reduce((sum, renderer) => sum + (renderer._kanoNorthernGait?.legs ? 1 : 0), 0),
      };
    };
  }
}

installPatch();
