/**
 * Kano Life — cultural street-event visual upgrade.
 *
 * Uses existing vehicle/character GLBs wherever available. Wedding convoy cars
 * receive lightweight celebration decoration. Roadside children are cloned
 * from loaded character GLBs and carry bowl props. Goat crossings prefer a real
 * goat GLB from the generated inventory, with an articulated low-poly fallback
 * when the inventory or asset is unavailable. Game damage/fare rules are untouched.
 */
import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { Renderer3D } from './renderer3d.js';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { Game } from './game.js';

const PATCH_TAG = Symbol.for('kano.life.culturalStreetEvents.v1');
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const rand = (min, max) => min + Math.random() * (max - min);
const cultures = new Set();
const cultureAudit = {
  version: 1,
  module: 'KanoCulturalStreetEventsUpgrade',
  weddingConvoysTriggered: 0,
  weddingVehiclesDecorated: 0,
  roadsideChildrenCreated: 0,
  roadsideChildModelPaths: [],
  goatAssetStatus: 'not-scanned',
  goatModelPath: null,
  goatCrossingsStarted: 0,
  goatAnimationClips: [],
  modelLoadFailures: [],
  notes: [],
};

function modelPathOf(root) {
  let path = root?.userData?.modelPath || '';
  if (!path && root?.traverse) root.traverse((node) => {
    if (!path && node.userData?.modelPath) path = String(node.userData.modelPath);
  });
  return String(path || '');
}

function addOwnedMesh(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.kanoCulturalOwned = true;
  parent.add(mesh);
  return mesh;
}

function attachWeddingDecoration(actor, vehicle) {
  if (!actor?.isObject3D || actor.userData?.kanoWeddingDecorated) return false;
  actor.updateMatrixWorld?.(true);
  const bounds = new THREE.Box3().setFromObject(actor);
  if (bounds.isEmpty()) return false;
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x < 0.4 || size.y < 0.3 || size.z < 0.5) return false;

  const width = clamp(size.x * 1.04, 0.9, 2.9);
  const depth = clamp(size.z, 1.2, 4.4);
  const height = clamp(size.y, 0.55, 2.2);
  const decor = new THREE.Group();
  decor.name = 'KANO_AURE_WEDDING_CONVOY_DECOR';
  decor.userData.kanoCulturalOwned = true;
  decor.userData.kanoWeddingConvoyId = String(vehicle?.id || 'wedding');

  const ivory = new THREE.MeshStandardMaterial({ color: 0xf7f1df, roughness: 0.72, metalness: 0.02 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6ad4d, roughness: 0.48, metalness: 0.18, emissive: 0x3b2104, emissiveIntensity: 0.12 });
  const green = new THREE.MeshStandardMaterial({ color: 0x17835b, roughness: 0.62 });
  const flowerWhite = new THREE.MeshStandardMaterial({ color: 0xfff9ec, roughness: 0.45 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xb66a17, emissiveIntensity: 0.65, roughness: 0.35 });

  const ribbonY = Math.max(0.45, height * 0.56);
  const hoodZ = -depth * 0.28;
  addOwnedMesh(decor, new THREE.BoxGeometry(width * 0.96, 0.035, Math.max(0.12, depth * 0.11)), ivory, [0, ribbonY, hoodZ]);
  addOwnedMesh(decor, new THREE.BoxGeometry(Math.max(0.045, width * 0.045), 0.043, Math.max(0.3, depth * 0.29)), gold, [0, ribbonY + 0.022, hoodZ + depth * 0.02]);
  addOwnedMesh(decor, new THREE.BoxGeometry(width * 0.72, 0.028, 0.10), green, [0, Math.max(0.42, height * 0.83), 0]);

  // A compact flower cluster on the bonnet; only the three event vehicles get it.
  const flower = new THREE.Group();
  flower.name = 'KANO_AURE_FLOWER_CLUSTER';
  flower.position.set(0, Math.max(0.45, height * 0.62), hoodZ - depth * 0.035);
  decor.add(flower);
  addOwnedMesh(flower, new THREE.SphereGeometry(0.055, 7, 5), gold, [0, 0, 0]);
  const petalPositions = [
    [0.075, 0, 0], [-0.075, 0, 0], [0, 0.055, 0.035], [0, -0.055, 0.035], [0, 0, -0.075],
  ];
  petalPositions.forEach((position, index) => {
    addOwnedMesh(flower, new THREE.SphereGeometry(0.045, 6, 4), index % 2 ? flowerWhite : ivory, position);
  });

  const lamps = [];
  for (const side of [-1, 1]) {
    const lamp = addOwnedMesh(
      decor,
      new THREE.SphereGeometry(0.047, 7, 5),
      lampMaterial.clone(),
      [side * width * 0.32, Math.max(0.32, height * 0.32), -depth * 0.47],
    );
    lamps.push(lamp);
  }
  decor.userData.kanoWeddingLamps = lamps;
  decor.userData.kanoWeddingMaterials = [ivory, gold, green, flowerWhite, lampMaterial];
  actor.add(decor);
  actor.userData.kanoWeddingDecorated = true;
  actor.userData.kanoWeddingConvoyId = String(vehicle?.id || 'wedding');
  cultureAudit.weddingVehiclesDecorated += 1;
  return true;
}

function updateWeddingDecoration(actor, elapsed) {
  const decor = actor?.children?.find((child) => child.name === 'KANO_AURE_WEDDING_CONVOY_DECOR');
  if (!decor) return;
  const lamps = decor.userData?.kanoWeddingLamps || [];
  const pulse = 0.38 + (Math.sin(elapsed * 4.8) > 0 ? 0.62 : 0.12);
  for (const lamp of lamps) {
    const material = lamp.material;
    if (material?.emissive) material.emissiveIntensity = pulse;
    lamp.scale.setScalar(0.88 + pulse * 0.18);
  }
  // Gentle fabric movement, intentionally tiny so ribbons do not detach from cars.
  decor.rotation.z = Math.sin(elapsed * 2.2 + (actor.position.z || 0)) * 0.006;
}

function createFoodBowl() {
  const bowl = new THREE.Group();
  bowl.name = 'KANO_ALMAJIRI_FOOD_BOWL';
  bowl.userData.kanoCulturalOwned = true;
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3adb2, metalness: 0.62, roughness: 0.35 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x4b4132, roughness: 0.92 });
  const points = [
    new THREE.Vector2(0.085, 0), new THREE.Vector2(0.12, 0.012),
    new THREE.Vector2(0.15, 0.05), new THREE.Vector2(0.165, 0.078),
  ];
  addOwnedMesh(bowl, new THREE.LatheGeometry(points, 12), metal, [0, 0, 0]);
  addOwnedMesh(bowl, new THREE.CylinderGeometry(0.117, 0.085, 0.006, 12), inner, [0, 0.031, 0]);
  addOwnedMesh(bowl, new THREE.TorusGeometry(0.162, 0.009, 4, 14), metal, [0, 0.078, 0]);
  return bowl;
}

function findFemaleLikePath(root) {
  const path = modelPathOf(root).toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(woman|women|female|girl|hijab|lady|wife)\b/.test(path);
}

function makeRoadsideChildren(system) {
  const renderer = system.renderer;
  const manager = renderer?.models;
  if (!manager?.cache) return false;
  if (system.kanoCultureState?.children?.length) return true;

  const sources = [];
  for (const key of ['passengerMan', 'pedestrian', 'passenger']) {
    if (!manager.cache.has(key) || typeof manager.getInstance !== 'function') continue;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const model = manager.getInstance(key);
      if (!model?.isObject3D) continue;
      if (findFemaleLikePath(model)) continue;
      sources.push({ key, model, path: modelPathOf(model) });
      if (sources.length >= 2) break;
    }
    if (sources.length >= 2) break;
  }
  if (!sources.length) return false;

  const state = system.kanoCultureState || (system.kanoCultureState = {
    elapsed: 0,
    children: [],
    goatStatus: 'waiting-for-asset-inventory',
    goatRoot: null,
    goatMixer: null,
    goatAction: null,
    goatStarted: false,
    goatCrossing: null,
    goatNextAt: 20,
    goatLoadStarted: false,
    disposed: false,
    vendorGestureTicks: 0,
  });

  const placements = [
    { side: -1, x: -6.75, z: -42, phase: 0.2 },
    { side: 1, x: 6.75, z: -82, phase: 1.9 },
  ];
  for (let index = 0; index < Math.min(2, sources.length); index += 1) {
    const source = sources[index];
    const placement = placements[index];
    const model = source.model;
    model.name = `KANO_ALMAJIRI_CHILD_${index + 1}`;
    model.scale.multiplyScalar(0.62);
    model.position.set(placement.x, 0, placement.z);
    model.rotation.y = placement.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    model.userData.kanoCulturalRole = 'almajiri-child-with-food-bowl';
    model.userData.kanoCulturalModelKey = source.key;
    model.userData.kanoCulturalModelPath = source.path || null;
    model.userData.kanoCulturalAnimationPhase = placement.phase;
    model.traverse?.((node) => {
      if (node.isMesh || node.isSkinnedMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    const bowl = createFoodBowl();
    bowl.position.set(0.13, 0.26, -0.26);
    bowl.rotation.x = -0.03;
    model.add(bowl);
    model.userData.kanoFoodBowl = bowl;
    renderer.world.add(model);
    state.children.push({
      root: model,
      bowl,
      side: placement.side,
      x: placement.x,
      z: placement.z,
      phase: placement.phase,
      modelKey: source.key,
      modelPath: source.path || null,
    });
    cultureAudit.roadsideChildrenCreated += 1;
    cultureAudit.roadsideChildModelPaths.push(source.path || source.key);
  }
  return state.children.length > 0;
}

async function discoverGoatPath() {
  const response = await fetch('/assets/models/model-catalog-audit.generated.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`GLB inventory request returned HTTP ${response.status}`);
  const report = await response.json();
  const files = Array.isArray(report?.files) ? report.files : [];
  const candidates = files.filter((file) => {
    const combined = `${file?.path || ''} ${(file?.internalNames || []).join(' ')}`.toLowerCase().replace(/[_-]+/g, ' ');
    return /\b(goat|goats|caprine|dwarf goat|domestic goat)\b/.test(combined)
      && !/\b(goat cheese|goat milk|logo|icon|text|sign)\b/.test(combined)
      && String(file?.path || '').toLowerCase().endsWith('.glb');
  });
  candidates.sort((a, b) => {
    const score = (file) => {
      const value = `${file.path} ${(file.internalNames || []).join(' ')}`.toLowerCase();
      return (/(animals?|livestock)/.test(value) ? 0 : 1) + (/(goat|caprine)/.test(value) ? 0 : 1);
    };
    return score(a) - score(b) || String(a.path).localeCompare(String(b.path));
  });
  return candidates[0]?.path || null;
}

function createProceduralGoat() {
  const root = new THREE.Group();
  root.name = 'KANO_PROCEDURAL_GOAT_CROSSING';
  root.userData.kanoCulturalRole = 'goat-crossing';
  root.userData.kanoProceduralFallback = true;

  const coat = new THREE.MeshStandardMaterial({ color: 0x8d7558, roughness: 0.96 });
  const lightCoat = new THREE.MeshStandardMaterial({ color: 0xc8b89b, roughness: 0.96 });
  const darkCoat = new THREE.MeshStandardMaterial({ color: 0x5c4735, roughness: 0.98 });
  const hornMaterial = new THREE.MeshStandardMaterial({ color: 0xd7c9aa, roughness: 0.76 });
  const innerEarMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4a3e, roughness: 0.95 });
  const muzzleMaterial = new THREE.MeshStandardMaterial({ color: 0x9b7766, roughness: 0.93 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x171512, roughness: 0.72 });
  const hoofMaterial = new THREE.MeshStandardMaterial({ color: 0x342c24, roughness: 0.94 });
  const legPivots = [];

  const addPart = (geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    return mesh;
  };

  // Rounded torso, shoulder, rump, and belly form a recognizable goat profile.
  addPart(new THREE.SphereGeometry(1, 14, 10), coat, [-0.08, 0.70, 0], [0.49, 0.30, 0.245]);
  addPart(new THREE.SphereGeometry(1, 12, 9), darkCoat, [-0.34, 0.70, 0], [0.24, 0.275, 0.25]);
  addPart(new THREE.SphereGeometry(1, 12, 9), lightCoat, [-0.02, 0.52, 0], [0.34, 0.12, 0.19]);
  addPart(new THREE.SphereGeometry(1, 12, 9), coat, [0.29, 0.75, 0], [0.23, 0.25, 0.22]);

  // Slightly raised, forward-sloping neck and compact head.
  addPart(new THREE.CapsuleGeometry(0.145, 0.27, 3, 8), lightCoat, [0.39, 0.88, 0], [0.88, 1.0, 0.92], [0, 0, -0.50]);
  addPart(new THREE.SphereGeometry(1, 12, 9), coat, [0.53, 1.075, 0], [0.17, 0.15, 0.14]);
  addPart(new THREE.SphereGeometry(1, 10, 8), muzzleMaterial, [0.666, 1.012, 0], [0.12, 0.085, 0.105]);

  for (const side of [-1, 1]) {
    addPart(new THREE.SphereGeometry(0.028, 7, 5), eyeMaterial, [0.585, 1.105, side * 0.122]);
    addPart(new THREE.CapsuleGeometry(0.022, 0.115, 2, 5), coat, [0.445, 1.16, side * 0.105], [0.9, 1.0, 0.65], [0, side * 0.12, -0.84]);
    addPart(new THREE.CapsuleGeometry(0.018, 0.105, 2, 5), innerEarMaterial, [0.46, 1.15, side * 0.115], [0.84, 1.0, 0.55], [0, side * 0.12, -0.84]);
    addPart(new THREE.ConeGeometry(0.033, 0.145, 7), hornMaterial, [0.455, 1.235, side * 0.062], [1, 1, 1], [0, side * 0.18, -0.18]);
  }

  // Short tail, four articulated legs, dark lower joints, and visible hooves.
  addPart(new THREE.CylinderGeometry(0.018, 0.03, 0.23, 6), darkCoat, [-0.55, 0.79, 0], [1, 1, 1], [0, 0, 0.45]);
  for (const x of [-0.36, 0.27]) {
    for (const z of [-0.155, 0.155]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.57, z);
      root.add(pivot);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.14, 2, 5), coat);
      upper.position.y = -0.12;
      upper.castShadow = false;
      upper.receiveShadow = false;
      pivot.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.16, 2, 5), lightCoat);
      lower.position.set(0.012, -0.315, 0);
      lower.castShadow = false;
      lower.receiveShadow = false;
      pivot.add(lower);
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.075), hoofMaterial);
      hoof.position.set(0.018, -0.455, 0);
      hoof.castShadow = false;
      hoof.receiveShadow = false;
      pivot.add(hoof);
      legPivots.push(pivot);
    }
  }

  root.scale.setScalar(0.88);
  root.position.set(0, 0.012, -23);
  root.visible = false;
  return { root, legPivots };
}

function installProceduralGoatFallback(system, state, reason) {
  if (state.disposed || state.goatRoot || system.renderer?.disposed || !system.renderer?.world) return false;
  const goat = createProceduralGoat();
  system.renderer.world.add(goat.root);
  state.goatRoot = goat.root;
  state.goatFallbackLegs = goat.legPivots;
  state.goatStatus = `procedural-fallback-${reason}`;
  cultureAudit.goatAssetStatus = state.goatStatus;
  cultureAudit.notes.push(`No usable goat GLB (${reason}); using a low-poly articulated goat fallback.`);
  if (cultureAudit.notes.length > 12) cultureAudit.notes.shift();
  return true;
}

function startGoatLoad(system, state) {
  if (state.goatLoadStarted || state.disposed) return;
  state.goatLoadStarted = true;
  state.goatStatus = 'scanning-existing-glb-inventory';
  cultureAudit.goatAssetStatus = state.goatStatus;
  discoverGoatPath().then((relativePath) => {
    if (!relativePath) {
      installProceduralGoatFallback(system, state, 'no-goat-glb-found-in-inventory');
      return;
    }
    const base = String(system.renderer?.models?.basePath || '/assets/models/').replace(/\/?$/, '/');
    const url = `${base}${relativePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    state.goatStatus = 'loading-existing-goat-glb';
    cultureAudit.goatAssetStatus = state.goatStatus;
    cultureAudit.goatModelPath = relativePath;
    createGLTFLoader().load(url, (gltf) => {
      if (state.disposed || system.renderer?.disposed || !system.renderer?.world) {
        disposeUniqueTree(gltf?.scene);
        state.goatStatus = 'discarded-after-scene-dispose';
        cultureAudit.goatAssetStatus = state.goatStatus;
        return;
      }
      const root = gltf?.scene;
      if (!root?.isObject3D) {
        state.goatStatus = 'loaded-without-scene-root';
        cultureAudit.goatAssetStatus = state.goatStatus;
        installProceduralGoatFallback(system, state, 'loaded-without-scene-root');
        return;
      }
      root.name = 'KANO_ANIMATED_GOAT_CROSSING';
      root.userData.kanoCulturalRole = 'goat-crossing';
      root.userData.kanoCulturalModelPath = relativePath;
      root.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
          node.castShadow = false;
          node.receiveShadow = false;
          node.frustumCulled = false;
        }
      });
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y < 0.03) {
        state.goatStatus = 'rejected-invalid-bounds';
        cultureAudit.goatAssetStatus = state.goatStatus;
        disposeUniqueTree(root);
        installProceduralGoatFallback(system, state, 'rejected-invalid-bounds');
        return;
      }
      const scale = 0.76 / size.y;
      root.scale.multiplyScalar(scale);
      root.updateMatrixWorld(true);
      const grounded = new THREE.Box3().setFromObject(root);
      const center = grounded.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -grounded.min.y + 0.012, -23);
      root.visible = false;
      system.renderer.world.add(root);
      state.goatRoot = root;
      state.goatClips = Array.isArray(gltf.animations) ? gltf.animations : [];
      if (state.goatClips.length) {
        state.goatMixer = new THREE.AnimationMixer(root);
        const preferred = state.goatClips.find((clip) => /walk|run|move|goat|animal/i.test(clip.name)) || state.goatClips[0];
        state.goatAction = state.goatMixer.clipAction(preferred);
        state.goatAction.setLoop(THREE.LoopRepeat, Infinity);
        state.goatAction.play();
        cultureAudit.goatAnimationClips = state.goatClips.map((clip) => clip.name);
      }
      state.goatStatus = state.goatClips.length ? 'loaded-with-animation' : 'loaded-root-motion-only';
      cultureAudit.goatAssetStatus = state.goatStatus;
      console.info('[Kano cultural events] Existing goat GLB loaded:', relativePath, state.goatStatus);
    }, undefined, (error) => {
      state.goatStatus = 'goat-glb-load-failed';
      cultureAudit.goatAssetStatus = state.goatStatus;
      cultureAudit.modelLoadFailures.push({ path: relativePath, message: String(error?.message || error) });
      console.warn('[Kano cultural events] Goat GLB failed to load; using the procedural fallback:', relativePath, error);
      installProceduralGoatFallback(system, state, 'glb-load-failed');
    });
  }).catch((error) => {
    state.goatStatus = 'inventory-unavailable';
    cultureAudit.goatAssetStatus = state.goatStatus;
    cultureAudit.modelLoadFailures.push({ path: 'model-catalog-audit.generated.json', message: String(error?.message || error) });
    console.warn('[Kano cultural events] Goat inventory scan unavailable; using the procedural fallback.', error);
    installProceduralGoatFallback(system, state, 'inventory-unavailable');
  });
}

function disposeUniqueTree(root) {
  if (!root?.traverse) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }
    const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !textures.has(value)) {
          textures.add(value);
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

function updateCulturalScenes(system, dt, stateSnapshot) {
  if (!system || system.disposed) return;
  const renderer = system.renderer;
  const game = system.game;
  if (!renderer?.world || renderer.disposed) return;
  let state = system.kanoCultureState;
  if (!state) {
    state = system.kanoCultureState = {
      elapsed: 0,
      children: [],
      goatStatus: 'waiting-for-asset-inventory',
      goatRoot: null,
      goatMixer: null,
      goatAction: null,
      goatFallbackLegs: [],
      goatStarted: false,
      goatCrossing: null,
      goatNextAt: 20,
      goatLoadStarted: false,
      goatClips: [],
      disposed: false,
    };
    cultures.add(system);
  }
  const delta = clamp(dt, 0, 0.05);
  state.elapsed += delta;

  const roadVisible = !renderer.lifeScene || renderer.lifeScene === 'road';
  for (const child of state.children) child.root.visible = roadVisible;
  if (!roadVisible) {
    if (state.goatRoot) state.goatRoot.visible = false;
    return;
  }

  makeRoadsideChildren(system);
  // Retry only while manager assets are still arriving; once actors exist,
  // the children are cached and no expensive scene-wide search is performed.
  const signedSpeed = Number.isFinite(stateSnapshot?.signedSpeed)
    ? stateSnapshot.signedSpeed
    : stateSnapshot?.reverse ? -Math.abs(Number(stateSnapshot?.speed) || 0) : Math.abs(Number(stateSnapshot?.speed) || 0);
  const scroll = signedSpeed * delta * 0.28;
  for (const child of state.children) {
    child.root.position.z += scroll;
    if (child.root.position.z > 8) {
      child.side *= -1;
      child.x = child.side * 6.75;
      child.root.position.x = child.x;
      child.root.position.z = -145 - rand(0, 18);
      child.root.rotation.y = child.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (child.root.position.z < -178) {
      child.root.position.z = 8;
    }
    const phase = state.elapsed * 2.15 + child.phase;
    child.root.rotation.z = Math.sin(phase) * 0.018;
    child.root.position.y = Math.max(0, Math.sin(phase * 0.7)) * 0.012;
    if (child.bowl) child.bowl.rotation.x = Math.sin(phase + 0.6) * 0.045;
  }

  startGoatLoad(system, state);
  if (state.goatMixer) state.goatMixer.update(delta);
  if (state.goatFallbackLegs?.length) {
    state.goatFallbackLegs.forEach((leg, index) => {
      leg.rotation.z = Math.sin(state.elapsed * 8.2 + index * Math.PI * 0.5) * 0.13;
    });
  }
  if (state.goatRoot) {
    state.goatRoot.position.z += scroll;
    if (!state.goatCrossing && state.elapsed >= state.goatNextAt && game?.state === 'PLAY' && !stateSnapshot?.event) {
      const startSide = Math.random() < 0.5 ? -1 : 1;
      state.goatCrossing = { progress: 0, startSide, duration: 5.6, fixedZ: -19 - rand(0, 8) };
      state.goatRoot.visible = true;
      state.goatRoot.position.set(startSide * 8.6, state.goatRoot.position.y, state.goatCrossing.fixedZ);
      state.goatRoot.rotation.y = startSide < 0 ? 0 : Math.PI;
      cultureAudit.goatCrossingsStarted += 1;
    }
    if (state.goatCrossing) {
      const crossing = state.goatCrossing;
      crossing.progress = Math.min(1, crossing.progress + delta / crossing.duration);
      const t = crossing.progress;
      const eased = t * t * (3 - 2 * t);
      const endX = -crossing.startSide * 8.6;
      state.goatRoot.position.x = crossing.startSide * 8.6 + (endX - crossing.startSide * 8.6) * eased;
      state.goatRoot.position.z = crossing.fixedZ + scroll;
      state.goatRoot.position.y = Math.max(0, Math.sin(t * Math.PI * 6)) * 0.025 + 0.012;
      if (crossing.progress >= 1) {
        state.goatRoot.visible = false;
        state.goatCrossing = null;
        state.goatNextAt = state.elapsed + rand(43, 67);
      }
    }
  }
  // The actual seller can be a GLB through the existing root-cause patch. This
  // subtle gesture updates only actors that expose named upper-arm nodes; it
  // never fabricates another humanoid mesh or alters sale logic.
  const bridge = window.__KANO_ACTIVE_PRODUCTION_BRIDGE__ || window.kanoProductionBridge;
  const hawker = bridge?.hawker;
  const hawkerRoot = hawker?.root;
  if (hawkerRoot && !hawkerRoot.userData.kanoGesturePrepared) {
    const armNodes = [];
    hawkerRoot.traverse((node) => {
      if (/upper.?arm|forearm|arm.?l|arm.?r|hand.?l|hand.?r/i.test(node.name || '') && node.rotation) armNodes.push({ node, baseX: node.rotation.x, baseZ: node.rotation.z, phase: Math.random() * Math.PI * 2 });
    });
    hawkerRoot.userData.kanoGesturePrepared = true;
    hawkerRoot.userData.kanoGestureNodes = armNodes;
  }
  const gestureNodes = hawkerRoot?.userData?.kanoGestureNodes || [];
  for (const arm of gestureNodes) arm.node.rotation.z = arm.baseZ + Math.sin(state.elapsed * 2.4 + arm.phase) * 0.17;
}

// Existing wedding gameplay already creates three SUV traffic records. Decorate
// the actual traffic actors after Renderer3D has placed them, including GLB swaps.
if (!Renderer3D.prototype[PATCH_TAG]) {
  Object.defineProperty(Renderer3D.prototype, PATCH_TAG, { value: true });
  const originalSyncTraffic = Renderer3D.prototype.syncTraffic;
  if (typeof originalSyncTraffic === 'function') {
    Renderer3D.prototype.syncTraffic = function syncTrafficWithKanoWeddingConvoy(state, ...args) {
      const result = originalSyncTraffic.call(this, state, ...args);
      const elapsed = Number(this.kanoCulturalElapsed) || 0;
      this.kanoCulturalElapsed = elapsed + 1 / 60;
      for (const vehicle of state?.traffic || []) {
        const id = String(vehicle?.id || '');
        const wedding = /wedding/i.test(id) || vehicle?.event === 'weddingConvoy' || vehicle?.convoy === 'aure';
        if (!wedding) continue;
        const actor = this.trafficActors?.get(vehicle.id);
        if (actor && attachWeddingDecoration(actor, vehicle)) {
          console.info('[Kano cultural events] Wedding decoration attached:', id, modelPathOf(actor));
        }
        if (actor) updateWeddingDecoration(actor, elapsed);
      }
      return result;
    };
  }
}

// Increase the probability of the existing Bikin Aure event without rewriting
// the game's environmental event system. Other events continue to be handled by
// the original method; fares, physics and collision damage stay untouched.
if (Game?.prototype && !Game.prototype[PATCH_TAG]) {
  Object.defineProperty(Game.prototype, PATCH_TAG, { value: true });
  const originalUpdateEnvironment = Game.prototype.updateEnvironment;
  if (typeof originalUpdateEnvironment === 'function') {
    Game.prototype.updateEnvironment = function updateEnvironmentWithMoreAure(dt, ...args) {
      const s = this.s;
      const shouldCheck = s && Number(s.lifeEventTimer) <= Math.max(0, Number(dt) || 0)
        && this.mode !== 'timeAttack' && this.state === 'PLAY' && !s.event;
      if (shouldCheck && Math.random() < 0.34) {
        s.lifeEventTimer = rand(76, 96);
        s.environment = 'wedding';
        s.environmentDuration = rand(22, 28);
        s.traffic ||= [];
        for (let index = 0; index < 3; index += 1) {
          const id = `${Date.now()}-wedding-convoy-${index}-${Math.random().toString(36).slice(2, 8)}`;
          s.traffic.push({
            id,
            type: 'suv',
            lane: index,
            direction: 1,
            depth: 0.62 + index * 0.13,
            speedKmh: 13 + index * 2,
            color: '#f5f0df',
            event: 'weddingConvoy',
            convoy: 'aure',
            convoyIndex: index,
            passed: false,
            speed: 1,
          });
        }
        cultureAudit.weddingConvoysTriggered += 1;
        this.ui?.toast?.('BIKIN AURE · WEDDING CONVOY AHEAD! Decorated family cars are crossing the route.');
        return;
      }
      return originalUpdateEnvironment.call(this, dt, ...args);
    };
  }
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithKanoCulturalStreetEvents(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { updateCulturalScenes(this, dt, state); }
      catch (error) {
        cultureAudit.notes.push(`Cultural scene update recovered: ${error?.message || String(error)}`);
        if (cultureAudit.notes.length > 12) cultureAudit.notes.shift();
        console.warn('[Kano cultural events] A cultural scene update was skipped safely.', error);
      }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeKanoCulturalStreetEvents(...args) {
      const state = this.kanoCultureState;
      if (state && !state.disposed) {
        state.disposed = true;
        try { state.goatAction?.stop?.(); } catch (_) {}
        try { state.goatMixer?.stopAllAction?.(); } catch (_) {}
        for (const child of state.children || []) {
          child.root?.parent?.remove?.(child.root);
          // GLB clones share model-manager geometry/material; dispose only bowl assets.
          if (child.bowl) disposeUniqueTree(child.bowl);
        }
        if (state.goatRoot) {
          state.goatRoot.parent?.remove?.(state.goatRoot);
          disposeUniqueTree(state.goatRoot);
        }
        cultures.delete(this);
        this.kanoCultureState = null;
      }
      return originalDispose.call(this, ...args);
    };
  }
}

if (typeof window !== 'undefined') {
  window.kanoCulturalStreetEventsAudit = () => ({
    ...cultureAudit,
    activeScenes: [...cultures].map((system) => ({
      lifeScene: system.renderer?.lifeScene || 'unknown',
      children: (system.kanoCultureState?.children || []).map((child) => ({
        path: child.modelPath,
        key: child.modelKey,
        side: child.side,
        z: Number((child.root?.position?.z || 0).toFixed(2)),
      })),
      goatStatus: system.kanoCultureState?.goatStatus || 'not-started',
      goatPosition: system.kanoCultureState?.goatRoot?.position?.toArray?.() || null,
    })),
  });
}

console.info('[Kano cultural events] Bikin Aure convoy decoration, roadside bowl actors, and GLB-first articulated goat crossing registered.');
