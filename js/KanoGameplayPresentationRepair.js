/**
 * KANO LIFE — GAMEPLAY PRESENTATION REPAIR
 *
 * Non-destructive compatibility layer for the existing simulation.
 * - Makes the morning diorama optional instead of mandatory on each visit.
 * - Shows the current overall #1 name and score on the HUD, with local fallback.
 * - Adds visible, animated actors to goat-crossing, KAROTA and water-seller events.
 * - Ensures standalone motorcycle GLBs have a rider when no rider is present.
 * - Adds subtle, animated debris/edge pulse to existing pothole actors.
 * - Reduces generated road-noise gain so the keke engine remains prominent.
 * - Reduces the frequency of motorcycle traffic.
 *
 * The existing game, renderer, model manager and save modules remain authoritative.
 */

import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { ROUTES, DRIVERS } from './config.js';
import { save, persist } from './storage.js';

const RECORD_NAME_KEY = 'kano-life-global-display-name-v1';
const ROUTINE_REPLAY_ID = 'kano-replay-morning-routine';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let activeGame = null;
let activeUI = null;
let activeRenderer = null;
let lastGlobalRecord = { name: '', score: 0, source: 'local' };
let recordFetchAt = 0;
let recordFetchInFlight = false;
let nextEventRootId = 1;

const originalBeginMorningRoutine = UI.prototype.beginMorningRoutine;

// -----------------------------------------------------------------------------
// Shared visual helpers
// -----------------------------------------------------------------------------

function standardMaterial(color, roughness = 0.86, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function addMesh(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], owned = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  if (owned) {
    owned.geometries.push(geometry);
    owned.materials.push(material);
  }
  return mesh;
}

function createOwnedGroup() {
  const group = new THREE.Group();
  group.userData.kanoOwnedGraphics = { geometries: [], materials: [] };
  return group;
}

function disposeOwnedTree(root) {
  if (!root) return;
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const visit = (node, withinClonedModel = false) => {
    const clonedModel = withinClonedModel || node.userData?.modelManagerInstance === true;
    const owned = node.userData?.kanoOwnedGraphics;
    if (owned) {
      for (const geometry of owned.geometries || []) {
        if (!geometry || disposedGeometries.has(geometry)) continue;
        disposedGeometries.add(geometry);
        try { geometry.dispose(); } catch (_) {}
      }
      for (const material of owned.materials || []) {
        if (!material || disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);
        try { material.dispose(); } catch (_) {}
      }
    }
    // ModelManager clones materials for each actor but shares GLB geometry.
    // Dispose actor-owned cloned materials while deliberately keeping geometry
    // and textures alive for the manager's shared cache.
    if (clonedModel && node.isMesh) {
      const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of list) {
        if (!material || disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);
        try { material.dispose(); } catch (_) {}
      }
    }
    for (const child of node.children || []) visit(child, clonedModel);
  };
  visit(root);
  root.parent?.remove(root);
}

function getRendererWorld(renderer) {
  return renderer?.world || renderer?.scene || null;
}

function personRig(options = {}) {
  const skin = standardMaterial(options.skin || '#8b573b');
  const clothing = standardMaterial(options.clothing || '#d4b889');
  const trousers = standardMaterial(options.trousers || '#343e48');
  const headwear = standardMaterial(options.headwear || '#eee0bd');
  const dark = standardMaterial('#22252b');
  const group = createOwnedGroup();
  const owned = group.userData.kanoOwnedGraphics;
  const torso = addMesh(group, new THREE.CapsuleGeometry(0.19, 0.42, 3, 6), clothing, [0, 1.03, 0], [1, 1, 0.72], owned);
  torso.name = 'KanoSimPersonTorso';
  addMesh(group, new THREE.SphereGeometry(0.145, 8, 6), skin, [0, 1.40, 0.015], [0.94, 1.05, 0.94], owned).name = 'KanoSimPersonHead';
  addMesh(group, new THREE.CylinderGeometry(0.145, 0.17, 0.075, 8), headwear, [0, 1.53, 0], [1, 1, 1], owned).name = 'KanoSimPersonCap';
  const armMaterial = clothing;
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.21, 1.22, 0);
    group.add(pivot);
    // The pivot owns no resources itself; the geometry/material remain tracked on root.
    const upper = addMesh(pivot, new THREE.CapsuleGeometry(0.055, 0.24, 2, 5), armMaterial, [side * 0.02, -0.16, 0.015], [1, 1, 0.9], owned);
    upper.rotation.z = side * -0.20;
    upper.name = side < 0 ? 'KanoSimLeftArm' : 'KanoSimRightArm';
    addMesh(pivot, new THREE.SphereGeometry(0.06, 6, 5), skin, [side * 0.045, -0.30, 0.02], [0.88, 0.9, 0.88], owned);
    arms.push(pivot);
  }
  for (const side of [-1, 1]) {
    const leg = addMesh(group, new THREE.CapsuleGeometry(0.065, 0.31, 2, 5), trousers, [side * 0.09, 0.45, 0], [1, 1, 0.94], owned);
    leg.name = side < 0 ? 'KanoSimLeftLeg' : 'KanoSimRightLeg';
    addMesh(group, new THREE.BoxGeometry(0.13, 0.07, 0.21), dark, [side * 0.09, 0.20, -0.035], [1, 1, 1], owned);
  }
  group.userData.kanoPerson = { arms, torso, options, phase: rand(0, Math.PI * 2) };
  return group;
}

// -----------------------------------------------------------------------------
// Event scene actors. They only exist while the associated event is active.
// -----------------------------------------------------------------------------

function createGoat(phase) {
  const group = createOwnedGroup();
  const owned = group.userData.kanoOwnedGraphics;
  const coat = standardMaterial(phase % 2 ? '#c8b49a' : '#e1d6c4');
  const coatDark = standardMaterial('#725b43');
  const hornMat = standardMaterial('#eee3c9');
  const hoof = standardMaterial('#39342f');
  addMesh(group, new THREE.SphereGeometry(0.34, 10, 7), coat, [0, 0.48, 0], [1.35, 0.78, 0.72], owned).name = 'GoatBody';
  addMesh(group, new THREE.SphereGeometry(0.19, 9, 7), coat, [0.30, 0.61, -0.01], [0.85, 0.94, 0.77], owned).name = 'GoatShoulder';
  const head = addMesh(group, new THREE.SphereGeometry(0.16, 9, 7), coat, [0.42, 0.69, -0.11], [0.90, 0.85, 0.80], owned);
  head.name = 'GoatHead';
  addMesh(group, new THREE.ConeGeometry(0.048, 0.25, 6), hornMat, [0.38, 0.87, -0.10], [1, 1, 1], owned).rotation.z = -0.40;
  addMesh(group, new THREE.ConeGeometry(0.048, 0.25, 6), hornMat, [0.49, 0.86, -0.13], [1, 1, 1], owned).rotation.z = 0.38;
  addMesh(group, new THREE.SphereGeometry(0.025, 6, 5), standardMaterial('#171717'), [0.49, 0.72, -0.245], [1, 1, 1], owned);
  addMesh(group, new THREE.CapsuleGeometry(0.045, 0.14, 2, 5), coatDark, [-0.26, 0.68, 0], [0.60, 1, 0.60], owned).rotation.x = 0.3;
  const legs = [];
  for (const x of [-0.19, 0.18]) {
    for (const z of [-0.18, 0.16]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.36, z);
      group.add(pivot);
      addMesh(pivot, new THREE.CylinderGeometry(0.035, 0.025, 0.30, 6), coatDark, [0, -0.14, 0], [1, 1, 1], owned);
      addMesh(pivot, new THREE.BoxGeometry(0.075, 0.04, 0.08), hoof, [0, -0.29, -0.005], [1, 1, 1], owned);
      legs.push(pivot);
    }
  }
  group.userData.kanoGoat = { legs, phase, head, owned };
  group.scale.setScalar(0.95);
  group.rotation.y = -Math.PI / 2;
  return group;
}

function makeKAROTAPatrol(renderer) {
  const root = createOwnedGroup();
  const owned = root.userData.kanoOwnedGraphics;
  // Prefer the existing real game asset first; this group is only the scene mount.
  let vehicle = null;
  try {
    vehicle = renderer.models?.getInstance?.('karota') || renderer.models?.getInstance?.('police') || null;
  } catch (_) {}
  if (vehicle) {
    vehicle.position.set(0, 0.03, -0.9);
    vehicle.rotation.y = Math.PI;
    vehicle.scale.multiplyScalar(0.90);
    root.add(vehicle);
    root.userData.kanoContainsSharedModel = true;
  } else {
    const body = standardMaterial('#f1eee5');
    const dark = standardMaterial('#27364a');
    const tyre = standardMaterial('#202126');
    addMesh(root, new THREE.BoxGeometry(1.25, 0.62, 1.95), body, [0, 0.52, -0.85], [1, 1, 1], owned);
    addMesh(root, new THREE.BoxGeometry(1.05, 0.42, 0.80), dark, [0, 0.98, -0.90], [1, 1, 1], owned);
    addMesh(root, new THREE.BoxGeometry(0.86, 0.22, 0.15), standardMaterial('#e1c85c'), [0, 0.88, -1.67], [1, 1, 1], owned);
    for (const side of [-1, 1]) {
      for (const z of [-1.44, -0.20]) addMesh(root, new THREE.CylinderGeometry(0.19, 0.19, 0.10, 8), tyre, [side * 0.64, 0.23, z], [1, 1, 1], owned).rotation.z = Math.PI / 2;
    }
  }
  const lightBlue = new THREE.MeshBasicMaterial({ color: '#1678ff' });
  const lightRed = new THREE.MeshBasicMaterial({ color: '#ff2838' });
  // Lights are generated by this module, so they are safe to dispose.
  owned.materials.push(lightBlue, lightRed);
  const beaconLeft = addMesh(root, new THREE.SphereGeometry(0.085, 8, 6), lightBlue, [-0.25, 1.37, -0.88], [1.15, 0.70, 1.15], owned);
  const beaconRight = addMesh(root, new THREE.SphereGeometry(0.085, 8, 6), lightRed, [0.25, 1.37, -0.88], [1.15, 0.70, 1.15], owned);
  beaconLeft.name = 'KAROTA Blue Beacon';
  beaconRight.name = 'KAROTA Red Beacon';
  const officer = personRig({ skin: '#805038', clothing: '#d8ddd7', trousers: '#27374d', headwear: '#263b54' });
  officer.position.set(1.35, 0, 0.10);
  officer.scale.setScalar(0.96);
  const officerRig = officer.userData.kanoPerson;
  if (officerRig?.arms?.[1]) officerRig.arms[1].rotation.z = -0.90;
  root.add(officer);
  const barrierBody = addMesh(root, new THREE.BoxGeometry(1.35, 0.14, 0.18), standardMaterial('#efe8d7'), [1.6, 0.55, -1.15], [1, 1, 1], owned);
  barrierBody.name = 'KAROTA road-side barrier';
  for (let i = 0; i < 5; i++) {
    const stripe = addMesh(root, new THREE.BoxGeometry(0.12, 0.145, 0.19), standardMaterial('#c84436'), [1.08 + i * 0.26, 0.55, -1.15], [1, 1, 1], owned);
    stripe.rotation.z = -0.20;
  }
  root.userData.kanoKAROTA = { beaconLeft, beaconRight, officer, barrierBody, time: 0 };
  root.position.set(4.05, 0, -5.8);
  root.rotation.y = -0.16;
  return root;
}

function makeWaterSeller(renderer) {
  const root = createOwnedGroup();
  const owned = root.userData.kanoOwnedGraphics;
  // Use an already-loaded character model if the asset catalogue has one.
  let seller = null;
  try {
    seller = renderer.models?.getInstance?.('passengerMan') || renderer.models?.getInstance?.('passenger') || null;
  } catch (_) {}
  if (seller) {
    seller.position.set(-0.85, 0, -0.20);
    seller.scale.setScalar(0.86);
    root.add(seller);
    root.userData.kanoContainsSharedModel = true;
  } else {
    seller = personRig({ skin: '#8a5338', clothing: '#32a7a0', trousers: '#514536', headwear: '#e7d8ae' });
    seller.position.set(-0.90, 0, -0.20);
    root.add(seller);
  }
  // Compact shade, counter and recognizable sachet-water display.
  const wood = standardMaterial('#735038');
  const canopy = standardMaterial('#d8bf7c');
  const blue = standardMaterial('#59caff', 0.25, { transparent: true, opacity: 0.78 });
  const darkBlue = standardMaterial('#1b6eb1');
  addMesh(root, new THREE.BoxGeometry(1.65, 0.13, 0.72), wood, [-0.70, 0.78, -0.25], [1, 1, 1], owned).name = 'Pure water counter';
  addMesh(root, new THREE.BoxGeometry(1.70, 0.10, 0.80), canopy, [-0.70, 1.90, -0.25], [1, 1, 1], owned).name = 'Water stall canopy';
  for (const x of [-1.48, 0.08]) addMesh(root, new THREE.CylinderGeometry(0.035, 0.035, 1.10, 6), wood, [x, 1.32, -0.48], [1, 1, 1], owned);
  const sign = addMesh(root, new THREE.BoxGeometry(1.36, 0.28, 0.08), darkBlue, [-0.70, 1.56, -0.63], [1, 1, 1], owned);
  sign.name = 'PURE WATER sign';
  // Bottle/sachet forms stand upright on the counter and bob slightly.
  const bottles = [];
  for (let i = 0; i < 5; i++) {
    const bottle = addMesh(root, new THREE.CylinderGeometry(0.055, 0.075, 0.20, 7), blue, [-1.22 + i * 0.25, 0.95, -0.20], [1, 1, 1], owned);
    addMesh(root, new THREE.CylinderGeometry(0.028, 0.028, 0.035, 7), darkBlue, [-1.22 + i * 0.25, 1.07, -0.20], [1, 1, 1], owned);
    bottle.userData.kanoWaterPhase = i * 0.8;
    bottles.push(bottle);
  }
  // A seller's arm gesture remains animated even when the body uses a GLB.
  const wave = new THREE.Group();
  wave.position.set(-0.47, 1.22, -0.22);
  root.add(wave);
  addMesh(wave, new THREE.CapsuleGeometry(0.055, 0.29, 2, 5), standardMaterial('#32a7a0'), [0.08, -0.08, 0], [1, 1, 0.9], owned).rotation.z = -0.45;
  addMesh(wave, new THREE.SphereGeometry(0.055, 6, 5), standardMaterial('#8a5338'), [0.20, 0.08, 0], [1, 1, 1], owned);
  root.userData.kanoWaterSeller = { seller, wave, bottles, time: rand(0, 10), owned };
  root.position.set(-4.3, 0, -5.2);
  root.rotation.y = 0.15;
  return root;
}

function createGoatCrossing(renderer) {
  const root = createOwnedGroup();
  const goatA = createGoat(0);
  const goatB = createGoat(1);
  goatA.position.set(5.9, 0, 0);
  goatB.position.set(6.65, 0, -1.15);
  goatB.scale.setScalar(0.82);
  root.add(goatA, goatB);
  root.userData.kanoGoatCrossing = { goatA, goatB, time: 0 };
  root.position.set(0, 0, -4.1);
  getRendererWorld(renderer)?.add(root);
  return root;
}

function removeEventVisual(renderer) {
  if (!activeRenderer?._kanoEventVisual) return;
  const root = activeRenderer._kanoEventVisual.root;
  if (root) disposeOwnedTree(root);
  activeRenderer._kanoEventVisual = null;
}

function syncEventVisual(renderer) {
  const world = getRendererWorld(renderer);
  const game = activeGame || window.__KANO_LIFE_GAME__;
  const eventType = game?.s?.event || null;
  const supported = ['goatCrossing', 'karota', 'waterSeller'];
  // The driving simulation already owns the road scene. Do not gate these
  // events on the optional life-diorama state; otherwise an old 'home' label
  // can suppress event visuals after the player starts driving directly.
  const desired = supported.includes(eventType) ? eventType : null;
  const current = renderer._kanoEventVisual;
  if (current && (current.type !== desired || !world || current.root.parent !== world)) {
    disposeOwnedTree(current.root);
    renderer._kanoEventVisual = null;
  }
  if (!desired || !world || renderer._kanoEventVisual) return;
  let root = null;
  if (desired === 'goatCrossing') root = createGoatCrossing(renderer);
  if (desired === 'karota') {
    root = makeKAROTAPatrol(renderer);
    world.add(root);
  }
  if (desired === 'waterSeller') {
    root = makeWaterSeller(renderer);
    world.add(root);
  }
  if (root) {
    root.userData.kanoEventRootId = nextEventRootId++;
    renderer._kanoEventVisual = { type: desired, root, time: 0 };
  }
}

function animateEventVisual(renderer, dt) {
  const visual = renderer._kanoEventVisual;
  if (!visual?.root?.parent) return;
  const step = clamp(dt || 1 / 60, 0, 0.05);
  visual.time += step;
  const data = visual.root.userData;
  if (visual.type === 'goatCrossing') {
    const cross = data.kanoGoatCrossing;
    if (!cross) return;
    cross.time += step;
    for (const [i, goat] of [cross.goatA, cross.goatB].entries()) {
      const phase = cross.time * 7.5 + i * 1.4;
      const direction = -1;
      goat.position.x += direction * step * (0.62 + i * 0.08);
      if (goat.position.x < -6.4) goat.position.x = 6.5 + i * 0.6;
      const rig = goat.userData.kanoGoat;
      if (rig) {
        rig.legs.forEach((leg, legIndex) => { leg.rotation.x = Math.sin(phase + (legIndex % 2) * Math.PI) * 0.42; });
        rig.head.rotation.z = Math.sin(phase * 0.35) * 0.05;
        goat.position.y = Math.abs(Math.sin(phase * 2)) * 0.018;
      }
    }
  } else if (visual.type === 'karota') {
    const patrol = data.kanoKAROTA;
    if (!patrol) return;
    patrol.time += step;
    patrol.beaconLeft.visible = Math.sin(patrol.time * 12) > 0;
    patrol.beaconRight.visible = Math.sin(patrol.time * 12 + Math.PI) > 0;
    const officer = patrol.officer.userData?.kanoPerson;
    if (officer?.arms?.[1]) officer.arms[1].rotation.z = -0.70 - Math.max(0, Math.sin(patrol.time * 2.1)) * 0.65;
    patrol.officer.position.y = Math.sin(patrol.time * 2) * 0.015;
  } else if (visual.type === 'waterSeller') {
    const vendor = data.kanoWaterSeller;
    if (!vendor) return;
    vendor.time += step;
    vendor.wave.rotation.z = -0.55 + Math.sin(vendor.time * 3.2) * 0.52;
    vendor.seller.position.y = Math.sin(vendor.time * 2.1) * 0.025;
    vendor.bottles.forEach((bottle) => { bottle.position.y = 0.95 + Math.sin(vendor.time * 3 + bottle.userData.kanoWaterPhase) * 0.025; });
    const rig = vendor.seller.userData?.kanoPerson;
    if (rig?.arms?.[1]) rig.arms[1].rotation.z = -0.45 - Math.max(0, Math.sin(vendor.time * 3.2)) * 0.30;
  }
}

// -----------------------------------------------------------------------------
// Pothole presentation: dynamic edge warning + chips/loose material.
// -----------------------------------------------------------------------------

const potholeActors = new Set();
const addedRiderGroups = new Set();
const originalMakePotholeActor = Renderer3D.prototype.makePotholeActor;
if (typeof originalMakePotholeActor === 'function') {
  Renderer3D.prototype.makePotholeActor = function patchedMakePotholeActor(zone) {
    const actor = originalMakePotholeActor.call(this, zone);
    if (!actor || actor.userData?.kanoPotholeFX) return actor;
    const owned = actor.userData.kanoOwnedGraphics || { geometries: [], materials: [] };
    actor.userData.kanoOwnedGraphics = owned;
    const rockMaterial = standardMaterial('#9a8a72');
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + rand(-0.16, 0.16);
      const radius = rand(0.30, 0.53);
      const rock = addMesh(
        actor,
        new THREE.DodecahedronGeometry(rand(0.045, 0.095), 0),
        rockMaterial,
        [Math.cos(angle) * radius, rand(0.015, 0.045), Math.sin(angle) * radius],
        [rand(0.75, 1.3), rand(0.45, 0.8), rand(0.75, 1.2)],
        owned,
      );
      rock.rotation.set(rand(-0.5, 0.5), rand(0, Math.PI), rand(-0.5, 0.5));
      rock.userData.kanoPotholePhase = i * 0.7;
    }
    const warningRing = actor.userData.potholeWarning || actor.userData.warningRing || null;
    actor.userData.kanoPotholeFX = { warningRing, time: rand(0, 10) };
    potholeActors.add(actor);
    return actor;
  };
}

function animatePotholes(dt) {
  const step = clamp(dt || 1 / 60, 0, 0.05);
  for (const actor of potholeActors) {
    if (!actor.parent) { potholeActors.delete(actor); disposeOwnedTree(actor); continue; }
    const fx = actor.userData?.kanoPotholeFX;
    if (!fx) continue;
    fx.time += step;
    if (fx.warningRing?.material) {
      const material = fx.warningRing.material;
      if ('opacity' in material) {
        material.transparent = true;
        material.opacity = 0.42 + (Math.sin(fx.time * 5) + 1) * 0.16;
      }
      if (material.emissive && material.emissive.set) material.emissive.set('#8b251f');
    }
    for (const child of actor.children) {
      if (child.userData?.kanoPotholePhase !== undefined) {
        child.rotation.y += step * 0.25;
        child.position.y = 0.025 + Math.abs(Math.sin(fx.time * 3.2 + child.userData.kanoPotholePhase)) * 0.024;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Motorcycle riders. Original fallback traffic already has a rider; GLB actors
// get a compact rider only when their hierarchy does not advertise one.
// -----------------------------------------------------------------------------

function hasNamedRider(actor) {
  let found = false;
  actor?.traverse?.((obj) => {
    if (/(rider|motorist|driver|helmet|humanoid|pedestrian|person)/i.test(obj.name || '')) found = true;
  });
  return found;
}

function addMotorcycleRider(actor) {
  if (!actor || actor.userData?.kanoRiderAdded || actor.userData?.kanoGeneratedTraffic) return;
  if (hasNamedRider(actor)) {
    actor.userData.kanoRiderPresent = true;
    return;
  }
  const rig = createOwnedGroup();
  const owned = rig.userData.kanoOwnedGraphics;
  const jacket = standardMaterial('#202b37');
  const trousers = standardMaterial('#343841');
  const skin = standardMaterial('#85543c');
  const helmet = standardMaterial('#f2c542', 0.42, { metalness: 0.04 });
  addMesh(rig, new THREE.CapsuleGeometry(0.14, 0.34, 3, 6), jacket, [0, 0.98, 0], [0.95, 1, 0.85], owned).name = 'Rider torso';
  addMesh(rig, new THREE.SphereGeometry(0.13, 8, 6), skin, [0, 1.29, -0.025], [0.93, 1, 0.9], owned).name = 'Rider head';
  addMesh(rig, new THREE.SphereGeometry(0.15, 9, 6), helmet, [0, 1.34, -0.025], [1.02, 0.95, 1.02], owned).name = 'Rider helmet';
  addMesh(rig, new THREE.BoxGeometry(0.18, 0.035, 0.08), standardMaterial('#161a20'), [0, 1.34, -0.154], [1, 1, 1], owned);
  for (const side of [-1, 1]) {
    const arm = addMesh(rig, new THREE.CapsuleGeometry(0.045, 0.27, 2, 5), jacket, [side * 0.16, 1.00, -0.16], [1, 1, 1], owned);
    arm.rotation.z = side * -0.52;
    const leg = addMesh(rig, new THREE.CapsuleGeometry(0.06, 0.27, 2, 5), trousers, [side * 0.105, 0.62, 0.08], [1, 1, 0.95], owned);
    leg.rotation.x = -0.40;
  }
  rig.position.set(0, 0.04, 0.02);
  rig.name = 'KanoMotorcycleRider';
  actor.add(rig);
  actor.userData.kanoRiderAdded = rig;
  addedRiderGroups.add(rig);
}

const originalSyncTraffic = Renderer3D.prototype.syncTraffic;
if (typeof originalSyncTraffic === 'function') {
  Renderer3D.prototype.syncTraffic = function patchedSyncTraffic(state, ...rest) {
    const result = originalSyncTraffic.call(this, state, ...rest);
    const traffic = state?.traffic || activeGame?.s?.traffic || [];
    for (const vehicle of traffic) {
      if (vehicle.type !== 'motorcycle') continue;
      const actor = this.trafficActors?.get?.(vehicle.id) || this.trafficActors?.[vehicle.id];
      if (!actor) continue;
      // ModelManager marks every cloned GLB root. Use that stable metadata
      // rather than monkey-patching getInstance on every rendered frame.
      if (actor.userData?.modelManagerInstance || actor.userData?.modelKey === 'motorcycle') {
        actor.userData.kanoLoadedTrafficModel = true;
        addMotorcycleRider(actor);
      } else if (hasNamedRider(actor)) {
        actor.userData.kanoRiderPresent = true;
      }
      // Renderer-generated fallback motorcycles already have a seated rider.
      const rider = actor.userData?.kanoRiderAdded;
      if (rider) {
        const t = this._kanoPresentationTime || 0;
        rider.rotation.z = Math.sin(t * 3.8 + (vehicle.lane || 0)) * 0.018;
        rider.position.y = 0.04 + Math.abs(Math.sin(t * 5.4 + (vehicle.lane || 0))) * 0.018;
      }
    }
    return result;
  };
}

// Mark renderer-generated motorcycle fallbacks so their prebuilt riders are not duplicated.
const originalMakeTrafficActor = Renderer3D.prototype.makeTrafficActor;
if (typeof originalMakeTrafficActor === 'function') {
  Renderer3D.prototype.makeTrafficActor = function patchedMakeTrafficActor(vehicle, ...rest) {
    const manager = this.models;
    const originalGetInstance = manager?.getInstance;
    let returnedModel = null;
    if (typeof originalGetInstance === 'function') {
      manager.getInstance = function observedGetInstance(...args) {
        const instance = originalGetInstance.apply(this, args);
        if (instance && typeof instance === 'object') returnedModel = instance;
        return instance;
      };
    }
    let actor;
    try {
      actor = originalMakeTrafficActor.call(this, vehicle, ...rest);
    } finally {
      if (manager && originalGetInstance) manager.getInstance = originalGetInstance;
    }
    if (actor && vehicle?.type === 'motorcycle') {
      if (actor === returnedModel) actor.userData.kanoLoadedTrafficModel = true;
      else actor.userData.kanoGeneratedTraffic = true;
    }
    return actor;
  };
}

// -----------------------------------------------------------------------------
// Traffic mix: keep motorcycles present but not overwhelming.
// -----------------------------------------------------------------------------

const originalSpawnTraffic = Game.prototype.spawnTraffic;
if (typeof originalSpawnTraffic === 'function') {
  Game.prototype.spawnTraffic = function patchedSpawnTraffic(...args) {
    const before = new Set((this.s?.traffic || []).map((v) => v.id));
    const result = originalSpawnTraffic.apply(this, args);
    const added = (this.s?.traffic || []).filter((v) => !before.has(v.id));
    for (const vehicle of added) {
      const r = Math.random();
      if (r < 0.40) vehicle.type = 'keke';
      else if (r < 0.50) vehicle.type = 'motorcycle';
      else if (r < 0.75) vehicle.type = 'car';
      else if (r < 0.88) vehicle.type = 'taxi';
      else if (r < 0.96) vehicle.type = 'suv';
      else vehicle.type = this.mobile ? 'car' : (Math.random() < 0.6 ? 'bus' : 'truck');
    }
    return result;
  };
}

// -----------------------------------------------------------------------------
// Engine dominance: reduce generated rolling/road noise after each engine tick.
// -----------------------------------------------------------------------------

const originalEngine = AudioManager.prototype.engine;
if (typeof originalEngine === 'function') {
  AudioManager.prototype.engine = function patchedEngine(signedSpeed, ...rest) {
    const result = originalEngine.call(this, signedSpeed, ...rest);
    try {
      const ctx = this.ctx || this.audioContext || this.context;
      const now = ctx?.currentTime || 0;
      const speed = Math.abs(Number(signedSpeed) || 0);
      const roadGain = this.roadNoiseGain?.gain;
      if (roadGain) {
        // Previous gain rose to around 0.01. Cap it well below the sampled engine.
        const value = speed > 0.2 ? clamp(speed * 0.000007, 0.00005, 0.00062) : 0.000025;
        if (typeof roadGain.setTargetAtTime === 'function') roadGain.setTargetAtTime(value, now, 0.08);
        else roadGain.value = value;
      }
      const engineGain = this.engineAudio;
      if (engineGain && speed > 1.0 && !this.muted && this.enabled !== false) {
        engineGain.volume = Math.max(0.28, Math.min(0.82, engineGain.volume || 0.28));
      }
    } catch (_) {}
    return result;
  };
}

// -----------------------------------------------------------------------------
// Game/UI flow: normal login starts driving; morning routine is opt-in.
// -----------------------------------------------------------------------------

const originalStart = Game.prototype.start;
Game.prototype.start = function patchedStart(...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  return originalStart.apply(this, args);
};
const originalTick = Game.prototype.tick;
Game.prototype.tick = function patchedTick(dt, ...rest) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  return originalTick.call(this, dt, ...rest);
};
const originalBeginEvent = Game.prototype.beginEvent;
if (typeof originalBeginEvent === 'function') {
  Game.prototype.beginEvent = function patchedBeginEvent(type, ...rest) {
    activeGame = this;
    window.__KANO_LIFE_GAME__ = this;
    return originalBeginEvent.call(this, type, ...rest);
  };
}

function selectedValue(id, fallback = '') {
  return document.getElementById(id)?.value || fallback;
}

function startSelectedRun(ui) {
  const game = ui?.game || ui?.__kanoBoundGame || activeGame || window.__KANO_LIFE_GAME__;
  if (!game) return;
  const routeId = selectedValue('route-select', save.routeId || ROUTES[0]?.id);
  const driverId = selectedValue('driver-select', save.driverId || DRIVERS[0]?.id);
  const mode = selectedValue('mode-select', game.mode || 'career');
  if (ROUTES.some((route) => route.id === routeId)) save.routeId = routeId;
  if (DRIVERS.some((driver) => driver.id === driverId)) save.driverId = driverId;
  save.lastMode = mode;
  try { persist(); } catch (_) {}
  game.start(mode);
}

UI.prototype.beginMorningRoutine = function beginRoutineOrDrive() {
  activeUI = this;
  // Every visit/login must not force the lengthy diorama. The routine remains
  // available via its own explicit button for players who choose to watch it.
  startSelectedRun(this);
};

const originalUIBind = UI.prototype.bind;
UI.prototype.bind = function patchedUIBind(game, ...rest) {
  const result = originalUIBind.call(this, game, ...rest);
  this.game = game;
  this.__kanoBoundGame = game;
  activeUI = this;
  activeGame = game;
  window.__KANO_LIFE_GAME__ = game;
  installGameplayPresentationUI(this);
  refreshOverallRecord(true);
  return result;
};

function installGameplayPresentationUI(ui) {
  injectPresentationStyles();
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.textContent = 'START DRIVING';
    startBtn.setAttribute('aria-label', 'Start driving immediately');
  }
  const startActions = document.querySelector('.start-actions');
  if (startActions && !document.getElementById(ROUTINE_REPLAY_ID)) {
    const routineButton = document.createElement('button');
    routineButton.type = 'button';
    routineButton.id = ROUTINE_REPLAY_ID;
    routineButton.className = 'secondary';
    routineButton.textContent = 'REPLAY MORNING ROUTINE';
    routineButton.title = 'Play the animated morning story before driving';
    routineButton.addEventListener('click', () => {
      if (typeof originalBeginMorningRoutine === 'function') {
        originalBeginMorningRoutine.call(ui);
      }
    });
    startActions.appendChild(routineButton);
  }
  const hudBottom = document.querySelector('#hud .hud-bottom');
  if (hudBottom && !document.getElementById('kano-overall-record')) {
    const badge = document.createElement('span');
    badge.id = 'kano-overall-record';
    badge.className = 'kano-overall-record';
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = 'OVERALL #1 · Loading…';
    hudBottom.appendChild(badge);
  }
  const startMeta = document.querySelector('#start-screen .start-meta');
  if (startMeta && !document.getElementById('kano-start-record')) {
    const line = document.createElement('span');
    line.id = 'kano-start-record';
    line.className = 'kano-start-record';
    line.textContent = 'OVERALL HIGH SCORE · Loading…';
    startMeta.appendChild(line);
  }
  if (!window.__kanoRecordRefreshBound) {
    window.__kanoRecordRefreshBound = true;
    window.addEventListener('kano:global-score-submitted', () => refreshOverallRecord(true));
    window.addEventListener('storage', (event) => {
      if (event.key === 'kano-life-save-v4' || event.key === RECORD_NAME_KEY) refreshOverallRecord(true);
    });
    window.setInterval(() => {
      if (!document.hidden) refreshOverallRecord(false);
    }, 60000);
  }
}

let stylesInjected = false;
function injectPresentationStyles() {
  if (stylesInjected || document.getElementById('kano-presentation-repair-css')) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'kano-presentation-repair-css';
  style.textContent = `
    #kano-replay-morning-routine { flex: 1 1 100%; min-height: 34px; font-size: 10px; }
    .kano-overall-record { display:inline-flex; align-items:center; gap:4px; max-width:100%; padding:4px 7px; border-radius:8px; border:1px solid #f5c54270; background:rgba(8,17,28,.76); color:#ffe18b; font-size:9px; font-weight:800; line-height:1.25; white-space:normal; }
    .kano-start-record { display:block; flex:1 1 100%; color:#f5d77d; font-size:11px; font-weight:800; padding-top:4px; }
    #hud .hud-bottom { row-gap:5px; }
    #event-card { background:rgba(9,17,27,.70)!important; backdrop-filter:blur(2px); }
    @media (max-width:520px) { .kano-overall-record { font-size:8px; padding:3px 5px; } .kano-start-record { font-size:10px; } }
  `;
  document.head.appendChild(style);
}

function displayNameFallback() {
  try {
    const stored = localStorage.getItem(RECORD_NAME_KEY);
    if (stored && stored.trim()) return stored.trim().slice(0, 28);
  } catch (_) {}
  return save.playerName || save.displayName || 'You';
}

function scoreNumber(row) {
  const value = row?.score ?? row?.highScore ?? row?.points ?? row?.bestScore ?? 0;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function rowName(row) {
  return String(row?.displayName || row?.name || row?.playerName || row?.username || row?.driver || 'Player').trim().slice(0, 28) || 'Player';
}

function renderOverallRecord(record) {
  const scoreText = `₦${Math.floor(record.score).toLocaleString('en-NG')}`;
  const label = record.source === 'global' ? `OVERALL #1 · ${record.name} · ${scoreText}` : `PERSONAL BEST · ${record.name} · ${scoreText}`;
  const hudBadge = document.getElementById('kano-overall-record');
  const startBadge = document.getElementById('kano-start-record');
  if (hudBadge) hudBadge.textContent = label;
  if (startBadge) startBadge.textContent = record.source === 'global'
    ? `OVERALL HIGH SCORE · #1 ${record.name} · ${scoreText}`
    : `PERSONAL BEST · ${record.name} · ${scoreText} (global board unavailable)`;
}

async function refreshOverallRecord(force) {
  if (recordFetchInFlight) return;
  const now = Date.now();
  if (!force && now - recordFetchAt < 55000) {
    renderOverallRecord(lastGlobalRecord);
    return;
  }
  recordFetchAt = now;
  recordFetchInFlight = true;
  const localRecord = {
    name: displayNameFallback(),
    score: Number(save.highScore) || 0,
    source: 'local',
  };
  lastGlobalRecord = localRecord;
  renderOverallRecord(localRecord);
  try {
    const response = await fetch('/api/leaderboard?board=all&limit=1', {
      method: 'GET', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const payload = await response.json();
      const rowCandidates = [
        payload?.entries, payload?.rows, payload?.leaderboard, payload?.scores,
        payload?.results, payload?.data?.entries, payload?.data?.rows,
        payload?.data?.scores, payload?.data,
      ];
      const rows = Array.isArray(payload) ? payload : (rowCandidates.find(Array.isArray) || []);
      if (Array.isArray(rows) && rows.length) {
        const row = [...rows].sort((a, b) => scoreNumber(b) - scoreNumber(a))[0];
        const name = rowName(row);
        const score = scoreNumber(row);
        // If a board endpoint is available but empty/zero, preserve the local fallback.
        if (name && (score > 0 || localRecord.score === 0)) {
          lastGlobalRecord = { name, score, source: 'global' };
        }
      }
    }
  } catch (_) {
    // Offline/global service missing: local best remains clearly labelled.
  } finally {
    recordFetchInFlight = false;
    renderOverallRecord(lastGlobalRecord);
  }
}

function cleanupDetachedRiders(renderer) {
  const world = getRendererWorld(renderer);
  if (!world) return;
  for (const rider of addedRiderGroups) {
    let node = rider;
    let attachedToWorld = false;
    while (node) {
      if (node === world) { attachedToWorld = true; break; }
      node = node.parent;
    }
    if (!attachedToWorld) {
      addedRiderGroups.delete(rider);
      disposeOwnedTree(rider);
    }
  }
}

// -----------------------------------------------------------------------------
// Bind the renderer lifecycle before main.js constructs the renderer/game.
// -----------------------------------------------------------------------------

const originalDraw = Renderer3D.prototype.draw;
if (typeof originalDraw === 'function') {
  Renderer3D.prototype.draw = function patchedDraw(state, dt, ...rest) {
    activeRenderer = this;
    this._kanoPresentationTime = (this._kanoPresentationTime || 0) + clamp(Number(dt) || 1 / 60, 0, 0.05);
    this._kanoPresentationDelta = clamp(Number(dt) || 1 / 60, 0, 0.05);
    if (activeGame) window.__KANO_LIFE_GAME__ = activeGame;
    try {
      syncEventVisual(this);
      animateEventVisual(this, this._kanoPresentationDelta);
      animatePotholes(this._kanoPresentationDelta);
      cleanupDetachedRiders(this);
    } catch (error) {
      // Optional presentation layer must never interrupt the core renderer.
      if (!this._kanoPresentationWarned) {
        this._kanoPresentationWarned = true;
        console.warn('[Kano Life] Presentation actor update skipped safely.', error);
      }
    }
    return originalDraw.call(this, state, dt, ...rest);
  };
}

// Keep the optional actors attached to the correct scene if the renderer is rebuilt.
window.addEventListener('pagehide', () => {
  if (activeRenderer) removeEventVisual(activeRenderer);
});

// Apply patches before importing main.js so the original startup constructs only
// one renderer, one game and one UI. Other entry-point modules remain untouched.
await import('./main.js');
