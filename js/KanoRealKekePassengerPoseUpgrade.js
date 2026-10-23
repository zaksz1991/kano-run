import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { createKanoStreetPerson } from './KanoStreetLifeMotionUpgrade.js';

/**
 * KANO LIFE — Step 99: visible sidewalk life, natural passenger poses,
 * and actual bundled keke GLBs at general checkpoints.
 *
 * This layer never changes passenger fares, zone timing, collisions, steering,
 * wallet state or route progression. It fixes presentation at the renderer layer.
 */
const PATCH = Symbol.for('kano.life.realKekePassengerPose.step99');
const AUDIT = {
  version: 1,
  installed: false,
  sidewalkInstallChecks: 0,
  sidewalkSetsCreated: 0,
  singlePassengerActorsCreated: 0,
  legacyPassengerActorsRemoved: 0,
  realCheckpointKekesInstalled: 0,
  realKekeAssetKey: 'keke',
  realKekeAssetPath: '/assets/models/vehicles/keke/keke-3.glb (ModelManager ordered candidate; actual resolved path is reported on the clone)',
  modelLoadRequested: false,
  modelLoadSucceeded: false,
  modelLoadFailed: false,
  lastError: null,
  note: 'Uses bundled ModelManager GLBs when available; procedural pose-safe characters remain as the passenger/walker fallback. This is not a claim that unrigged human GLBs have been animated.',
};
const STEP99_MODEL_TASK = Symbol.for('kano.life.step99.kekeModelTask');

function toKey(value) {
  return String(value ?? 'unknown');
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveModels(renderer) {
  if (renderer?.models && typeof renderer.models.getInstance === 'function') return renderer.models;
  if (renderer?.modelManager && typeof renderer.modelManager.getInstance === 'function') return renderer.modelManager;
  if (typeof window !== 'undefined') {
    const manager = window.__KANO_MODEL_MANAGER__;
    if (manager && typeof manager.getInstance === 'function') return manager;
  }
  return null;
}

function ensureKekeModelLoad(renderer) {
  const manager = resolveModels(renderer);
  if (!manager) return;
  if (manager.cache?.has?.('keke')) {
    AUDIT.modelLoadSucceeded = true;
    return;
  }
  if (manager[STEP99_MODEL_TASK] || typeof manager.load !== 'function') return;

  AUDIT.modelLoadRequested = true;
  try {
    manager[STEP99_MODEL_TASK] = Promise.resolve(manager.load('keke'))
      .then((model) => {
        AUDIT.modelLoadSucceeded = Boolean(model || manager.cache?.has?.('keke'));
        AUDIT.modelLoadFailed = !AUDIT.modelLoadSucceeded;
        if (!AUDIT.modelLoadSucceeded) AUDIT.lastError = 'ModelManager returned no usable keke model.';
        return AUDIT.modelLoadSucceeded;
      })
      .catch((error) => {
        AUDIT.modelLoadFailed = true;
        AUDIT.lastError = String(error?.message || error).slice(0, 240);
        return false;
      });
  } catch (error) {
    AUDIT.modelLoadFailed = true;
    AUDIT.lastError = String(error?.message || error).slice(0, 240);
  }
}

function getWorldRecords(renderer) {
  return renderer?.kanoStep98WorldAnchors instanceof Map
    ? [...renderer.kanoStep98WorldAnchors.values()]
    : [];
}

function findParking(renderer, zone, actor) {
  const zoneId = toKey(zone?.id);
  const record = getWorldRecords(renderer).find((entry) =>
    entry.kind === 'checkpoint-keke-park' && toKey(entry.zoneId) === zoneId && entry.node?.userData?.kanoCheckpointKeke === true,
  );
  if (record?.node) return record.node;

  const fromActor = actor?.children?.find((child) => child.userData?.kanoCheckpointKeke === true);
  if (fromActor) return fromActor;

  const fromWorld = renderer?.world?.children?.find((child) =>
    child.userData?.kanoCheckpointKeke === true
    && toKey(child.userData?.kanoStep98ZoneId ?? child.userData?.kanoInfrastructureZoneId) === zoneId,
  );
  return fromWorld || null;
}

function disposeProceduralKeke(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse?.((object) => {
    // The renderer-native procedural keke owns its resources. Never dispose the
    // shared geometry or shared materials of a ModelManager clone here.
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of list) {
      if (material && !materials.has(material)) {
        materials.add(material);
        material.dispose?.();
      }
    }
  });
}

function installRealCheckpointKekes(renderer, zones) {
  const manager = resolveModels(renderer);
  if (!manager) return;
  ensureKekeModelLoad(renderer);
  if (!manager.cache?.has?.('keke')) return;

  for (const zone of zones) {
    if (!zone?.hub || zone.type !== 'pickup') continue;
    const actor = renderer.zoneActors?.get?.(zone.id) || null;
    const parking = findParking(renderer, zone, actor);
    if (!parking) continue;

    const candidates = [...(parking.children || [])].filter((child) =>
      child.userData?.kanoParkedCheckpointKeke === true,
    );
    for (const oldVehicle of candidates) {
      if (oldVehicle.userData?.kanoStep99RealKekeInstalled) continue;
      let realVehicle = null;
      try {
        realVehicle = manager.getInstance('keke');
      } catch (error) {
        AUDIT.lastError = String(error?.message || error).slice(0, 240);
      }
      if (!realVehicle) continue;

      realVehicle.name = oldVehicle.name || `KANO_REAL_PARKED_KEKE_${AUDIT.realCheckpointKekesInstalled + 1}`;
      realVehicle.userData.kanoParkedCheckpointKeke = true;
      realVehicle.userData.kanoStep99RealKekeInstalled = true;
      realVehicle.userData.kanoUsesBundledKekeGLB = true;
      realVehicle.userData.kanoRealKekeAssetPath = realVehicle.userData.modelPath || null;
      realVehicle.userData.vehicleType = 'keke';
      realVehicle.position.copy(oldVehicle.position);
      realVehicle.rotation.copy(oldVehicle.rotation);
      const targetScale = renderer.mobile ? 0.68 : 0.72;
      realVehicle.scale.setScalar(targetScale);
      realVehicle.traverse?.((object) => {
        object.castShadow = false;
        object.receiveShadow = false;
      });

      parking.add(realVehicle);
      parking.remove(oldVehicle);
      disposeProceduralKeke(oldVehicle);
      AUDIT.realCheckpointKekesInstalled += 1;
    }
  }
}

function releaseOldInstance(renderer, root) {
  if (!root) return;
  const manager = resolveModels(renderer);
  if (root.userData?.modelManagerInstance && typeof manager?.releaseInstance === 'function') {
    try { manager.releaseInstance(root); } catch (_) {}
  }
}

function removeLegacyPassengers(renderer, actor) {
  const roots = new Set();
  if (actor.userData?.kanoStep99PassengerRoot) roots.add(actor.userData.kanoStep99PassengerRoot);
  for (const root of actor.userData?.waitingActors || []) {
    if (root && root.userData?.kanoStep99PoseSafePassenger !== true) roots.add(root);
  }

  for (const root of roots) {
    root.parent?.remove(root);
    releaseOldInstance(renderer, root);
    AUDIT.legacyPassengerActorsRemoved += 1;
  }
  actor.userData.kanoStep99PassengerRoot = null;
  actor.userData.waitingActors = [];
  actor.userData.waitingUsingModel = false;
  actor.userData.waitingModelKey = null;
}

function removeDirectLegacyHumanModels(renderer, actor) {
  for (const child of [...(actor.children || [])]) {
    if (child.userData?.kanoStreetPerson || child.userData?.kanoPassengerCrowd) continue;
    const modelKey = String(child.userData?.modelKey || '').toLowerCase();
    const modelName = String(child.name || '').toLowerCase();
    const isPassengerModel = /passenger|pedestrian|security|hijab|human|woman|man/.test(`${modelKey} ${modelName}`);
    if (!isPassengerModel) continue;
    if (!child.userData?.modelManagerInstance && !child.userData?.modelKey) continue;
    actor.remove(child);
    releaseOldInstance(renderer, child);
    AUDIT.legacyPassengerActorsRemoved += 1;
  }
}

function ensureSinglePickupPassenger(renderer, zone, actor) {
  const zoneId = toKey(zone?.id);
  if (toKey(actor.userData.kanoStep99PassengerPoseZoneId) === zoneId) return;

  removeLegacyPassengers(renderer, actor);
  removeDirectLegacyHumanModels(renderer, actor);
  actor.userData.kanoStep99PassengerPoseZoneId = zoneId;
  if (zone.type !== 'pickup' || zone.hub) return;

  const sideSign = finite(zone.side, 1) < 0 ? -1 : 1;
  const variant = Math.abs(Math.floor(finite(zone.id, AUDIT.singlePassengerActorsCreated))) % 6;
  const root = createKanoStreetPerson(variant, { waiting: true });
  root.name = `KANO_POSE_SAFE_PICKUP_PASSENGER_${zoneId}`;
  root.userData.kanoStep99PoseSafePassenger = true;
  root.userData.kanoPassengerPose = 'arms-down-natural';
  root.userData.kanoPassengerZoneId = zoneId;
  root.position.set(sideSign * 0.48, 0, 0.18);
  // Face the road, not away from the approaching keke.
  root.rotation.y = sideSign < 0 ? Math.PI / 2 : -Math.PI / 2;
  root.scale.multiplyScalar(renderer.mobile ? 0.88 : 0.94);
  actor.add(root);

  actor.userData.kanoStep99PassengerRoot = root;
  actor.userData.kanoStep99PassengerBaseRotationY = root.rotation.y;
  actor.userData.kanoStep99PassengerBaseY = root.position.y;
  actor.userData.waitingActors = [root];
  actor.userData.waitingUsingModel = false;
  actor.userData.waitingModelKey = null;
  AUDIT.singlePassengerActorsCreated += 1;
}

function reconcilePassengerActors(renderer, zones) {
  if (!renderer?.zoneActors?.get) return;
  for (const zone of zones) {
    if (!zone?.id) continue;
    const actor = renderer.zoneActors.get(zone.id);
    if (!actor) continue;
    ensureSinglePickupPassenger(renderer, zone, actor);
  }
}

function ensureSidewalkWalkers(renderer) {
  AUDIT.sidewalkInstallChecks += 1;
  if (renderer.lifeScene && renderer.lifeScene !== 'road') return;
  if (!renderer.world || typeof renderer.buildSidewalkLife !== 'function') return;
  const alreadyBuilt = renderer.kanoStep99SidewalkLifeInstalled === true;
  const valid = (renderer.pedestrians || []).filter((person) =>
    person?.kanoStreetPerson && person.actor?.parent === renderer.world,
  ).length;
  if (valid > 0) {
    renderer.kanoStep99SidewalkLifeInstalled = true;
    return;
  }
  if (alreadyBuilt || renderer.kanoStep99SidewalkLifeBuilding) return;

  renderer.kanoStep99SidewalkLifeBuilding = true;
  try {
    renderer.buildSidewalkLife();
    const after = (renderer.pedestrians || []).filter((person) =>
      person?.kanoStreetPerson && person.actor?.parent === renderer.world,
    ).length;
    renderer.kanoStep99SidewalkLifeInstalled = after > 0;
    if (after > 0) AUDIT.sidewalkSetsCreated += 1;
  } catch (error) {
    AUDIT.lastError = String(error?.message || error).slice(0, 240);
  } finally {
    renderer.kanoStep99SidewalkLifeBuilding = false;
  }
}

function animateSinglePickupPassengers(renderer, dt) {
  const time = finite(renderer.kanoStep99PassengerClock) + dt;
  renderer.kanoStep99PassengerClock = time;
  for (const zoneActor of renderer.zoneActors?.values?.() || []) {
    const root = zoneActor.userData?.kanoStep99PassengerRoot;
    if (!root || root.parent !== zoneActor) continue;
    const parts = root.userData?.kanoAnimationParts;
    if (!parts) continue;
    const phase = time * 0.74 + finite(parts.phase);
    root.position.y = finite(zoneActor.userData.kanoStep99PassengerBaseY) + Math.abs(Math.sin(phase)) * 0.008;
    root.rotation.y = finite(zoneActor.userData.kanoStep99PassengerBaseRotationY) + Math.sin(phase * 0.65) * 0.025;
    for (const arm of parts.arms || []) {
      // The hands remain beside the body; only a tiny relaxed idle sway is allowed.
      arm.pivot.rotation.z = finite(arm.restZ) + Math.sin(phase + finite(arm.side)) * 0.018;
      arm.pivot.rotation.x = 0;
    }
    if (parts.headCover) parts.headCover.rotation.y = Math.sin(phase * 0.35) * 0.025;
  }
}

function currentZones(renderer, state) {
  if (Array.isArray(state?.zones)) return state.zones;
  if (Array.isArray(renderer?.game?.s?.zones)) return renderer.game.s.zones;
  if (Array.isArray(renderer?.s?.zones)) return renderer.s.zones;
  return [];
}

function installRendererHooks() {
  if (Renderer3D.prototype[PATCH]) return;
  const originalDraw = Renderer3D.prototype.draw;
  const originalSyncZones = Renderer3D.prototype.syncZones;

  if (typeof originalSyncZones === 'function') {
    Renderer3D.prototype.syncZones = function kanoStep99SyncZones(state, ...args) {
      const result = originalSyncZones.call(this, state, ...args);
      try {
        const zones = currentZones(this, state);
        reconcilePassengerActors(this, zones);
        ensureKekeModelLoad(this);
        installRealCheckpointKekes(this, zones);
      } catch (error) {
        AUDIT.lastError = String(error?.message || error).slice(0, 240);
      }
      return result;
    };
  }

  if (typeof originalDraw === 'function') {
    Renderer3D.prototype.draw = function kanoStep99Draw(state, deltaSeconds, ...args) {
      try {
        if (typeof window !== 'undefined') window.__KANO_ACTIVE_RENDERER__ = this;
        ensureSidewalkWalkers(this);
        const zones = currentZones(this, state);
        reconcilePassengerActors(this, zones);
        ensureKekeModelLoad(this);
        installRealCheckpointKekes(this, zones);
        animateSinglePickupPassengers(this, THREE.MathUtils.clamp(finite(deltaSeconds, 1 / 60), 0, 0.05));
      } catch (error) {
        AUDIT.lastError = String(error?.message || error).slice(0, 240);
      }
      return originalDraw.call(this, state, deltaSeconds, ...args);
    };
  }

  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
  AUDIT.installed = true;
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoRealKekePassengerPoseAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const manager = resolveModels(renderer);
    const zones = currentZones(renderer, renderer?.game?.s || null);
    const checkpoints = [];
    for (const zone of zones) {
      if (!zone?.hub || zone.type !== 'pickup') continue;
      const actor = renderer?.zoneActors?.get?.(zone.id) || null;
      const parking = findParking(renderer, zone, actor);
      const vehicles = (parking?.children || []).filter((child) => child.userData?.kanoParkedCheckpointKeke === true);
      checkpoints.push({
        zoneId: toKey(zone.id),
        passengers: actor?.userData?.kanoPassengerCrowdCount || 0,
        parkedKekes: vehicles.length,
        realKekes: vehicles.filter((vehicle) => vehicle.userData?.kanoStep99RealKekeInstalled).length,
        assetPaths: vehicles.filter((vehicle) => vehicle.userData?.kanoStep99RealKekeInstalled).map((vehicle) => vehicle.userData?.kanoRealKekeAssetPath || null),
        worldAnchored: Boolean(parking && renderer?.world && parking.parent === renderer.world),
      });
    }
    const walkers = (renderer?.pedestrians || []).filter((person) => person?.kanoStreetPerson && person.actor?.parent === renderer?.world);
    const passengerActors = [...(renderer?.zoneActors?.values?.() || [])]
      .filter((actor) => actor.userData?.kanoStep99PassengerRoot)
      .map((actor) => ({
        zoneId: actor.userData.kanoStep99PassengerPoseZoneId,
        pose: actor.userData.kanoStep99PassengerRoot?.userData?.kanoPassengerPose || null,
        arms: actor.userData.kanoStep99PassengerRoot?.userData?.kanoAnimationParts?.arms?.length || 0,
      }));
    return {
      ...AUDIT,
      activeRenderer: Boolean(renderer),
      modelManagerAvailable: Boolean(manager),
      kekeModelCached: Boolean(manager?.cache?.has?.('keke')),
      sidewalks: { count: walkers.length, moving: walkers.filter((person) => Number(person.walkSpeed) > 0 && person.actor?.userData?.kanoStep92NoMotion !== true).length },
      singlePickupPassengers: passengerActors.length,
      naturalPosePassengerActors: passengerActors,
      checkpoints,
    };
  };
}

installRendererHooks();
publishAudit();
console.info('[Kano Life] Step 99 real checkpoint keke GLBs, reliable sidewalk actors, and natural single-passenger poses registered.');
