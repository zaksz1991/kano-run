/**
 * KANO LIFE — Step 101: actual GLB traffic in the renderer + directional flow.
 *
 * The existing game simulation remains authoritative. This adapter supports
 * both the older `game.obs` runner and newer `game.s.traffic` state shapes. On
 * the `obs` renderer it mounts the bundled GLBs in the existing vehicle pool,
 * keeps fallback geometry if a load fails, and changes relative traffic flow so
 * the whole road does not visually behave like every vehicle is oncoming.
 */
import * as THREE from 'three';
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { ModelManager } from './ModelManager.js';
import { takeNextKanoTrafficType } from './KanoTrafficCompositionRules.mjs';
import { flowDirectionForLane, relativeApproachDelta, modelKeyForVehicle } from './KanoTrafficFlowRules.mjs';

const PATCH_KEY = Symbol.for('kano.life.trafficRuntimeIntegration.step101');
const MANAGER_KEY = Symbol.for('kano.life.trafficRuntimeModelManager.step101');
const VALID_TYPES = new Set(['keke', 'motorcycle', 'car']);
const MODEL_KEYS = ['keke', 'motorcycle', 'car'];

function trafficFor(game) {
  if (Array.isArray(game?.obs)) return game.obs;
  if (Array.isArray(game?.s?.traffic)) return game.s.traffic;
  if (Array.isArray(game?.state?.traffic)) return game.state.traffic;
  return [];
}

function isLegacyObsGame(game) {
  return Array.isArray(game?.obs)
    && !Array.isArray(game?.s?.traffic)
    && !Array.isArray(game?.state?.traffic);
}

function markFlow(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return 'same';
  vehicle.kanoFlowDirection = flowDirectionForLane(vehicle.lane, vehicle.kanoFlowDirection);
  return vehicle.kanoFlowDirection;
}

function ensureManager(renderer) {
  if (!renderer || renderer[MANAGER_KEY]) return renderer?.models || renderer?.modelManager || null;
  const manager = renderer.models || renderer.modelManager || new ModelManager({ basePath: '/assets/models/' });
  Object.defineProperty(renderer, MANAGER_KEY, { value: true, enumerable: false, configurable: false });
  renderer.models = manager;
  renderer.modelManager = manager;
  renderer.kanoTrafficModelStatus = { keke: 'loading', motorcycle: 'loading', car: 'loading' };
  renderer.kanoTrafficModelPaths = {};

  for (const key of MODEL_KEYS) {
    Promise.resolve()
      .then(() => manager.load(key))
      .then((model) => {
        renderer.kanoTrafficModelStatus[key] = model ? 'loaded' : 'unavailable';
        renderer.kanoTrafficModelPaths[key] = model?.userData?.modelPath || null;
      })
      .catch((error) => {
        renderer.kanoTrafficModelStatus[key] = 'failed';
        renderer.kanoTrafficModelPaths[key] = null;
        renderer.kanoTrafficModelErrors ||= {};
        renderer.kanoTrafficModelErrors[key] = String(error?.message || error).slice(0, 180);
      });
  }
  return manager;
}

function disposeFallbackTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((node) => {
    if (node.userData?.kanoStep101OwnedGeometry && node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }
    const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      // Never dispose model-manager-shared materials through this fallback path.
      if (!node.userData?.modelManagerInstance && !root?.userData?.modelManagerInstance) material.dispose?.();
    }
    if (node.geometry && !node.userData?.modelManagerInstance && !root?.userData?.modelManagerInstance) {
      if (!geometries.has(node.geometry)) {
        geometries.add(node.geometry);
        node.geometry.dispose?.();
      }
    }
  });
}

function releaseMountedModel(renderer, vehicleRoot) {
  const mounted = vehicleRoot?.userData?.kanoStep101MountedModel;
  if (!mounted) return;
  vehicleRoot.remove(mounted);
  mounted.traverse?.((node) => {
    if (node.userData?.kanoStep101OwnedGeometry) node.geometry?.dispose?.();
  });
  const manager = renderer.models || renderer.modelManager;
  manager?.releaseInstance?.(mounted);
  delete vehicleRoot.userData.kanoStep101MountedModel;
  delete vehicleRoot.userData.kanoStep101MountedKey;
  delete vehicleRoot.userData.kanoStep101UsesGLB;
}

function makeBetween(start, end, radius, material) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.03, delta.length() - radius * 2), 3, 6),
    material,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.userData.kanoStep101OwnedGeometry = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function hasRiderNamedInTree(root) {
  let found = false;
  root?.traverse?.((node) => {
    if (found) return;
    if (/(rider|driver|motorist|helmet|human|person|mannequin)/i.test(node.name || '')) found = true;
  });
  return found;
}

function addMotorcycleRiderIfMissing(modelRoot) {
  if (!modelRoot || modelRoot.userData?.kanoStep101RiderChecked) return;
  modelRoot.userData.kanoStep101RiderChecked = true;
  if (hasRiderNamedInTree(modelRoot)) {
    modelRoot.userData.kanoStep101RiderPresent = true;
    return;
  }

  const rider = new THREE.Group();
  rider.name = 'KANO_STEP101_SEATED_OKADA_RIDER';
  rider.position.set(0, 0.07, -0.04);
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2c4b39, roughness: 0.92 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x29343c, roughness: 0.94 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x75452f, roughness: 0.9 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.48 });
  const add = (geometry, material, position, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.name = name;
    mesh.userData.kanoStep101OwnedGeometry = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    rider.add(mesh);
    return mesh;
  };

  add(new THREE.CapsuleGeometry(0.13, 0.27, 3, 7), jacket, [0, 0.79, -0.03], 'Okada rider torso');
  add(new THREE.SphereGeometry(0.115, 10, 8), skin, [0, 1.04, -0.055], 'Okada rider head');
  add(new THREE.SphereGeometry(0.132, 10, 7), helmet, [0, 1.105, -0.055], 'Okada rider helmet');
  for (const side of [-1, 1]) {
    const shoulder = [side * 0.105, 0.88, -0.04];
    const handle = [side * 0.19, 0.68, 0.26];
    rider.add(makeBetween(shoulder, handle, 0.042, jacket));
    const thigh = add(new THREE.CapsuleGeometry(0.055, 0.20, 2, 6), trousers, [side * 0.105, 0.49, 0.075], `Okada rider thigh ${side}`);
    thigh.rotation.x = -0.52;
    const shin = add(new THREE.CapsuleGeometry(0.045, 0.17, 2, 6), trousers, [side * 0.16, 0.35, 0.19], `Okada rider shin ${side}`);
    shin.rotation.x = 0.48;
  }
  modelRoot.add(rider);
  modelRoot.userData.kanoStep101RiderPresent = true;
}

function cleanFallbackChildren(vehicleRoot) {
  const children = [...(vehicleRoot.children || [])];
  for (const child of children) {
    vehicleRoot.remove(child);
    disposeFallbackTree(child);
  }
}

function tryMountGLB(renderer, vehicleRoot, type) {
  const key = modelKeyForVehicle(type);
  const manager = renderer.models || renderer.modelManager;
  const template = key ? manager?.cache?.get?.(key) : null;
  if (!template || !vehicleRoot) return false;
  if (vehicleRoot.userData.kanoStep101MountedKey === key && vehicleRoot.userData.kanoStep101MountedModel) return true;

  const instance = manager.getInstance?.(key);
  if (!instance) return false;
  releaseMountedModel(renderer, vehicleRoot);
  cleanFallbackChildren(vehicleRoot);
  instance.name = `KANO_STEP101_TRAFFIC_GLB_${key}`;
  instance.userData.kanoStep101TrafficGLB = true;
  if (key === 'motorcycle') addMotorcycleRiderIfMissing(instance);
  vehicleRoot.add(instance);
  vehicleRoot.userData.kanoStep101MountedModel = instance;
  vehicleRoot.userData.kanoStep101MountedKey = key;
  vehicleRoot.userData.kanoStep101UsesGLB = true;
  vehicleRoot.userData.currentType = type;
  return true;
}

// Patch the known runner's `obs` schema without disturbing a newer state schema.
if (typeof Game.prototype.spawnTraffic === 'function' && !Game.prototype[PATCH_KEY]) {
  const originalSpawnTraffic = Game.prototype.spawnTraffic;
  Object.defineProperty(Game.prototype, PATCH_KEY, { value: true, enumerable: false });
  Game.prototype.spawnTraffic = function kanoStep101SpawnTraffic(...args) {
    const before = new Set(trafficFor(this));
    const result = originalSpawnTraffic.apply(this, args);
    const traffic = trafficFor(this);
    const added = traffic.filter((vehicle) => vehicle && !before.has(vehicle));
    const legacyObs = isLegacyObsGame(this);

    for (const vehicle of added) {
      // Step 100's composition hook already handles the newer `.s.traffic`
      // schema. The legacy runner uses `.obs`, which Step 100 did not inspect.
      if (legacyObs && !vehicle.kanoStep101TypeAssigned) {
        vehicle.type = takeNextKanoTrafficType(this) || 'car';
        vehicle.kanoStep101TypeAssigned = true;
      }
      markFlow(vehicle);
    }
    for (const vehicle of traffic) markFlow(vehicle);
    if (typeof window !== 'undefined') window.__KANO_LIFE_GAME__ = this;
    return result;
  };
}

// In the original lane runner, all `obs` move at player speed * 1.25. Adjust
// only this known schema: same-flow traffic closes slowly; oncoming traffic closes
// quickly. The original newer-engine update implementation remains untouched.
if (typeof Game.prototype.updateTraffic === 'function') {
  const originalUpdateTraffic = Game.prototype.updateTraffic;
  Game.prototype.updateTraffic = function kanoStep101RelativeTrafficFlow(...args) {
    if (!Array.isArray(this.obs) || Array.isArray(this.s?.traffic) || Array.isArray(this.state?.traffic)) {
      return originalUpdateTraffic.apply(this, args);
    }
    const speed = Math.max(0, Number(this.speed) || 0);
    for (const vehicle of this.obs) {
      markFlow(vehicle);
      vehicle.y += relativeApproachDelta(speed, vehicle.speedFactor, vehicle.kanoFlowDirection);
    }
    this.obs = this.obs.filter((vehicle) => Number(vehicle?.y) < 700);
  };
}

// Patch renderer initialization before the first game frame so real assets load
// while the existing procedural vehicles remain as a safe fallback.
if (typeof Renderer3D.prototype.init === 'function') {
  const originalInit = Renderer3D.prototype.init;
  Renderer3D.prototype.init = function kanoStep101Init(...args) {
    const result = originalInit.apply(this, args);
    ensureManager(this);
    return result;
  };
}

// Use the loaded normalized GLB inside the existing pool root. This keeps the
// original pool positions and renderer loop intact and keeps fallbacks functional.
if (typeof Renderer3D.prototype.styleVehicle === 'function') {
  const originalStyleVehicle = Renderer3D.prototype.styleVehicle;
  Renderer3D.prototype.styleVehicle = function kanoStep101StyleVehicle(vehicleRoot, type, ...args) {
    const wanted = type || 'car';
    const oldKey = vehicleRoot?.userData?.kanoStep101MountedKey;
    const newKey = modelKeyForVehicle(wanted);
    if (oldKey && oldKey !== newKey) releaseMountedModel(this, vehicleRoot);

    const currentType = vehicleRoot?.userData?.currentType || 'car';
    if (!oldKey && currentType !== wanted) cleanFallbackChildren(vehicleRoot);
    const result = originalStyleVehicle.call(this, vehicleRoot, type, ...args);
    if (vehicleRoot?.userData) vehicleRoot.userData.currentType = wanted;
    tryMountGLB(this, vehicleRoot, wanted);
    return result;
  };
}

// Orient visible pool actors by their traffic flow so some vehicles show their
// rear as they travel ahead, rather than every vehicle showing its front.
if (typeof Renderer3D.prototype.draw === 'function') {
  const originalDraw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function kanoStep101Draw(state, ...args) {
    const traffic = trafficFor(state);
    const pool = this.vehiclePool || [];
    for (let index = 0; index < Math.min(traffic.length, pool.length); index += 1) {
      const flow = markFlow(traffic[index]);
      pool[index].rotation.y = flow === 'oncoming' ? Math.PI : 0;
    }
    if (typeof window !== 'undefined') window.__KANO_LIFE_RENDERER__ = this;
    return originalDraw.call(this, state, ...args);
  };
}

if (typeof window !== 'undefined') {
  window.kanoTrafficRuntimeIntegrationAudit = () => {
    const game = window.__KANO_LIFE_GAME__ || null;
    const renderer = window.__KANO_LIFE_RENDERER__ || null;
    const traffic = trafficFor(game);
    const counts = { keke: 0, motorcycle: 0, car: 0, other: 0 };
    const flowCounts = { same: 0, oncoming: 0 };
    for (const vehicle of traffic) {
      const type = vehicle?.type;
      if (type === 'keke' || type === 'motorcycle' || type === 'car') counts[type] += 1;
      else counts.other += 1;
      flowCounts[markFlow(vehicle)] += 1;
    }
    const mounted = (renderer?.vehiclePool || []).filter((actor) => actor?.userData?.kanoStep101UsesGLB).length;
    const fallbacks = (renderer?.vehiclePool || []).filter((actor) => actor?.visible && !actor?.userData?.kanoStep101UsesGLB).length;
    return {
      version: '101.0.0',
      rendererCompatible: Boolean(renderer && Array.isArray(renderer.vehiclePool) && typeof renderer.styleVehicle === 'function'),
      trafficCounts: counts,
      trafficFlow: flowCounts,
      visiblePoolActors: (renderer?.vehiclePool || []).filter((actor) => actor?.visible).length,
      visibleGLBActors: mounted,
      visibleFallbackActors: fallbacks,
      modelStatus: { ...(renderer?.kanoTrafficModelStatus || {}) },
      modelPaths: { ...(renderer?.kanoTrafficModelPaths || {}) },
      note: 'GLB counts reflect actors mounted in the existing vehicle pool. An unavailable model leaves the procedural fallback active; the live scene must still be visually inspected.',
    };
  };
}

console.info('[Kano Life] Step 101 traffic integration registered: actual GLB vehicle mounting and same/oncoming flow for the legacy pool renderer.');
