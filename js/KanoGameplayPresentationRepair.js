/**
 * KANO LIFE — PRESENTATION, WORKSHOP EXPORT/IMPORT + PERSISTENT VEHICLE DAMAGE
 *
 * Production-safe additive repair layer. Core simulation/storage remains in
 * Game, UI and Renderer3D. This module is loaded by index.html and imports
 * main.js only after its compatibility hooks are registered.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { ROUTES, DRIVERS } from './config.js';
import { save, persist } from './storage.js';
import { KanoVehicleLifecycleDirector } from './KanoVehicleLifecycleDirector.js';

const RECORD_NAME_KEY = 'kano-life-global-display-name-v1';
const SCORE_ENDPOINT = '/api/leaderboard?board=all&limit=1';
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const random = (min, max) => min + Math.random() * (max - min);

let activeGame = null;
let activeUI = null;
let activeRenderer = null;
let lastRecord = { name: 'Kano Driver', score: 0, source: 'local' };
let recordRequestAt = 0;
let recordRequestInFlight = false;
let recordRefreshTimer = null;
const riderGroups = new Set();
const potholeActors = new Set();
const rendererQualityStates = new WeakMap();

// Adaptive rendering clarity: start sharp, then trade a small amount of pixel
// density for steadier frame pacing on slower phones. This touches rendering
// only; it does not alter simulation speed, physics, collision, or traffic.
function findWebGLRenderer(owner) {
  const candidates = [
    owner?.renderer, owner?.webglRenderer, owner?.glRenderer,
    owner?.threeRenderer, owner?._renderer, owner?.webgl, owner?.renderContext,
  ];
  return candidates.find((candidate) => candidate
    && typeof candidate.setPixelRatio === 'function'
    && typeof candidate.setSize === 'function'
    && candidate.domElement) || null;
}

function tuneRendererForClarity(owner) {
  const gl = findWebGLRenderer(owner);
  if (!gl) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let state = rendererQualityStates.get(gl);

  if (!state) {
    try {
      const touchDevice = (navigator.maxTouchPoints || 0) > 0
        || window.matchMedia?.('(max-width: 760px)').matches;
      const deviceRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
      const maxRatio = Math.min(deviceRatio, touchDevice ? 2.0 : 2.25);
      const canvas = gl.domElement;
      state = {
        touchDevice,
        maxRatio,
        minRatio: 1.0,
        ratio: maxRatio,
        lastFrameAt: now,
        slowSince: 0,
        stableSince: 0,
        lastChangeAt: now,
        warningShown: false,
      };
      gl.setPixelRatio(state.ratio);

      // Match browser display colour space where supported. Do not replace an
      // existing custom tone-mapping pipeline owned by the game renderer.
      if ('outputColorSpace' in gl && THREE.SRGBColorSpace) {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }
      if (gl.toneMapping === THREE.NoToneMapping && THREE.ACESFilmicToneMapping !== undefined) {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = Math.max(1, Number(gl.toneMappingExposure) || 1);
      }
      if (canvas?.style) {
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.imageRendering = 'auto';
        canvas.style.webkitTapHighlightColor = 'transparent';
      }
      rendererQualityStates.set(gl, state);
      console.info(`[Kano Life] adaptive 3D clarity enabled · ${state.ratio.toFixed(2)}x initial pixel ratio`);
      console.info('[Kano Life] responsive player keke suspension and chassis motion registered.');
      return;
    } catch (error) {
      if (!owner._kanoClarityWarningShown) {
        owner._kanoClarityWarningShown = true;
        console.warn('[Kano Life] 3D clarity tuning skipped; retaining native renderer settings.', error);
      }
      return;
    }
  }

  // Ignore background-tab suspension and long pauses; they are not GPU
  // performance samples and should not force the game to a blurry resolution.
  if (document.hidden) {
    state.lastFrameAt = now;
    state.slowSince = 0;
    state.stableSince = 0;
    return;
  }
  const interval = now - state.lastFrameAt;
  state.lastFrameAt = now;
  if (!Number.isFinite(interval) || interval <= 0 || interval > 1000) {
    state.slowSince = 0;
    state.stableSince = 0;
    return;
  }

  // Sustained frame intervals above 24 ms indicate visible hitching. Lower
  // DPR gradually and impose a one-second cooldown to prevent oscillation.
  if (interval > 24) {
    state.slowSince ||= now;
    state.stableSince = 0;
    if (now - state.slowSince >= 1100 && now - state.lastChangeAt >= 900) {
      const nextRatio = Math.max(state.minRatio, Math.round((state.ratio - 0.15) * 100) / 100);
      if (nextRatio < state.ratio) {
        try {
          gl.setPixelRatio(nextRatio);
          state.ratio = nextRatio;
          state.lastChangeAt = now;
          console.info(`[Kano Life] 3D resolution adapted to ${nextRatio.toFixed(2)}x for smoother mobile gameplay`);
        } catch (_) {}
      }
      state.slowSince = now;
    }
    return;
  }

  state.slowSince = 0;
  // Restore detail only after several seconds of consistently smooth frames.
  if (interval < 18.5 && state.ratio + 0.01 < state.maxRatio) {
    state.stableSince ||= now;
    if (now - state.stableSince >= 4500 && now - state.lastChangeAt >= 4000) {
      const nextRatio = Math.min(state.maxRatio, Math.round((state.ratio + 0.10) * 100) / 100);
      try {
        gl.setPixelRatio(nextRatio);
        state.ratio = nextRatio;
        state.lastChangeAt = now;
        console.info(`[Kano Life] 3D detail restored to ${nextRatio.toFixed(2)}x after stable frames`);
      } catch (_) {}
      state.stableSince = now;
    }
  } else {
    state.stableSince = 0;
  }
}

// Preserve the original story function so the morning routine remains optional.
const originalResetRun = Game.prototype.resetRun;
const originalHitTraffic = Game.prototype.hit;
const originalHitPothole = Game.prototype.hitPothole;
const originalBeginMorningRoutine = UI.prototype.beginMorningRoutine;
const originalUIBind = UI.prototype.bind;
const originalSetReverse = Game.prototype.setReverse;
const originalGameStart = Game.prototype.start;
const originalGameTick = Game.prototype.tick;
const originalSpawnTraffic = Game.prototype.spawnTraffic;
const originalRendererDraw = Renderer3D.prototype.draw;
const originalAnimateFallbackDriver = Renderer3D.prototype.animateFallbackDriver;
const originalSyncTraffic = Renderer3D.prototype.syncTraffic;
const originalMakeTrafficActor = Renderer3D.prototype.makeTrafficActor;
const originalMakePothole = Renderer3D.prototype.makePotholeActor;
const originalAudioEngine = AudioManager.prototype.engine;

// -----------------------------------------------------------------------------
// Small owned Three.js scene helpers
// -----------------------------------------------------------------------------
function makeRoot(name) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.kanoRepairResources = { geometries: [], materials: [] };
  return root;
}
function resourceOwner(node) {
  let current = node;
  while (current) {
    if (current.userData?.kanoRepairResources) return current;
    current = current.parent;
  }
  throw new TypeError('Kano presentation object has no resource owner.');
}
function makeMaterial(root, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
  resourceOwner(root).userData.kanoRepairResources.materials.push(material);
  return material;
}
function makeMesh(root, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  resourceOwner(root).userData.kanoRepairResources.geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}
function disposeRoot(root) {
  if (!root) return;

  // Owned resources may live on nested groups, especially the individual goats
  // in a crossing. Collect only explicitly owned resources so shared GLB assets
  // and the original renderer's geometry/materials are never disposed here.
  const geometries = new Set();
  const materials = new Set();
  const collect = (node) => {
    const resources = node?.userData?.kanoRepairResources;
    for (const geometry of resources?.geometries || []) {
      if (geometry && typeof geometry.dispose === 'function') geometries.add(geometry);
    }
    for (const material of resources?.materials || []) {
      if (material && typeof material.dispose === 'function') materials.add(material);
    }
  };
  if (typeof root.traverse === 'function') root.traverse(collect);
  else collect(root);

  root.parent?.remove(root);
  for (const geometry of geometries) {
    try { geometry.dispose(); } catch (_) {}
  }
  for (const material of materials) {
    try { material.dispose(); } catch (_) {}
  }
  root.clear?.();
}
function worldFor(renderer) {
  return renderer?.world?.isObject3D ? renderer.world : renderer?.scene?.isObject3D ? renderer.scene : null;
}

function makeGoat(index) {
  const goat = new THREE.Group();
  goat.name = `KanoCrossingGoat${index + 1}`;
  goat.userData.kanoGoatRig = { legs: [], time: index * 1.3, baseY: 0 };
  const coat = new THREE.MeshStandardMaterial({ color: index % 2 ? '#c9b393' : '#e1d6c5', roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: '#554338', roughness: 0.94 });
  const horn = new THREE.MeshStandardMaterial({ color: '#e8d7ad', roughness: 0.8 });
  const resources = { geometries: [], materials: [coat, dark, horn] };
  goat.userData.kanoRepairResources = resources;
  const add = (geometry, material, position, scale = [1, 1, 1]) => {
    resources.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    goat.add(mesh);
    return mesh;
  };
  add(new THREE.SphereGeometry(0.34, 10, 7), coat, [0, 0.55, 0], [1.32, 0.62, 0.72]);
  add(new THREE.SphereGeometry(0.18, 9, 7), coat, [-0.37, 0.72, 0.015], [0.88, 0.82, 0.8]);
  add(new THREE.SphereGeometry(0.10, 8, 6), dark, [-0.47, 0.68, 0.11], [0.8, 0.62, 0.55]);
  add(new THREE.SphereGeometry(0.035, 6, 5), dark, [-0.43, 0.77, 0.15]);
  for (const side of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.065, 0.18, 6), coat, [-0.40, 0.87, side * 0.12], [0.8, 1, 0.55]);
    ear.rotation.z = side * -0.62;
    const hornMesh = add(new THREE.ConeGeometry(0.035, 0.16, 6), horn, [-0.27, 0.94, side * 0.10]);
    hornMesh.rotation.z = -0.35;
  }
  for (const x of [-0.23, 0.22]) {
    for (const z of [-0.13, 0.13]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.45, z);
      goat.add(pivot);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.027, 0.29, 6), dark);
      leg.position.y = -0.13;
      pivot.add(leg);
      resources.geometries.push(leg.geometry);
      goat.userData.kanoGoatRig.legs.push(pivot);
    }
  }
  return goat;
}
function createGoatCrossing(renderer) {
  const root = makeRoot('Kano Animated Goat Crossing');
  const first = makeGoat(0);
  const second = makeGoat(1);
  first.position.set(4.55, 0, 0.05);
  second.position.set(5.15, 0, -0.68);
  second.scale.setScalar(0.84);
  root.add(first, second);
  root.userData.kanoEvent = { type: 'goatCrossing', actors: [first, second], time: 0 };
  root.position.set(0, 0, -2.95);
  worldFor(renderer)?.add(root);
  return root;
}

function createOfficerRig(root) {
  const skin = makeMaterial(root, '#805038');
  const shirt = makeMaterial(root, '#e0e3df');
  const trousers = makeMaterial(root, '#28374a');
  const cap = makeMaterial(root, '#263b54');
  const body = makeMesh(root, new THREE.CapsuleGeometry(0.16, 0.36, 3, 7), shirt, [0, 0.96, 0], [0.9, 1, 0.72]);
  body.name = 'KAROTA officer torso';
  makeMesh(root, new THREE.SphereGeometry(0.13, 8, 6), skin, [0, 1.30, 0.01]);
  makeMesh(root, new THREE.CylinderGeometry(0.14, 0.16, 0.07, 8), cap, [0, 1.41, 0]);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 1.13, 0);
    root.add(pivot);
    const arm = makeMesh(root, new THREE.CapsuleGeometry(0.045, 0.24, 2, 5), shirt, [0, 0, 0], [1, 1, 0.9]);
    pivot.add(arm);
    arm.position.set(side * 0.02, -0.15, 0.01);
    arms.push(pivot);
  }
  for (const side of [-1, 1]) makeMesh(root, new THREE.CapsuleGeometry(0.055, 0.28, 2, 5), trousers, [side * 0.08, 0.40, 0], [1, 1, 1]);
  return { arms, body };
}
function createKarotaCheckpoint(renderer) {
  const root = makeRoot('KAROTA Checkpoint Patrol');
  const white = makeMaterial(root, '#e4e8e7');
  const dark = makeMaterial(root, '#202933');
  const blue = makeMaterial(root, '#164d83');
  const tyre = makeMaterial(root, '#161a1e');
  const glass = makeMaterial(root, '#80a6b7', { metalness: 0.05, roughness: 0.3 });
  const lampBlue = new THREE.MeshBasicMaterial({ color: '#187bff' });
  const lampRed = new THREE.MeshBasicMaterial({ color: '#fb3342' });
  root.userData.kanoRepairResources.materials.push(lampBlue, lampRed);
  const car = new THREE.Group();
  car.position.set(0, 0, -0.3);
  root.add(car);
  makeMesh(car, new THREE.BoxGeometry(1.9, 0.62, 1.08), white, [0, 0.62, 0]);
  makeMesh(car, new THREE.BoxGeometry(0.95, 0.34, 0.88), glass, [0.18, 1.08, -0.04]);
  makeMesh(car, new THREE.BoxGeometry(1.84, 0.15, 1.1), blue, [0, 0.70, 0.02]);
  makeMesh(car, new THREE.BoxGeometry(0.55, 0.12, 0.18), dark, [0, 0.72, 0.57]);
  for (const x of [-0.70, 0.70]) for (const z of [-0.42, 0.42]) {
    const wheel = makeMesh(car, new THREE.CylinderGeometry(0.18, 0.18, 0.11, 10), tyre, [x, 0.25, z]);
    wheel.rotation.z = Math.PI / 2;
  }
  const beaconLeft = makeMesh(root, new THREE.SphereGeometry(0.08, 8, 6), lampBlue, [-0.20, 1.40, -0.50]);
  const beaconRight = makeMesh(root, new THREE.SphereGeometry(0.08, 8, 6), lampRed, [0.20, 1.40, -0.50]);
  const officer = new THREE.Group();
  officer.position.set(1.30, 0, 0.15);
  root.add(officer);
  const officerRig = createOfficerRig(officer);
  const barrier = makeMesh(root, new THREE.BoxGeometry(1.45, 0.13, 0.15), makeMaterial(root, '#f0e7d5'), [1.58, 0.55, -1.10]);
  barrier.name = 'KAROTA striped checkpoint barrier';
  for (let i = 0; i < 6; i += 1) {
    makeMesh(root, new THREE.BoxGeometry(0.13, 0.14, 0.17), makeMaterial(root, '#c74135'), [1.00 + i * 0.23, 0.56, -1.10]);
  }
  root.userData.kanoEvent = { type: 'karota', time: 0, beaconLeft, beaconRight, officerRig, barrier };
  root.position.set(2.72, 0, -4.05);
  root.rotation.y = -0.12;
  worldFor(renderer)?.add(root);
  return root;
}
function createWaterSeller(renderer) {
  const root = makeRoot('Kano Pure Water Seller');
  const skin = makeMaterial(root, '#86563b');
  const shirt = makeMaterial(root, '#287e77');
  const trousers = makeMaterial(root, '#303943');
  const cap = makeMaterial(root, '#e6c45f');
  makeMesh(root, new THREE.CapsuleGeometry(0.16, 0.38, 3, 7), shirt, [0, 0.91, 0], [0.9, 1, 0.72]);
  makeMesh(root, new THREE.SphereGeometry(0.13, 8, 6), skin, [0, 1.30, 0.01]);
  makeMesh(root, new THREE.CylinderGeometry(0.14, 0.16, 0.07, 8), cap, [0, 1.41, 0]);
  for (const side of [-1, 1]) makeMesh(root, new THREE.CapsuleGeometry(0.055, 0.26, 2, 5), trousers, [side * 0.08, 0.37, 0]);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 1.12, 0);
    root.add(pivot);
    const arm = makeMesh(root, new THREE.CapsuleGeometry(0.045, 0.27, 2, 5), shirt, [0, 0, 0]);
    pivot.add(arm);
    arm.position.set(side * 0.04, -0.14, -0.02);
    arms.push(pivot);
  }
  // Clearly visible raised tray and sachet-water bottles.
  const tray = makeMesh(root, new THREE.BoxGeometry(0.95, 0.08, 0.34), makeMaterial(root, '#9b6b3c'), [0.70, 1.22, -0.10]);
  tray.rotation.z = -0.06;
  const bottles = [];
  for (let i = 0; i < 5; i += 1) {
    const bottle = makeMesh(root, new THREE.CylinderGeometry(0.045, 0.05, 0.18, 7), makeMaterial(root, '#51c8dc', { transparent: true, opacity: 0.9, roughness: 0.25 }), [0.35 + i * 0.16, 1.35, -0.10]);
    bottle.userData.phase = i * 0.9;
    bottles.push(bottle);
  }
  root.userData.kanoEvent = { type: 'waterSeller', time: 0, arms, bottles, tray };
  root.position.set(-2.95, 0, -3.15);
  root.rotation.y = 0.16;
  worldFor(renderer)?.add(root);
  return root;
}

function buildEventVisual(renderer, type) {
  if (type === 'goatCrossing') return createGoatCrossing(renderer);
  if (type === 'karota') return createKarotaCheckpoint(renderer);
  if (type === 'waterSeller') return createWaterSeller(renderer);
  return null;
}
function syncEventVisual(renderer, type) {
  const world = worldFor(renderer);
  if (!world) return;
  const normalizedType = ['goatCrossing', 'karota', 'waterSeller'].includes(type) ? type : null;
  let current = renderer._kanoRepairEventVisual;
  if (current && (current.type !== normalizedType || current.root.parent !== world)) {
    disposeRoot(current.root);
    renderer._kanoRepairEventVisual = null;
    current = null;
  }
  if (!normalizedType || current) return;
  const root = buildEventVisual(renderer, normalizedType);
  if (!root) return;
  if (!root.parent) world.add(root);
  renderer._kanoRepairEventVisual = { type: normalizedType, root, time: 0 };
}
function animateEventVisual(renderer, dt) {
  const visual = renderer._kanoRepairEventVisual;
  if (!visual?.root?.parent) return;
  const delta = clamp(dt, 0, 0.05);
  visual.time += delta;
  const data = visual.root.userData.kanoEvent;
  if (!data) return;
  data.time += delta;
  const t = data.time;
  if (data.type === 'goatCrossing') {
    data.actors.forEach((goat, index) => {
      const rig = goat.userData.kanoGoatRig;
      const phase = t * 9 + index * 1.4;
      goat.position.x -= delta * (1.05 + index * 0.10);
      if (goat.position.x < -5.8) goat.position.x = 5.1 + index * 0.52;
      goat.position.y = Math.abs(Math.sin(phase * 1.6)) * 0.035;
      rig?.legs.forEach((leg, legIndex) => { leg.rotation.x = Math.sin(phase + (legIndex % 2) * Math.PI) * 0.47; });
      const head = goat.children.find((child) => child.geometry?.type === 'SphereGeometry' && child.position.x < -0.25);
      if (head) head.rotation.z = Math.sin(phase * 0.32) * 0.07;
    });
  } else if (data.type === 'karota') {
    const flash = Math.sin(t * 9) > 0;
    data.beaconLeft.material.color.set(flash ? '#2089ff' : '#102c58');
    data.beaconRight.material.color.set(flash ? '#4d1018' : '#ff3347');
    data.officerRig.arms[1].rotation.z = -0.70 + Math.sin(t * 4.4) * 0.48;
    data.officerRig.arms[0].rotation.z = 0.22 + Math.sin(t * 2.1) * 0.12;
    data.barrier.rotation.z = Math.sin(t * 1.4) * 0.025;
  } else if (data.type === 'waterSeller') {
    data.arms[0].rotation.z = -0.38 + Math.sin(t * 3.8) * 0.32;
    data.arms[1].rotation.z = 0.18 + Math.sin(t * 2.8 + 0.9) * 0.24;
    data.tray.position.y = 1.22 + Math.sin(t * 2.0) * 0.018;
    data.bottles.forEach((bottle) => {
      bottle.position.y = 1.35 + Math.abs(Math.sin(t * 3.1 + bottle.userData.phase)) * 0.04;
      bottle.rotation.z = Math.sin(t * 2.6 + bottle.userData.phase) * 0.07;
    });
  }
}

// -----------------------------------------------------------------------------
// Pothole visibility: hook the renderer's actual makePotholeActor method,
// keep the existing gameplay actor, and add subtle edge detail around it.
// -----------------------------------------------------------------------------
if (typeof originalMakePothole === 'function') {
  Renderer3D.prototype.makePotholeActor = function patchedMakePotholeActor(...args) {
    const actor = originalMakePothole.apply(this, args);
    if (!actor?.isObject3D || actor.userData?.kanoRepairPotholeFX) return actor;

    const fxRoot = makeRoot('Kano Pothole Edge Detail');
    const rockMaterial = makeMaterial(fxRoot, '#9b8d78', { roughness: 0.98 });
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + random(-0.12, 0.12);
      const radius = random(0.30, 0.50);
      const rock = makeMesh(
        fxRoot,
        new THREE.DodecahedronGeometry(random(0.045, 0.085), 0),
        rockMaterial,
        [Math.cos(angle) * radius, random(0.018, 0.035), Math.sin(angle) * radius],
        [random(0.8, 1.25), random(0.45, 0.75), random(0.8, 1.2)],
      );
      rock.rotation.set(random(-0.3, 0.3), random(0, Math.PI), random(-0.3, 0.3));
      rock.userData.kanoPotholePhase = i * 0.7;
    }
    actor.add(fxRoot);
    actor.userData.kanoRepairPotholeFX = { root: fxRoot, time: random(0, 8) };
    potholeActors.add(actor);
    return actor;
  };
}
function animatePotholeDetails(dt) {
  const delta = clamp(dt, 0, 0.05);
  for (const actor of [...potholeActors]) {
    if (!actor.parent) {
      const root = actor.userData?.kanoRepairPotholeFX?.root;
      if (root) disposeRoot(root);
      potholeActors.delete(actor);
      continue;
    }
    const fx = actor.userData?.kanoRepairPotholeFX;
    if (!fx?.root) continue;
    fx.time += delta;
    for (const rock of fx.root.children) {
      const phase = rock.userData?.kanoPotholePhase;
      if (phase === undefined) continue;
      rock.rotation.y += delta * 0.18;
      rock.position.y = 0.02 + Math.abs(Math.sin(fx.time * 2.7 + phase)) * 0.018;
    }
  }
}

// -----------------------------------------------------------------------------
// Morning routine: direct start is the default; the story stays replayable.
// -----------------------------------------------------------------------------
function startSelectedRun(ui) {
  const game = ui?.game || window.__KANO_LIFE_GAME__ || activeGame;
  if (!game || typeof game.start !== 'function') {
    console.error('[Kano Life] Start was requested before the game was ready.');
    return false;
  }
  const routeId = document.getElementById('route-select')?.value || save.routeId || ROUTES[0]?.id;
  const driverId = document.getElementById('driver-select')?.value || save.driverId || DRIVERS[0]?.id;
  const mode = document.getElementById('mode-select')?.value || save.lastMode || 'career';
  const route = ROUTES.find((entry) => entry.id === routeId) || ROUTES[0];
  const driver = DRIVERS.find((entry) => entry.id === driverId && (save.unlocks || []).includes(entry.id))
    || DRIVERS.find((entry) => (save.unlocks || []).includes(entry.id)) || DRIVERS[0];
  if (route) { save.routeId = route.id; game.route = route; }
  if (driver) { save.driverId = driver.id; game.driver = driver; }
  save.lastMode = mode;
  try { persist(); } catch (error) { console.warn('[Kano Life] Start settings could not be saved.', error); }
  activeGame = game;
  activeUI = ui;
  window.__KANO_LIFE_GAME__ = game;
  game.start(mode);
  // Keep the DOM and game state aligned even if an older start implementation
  // does not call UI.startPlay() itself.
  ui?.startPlay?.();
  window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
  return true;
}
UI.prototype.beginMorningRoutine = function beginRoutineOrDrive() {
  activeUI = this;
  return startSelectedRun(this);
};

// The current game engine already supports reverse gear, but some index.html
// versions do not render its button. Create it before UI.bind() and Controls
// are constructed so the existing input controller discovers it normally.
function installReverseGearElements() {
  const controls = document.getElementById('drive-controls');
  if (!controls) return;

  let reverseButton = document.getElementById('reverse-btn');
  if (!reverseButton) {
    reverseButton = document.createElement('button');
    reverseButton.id = 'reverse-btn';
    reverseButton.type = 'button';
    reverseButton.className = 'control reverse';
    reverseButton.dataset.action = 'reverse';
    reverseButton.textContent = 'REVERSE';
    reverseButton.setAttribute('aria-label', 'Toggle reverse gear');
    reverseButton.setAttribute('aria-pressed', 'false');
    reverseButton.title = 'Engage reverse gear only after the keke has stopped.';

    const brakeButton = controls.querySelector('[data-action="brake"]');
    if (brakeButton) controls.insertBefore(reverseButton, brakeButton);
    else controls.append(reverseButton);
  } else {
    reverseButton.dataset.action ||= 'reverse';
    reverseButton.classList.add('control', 'reverse');
  }

  const hudBottom = document.querySelector('#hud .hud-bottom');
  if (hudBottom && !document.getElementById('gear-label')) {
    const gearLabel = document.createElement('span');
    gearLabel.id = 'gear-label';
    gearLabel.setAttribute('aria-live', 'polite');
    gearLabel.textContent = 'FORWARD GEAR';
    hudBottom.append(gearLabel);
  }
}

UI.prototype.bind = function patchedUIBind(game, ...args) {
  installReverseGearElements();
  const result = originalUIBind.call(this, game, ...args);
  this.game = game;
  activeUI = this;
  activeGame = game;
  window.__KANO_LIFE_GAME__ = game;
  installRecordUI();
  renderLocalRecord();
  updateVehicleHealthBadge(game?.s);
  refreshOverallRecord(true);
  this.updateReverseControl?.(game?.s);
  if (!document.getElementById('kano-replay-morning-routine')) {
    const actions = document.querySelector('.start-actions');
    if (actions) {
      const button = document.createElement('button');
      button.id = 'kano-replay-morning-routine';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'REPLAY MORNING ROUTINE';
      button.title = 'Watch the optional morning story before driving';
      button.addEventListener('click', () => {
        if (typeof originalBeginMorningRoutine === 'function') originalBeginMorningRoutine.call(this);
      });
      actions.append(button);
    }
  }
  return result;
};
function installRecordUI() {
  if (!document.getElementById('kano-presentation-repair-css')) {
    const style = document.createElement('style');
    style.id = 'kano-presentation-repair-css';
    style.textContent = `
      #kano-replay-morning-routine{flex:1 1 100%;min-height:34px;font-size:10px}
      .kano-overall-record{display:inline-flex!important;align-items:center;gap:5px;max-width:100%;padding:5px 8px;border-radius:8px;border:1px solid #f5c54288;background:rgba(8,17,28,.92);color:#ffe18b;font-size:10px;font-weight:900;line-height:1.3;white-space:normal;visibility:visible!important;opacity:1!important}
      .kano-start-record{display:block!important;flex:1 1 100%;width:100%;color:#f5d77d;font-size:12px;font-weight:900;padding:7px 0 2px;line-height:1.35;visibility:visible!important;opacity:1!important}
      .kano-vehicle-health{display:inline-flex;flex:1 1 100%;align-items:center;box-sizing:border-box;min-width:0;max-width:100%;padding:4px 7px;border:1px solid #4dd6ac66;border-radius:7px;background:rgba(8,17,28,.88);color:#a5f3d4;font-size:9px;font-weight:900;line-height:1.35;white-space:normal;overflow-wrap:anywhere}
      .kano-vehicle-health[data-level=warning]{color:#ffd166;border-color:#ffd16699}
      .kano-vehicle-health[data-level=critical]{color:#ff8989;border-color:#ff626299;background:rgba(48,10,10,.9)}
      #hud .hud-bottom{display:flex;flex-wrap:wrap;align-items:center;row-gap:5px}
      #game-canvas{display:block;width:100%;height:100%;image-rendering:auto;touch-action:none;outline:none}
      #app,#game-container{min-width:0;max-width:100vw}
      #drive-controls{grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(3px,.7vw,7px)}
      #drive-controls .control{min-width:0;min-height:clamp(42px,7vh,62px);touch-action:manipulation;-webkit-user-select:none;user-select:none}
      #drive-controls .reverse{color:#ffd166;background:#332a18;border:1px solid #f5c54288;font-weight:900}
      #drive-controls .reverse.active,#drive-controls .reverse.reverse-engaged{color:#172333;background:#f5c542;border-color:#ffe69a;box-shadow:0 0 0 2px #f5c54238}
      #drive-controls .reverse:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      #gear-label{display:inline-flex;align-items:center;color:#9de6d7;font-weight:900}
      @media(max-width:520px){#drive-controls{gap:3px}#drive-controls .control{padding-left:2px;padding-right:2px;font-size:clamp(8px,2.1vw,10px)}.kano-overall-record{font-size:9px;padding:4px 6px}.kano-start-record{font-size:10px}}
      @media(max-width:760px){#game-canvas{width:100%;height:100%}.kano-overall-record{font-size:9px;padding:4px 6px}.kano-start-record{font-size:10px}}
    `;
    document.head.append(style);
  }
  const hud = document.querySelector('#hud .hud-bottom');
  if (hud && !document.getElementById('kano-overall-record')) {
    const badge = document.createElement('span');
    badge.id = 'kano-overall-record';
    badge.className = 'kano-overall-record';
    badge.setAttribute('aria-live', 'polite');
    hud.append(badge);
  }
  if (hud && !document.getElementById('kano-vehicle-health')) {
    const health = document.createElement('span');
    health.id = 'kano-vehicle-health';
    health.className = 'kano-vehicle-health';
    health.setAttribute('role', 'status');
    health.setAttribute('aria-live', 'polite');
    health.textContent = 'KEKE HEALTH · CHECKING CONDITION';
    hud.append(health);
  }
  const card = document.querySelector('#start-screen .start-card');
  if (card && !document.getElementById('kano-start-record')) {
    const line = document.createElement('div');
    line.id = 'kano-start-record';
    line.className = 'kano-start-record';
    line.setAttribute('aria-live', 'polite');
    const subtitle = card.querySelector('.subtitle');
    if (subtitle?.nextSibling) card.insertBefore(line, subtitle.nextSibling);
    else card.append(line);
  }
  if (!window.__kanoPresentationRecordListeners) {
    window.__kanoPresentationRecordListeners = true;
    window.addEventListener('kano:global-score-submitted', () => refreshOverallRecord(true));
    window.addEventListener('storage', (event) => {
      if (event.key === 'kano-life-save-v4' || event.key === RECORD_NAME_KEY) refreshOverallRecord(true);
    });
    recordRefreshTimer = window.setInterval(() => {
      if (!document.hidden) refreshOverallRecord(false);
    }, 4000);
  }
  installWorkshopUI();
}

// -----------------------------------------------------------------------------
// Garage workshop: real in-game service transactions backed by banked funds.
// The player must open the existing Garage screen; repairs are never applied
// automatically while driving. Prices scale with the missing condition.
// -----------------------------------------------------------------------------
const WORKSHOP_PARTS = {
  body:   { stateKey: 'condition', label: 'BODY',   rate: 5,  color: '#f5c542' },
  engine: { stateKey: 'engine',    label: 'ENGINE', rate: 8,  color: '#00b4d8' },
  tyres:  { stateKey: 'tyres',     label: 'TYRES',  rate: 6,  color: '#4dd6ac' },
};
const WORKSHOP_LABOUR_FEE = 100;
const WORKSHOP_HISTORY_KEY = 'kano-life-workshop-history-v1';
const WORKSHOP_HISTORY_LIMIT = 12;
const WORKSHOP_BACKUP_MAX_BYTES = 1024 * 1024;
const WORKSHOP_BACKUP_MAX_ROWS = 500;
const naira = (value) => `₦${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG')}`;
const escapeWorkshopHTML = (value) => String(value ?? '').replace(/[&<>\"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
}[character]));

function normalizeConditionSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = {};
  for (const key of Object.keys(WORKSHOP_PARTS)) {
    const raw = Number(value[key]);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) return null;
    snapshot[key] = Math.round(raw);
  }
  return snapshot;
}

function readWorkshopHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSHOP_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && Number.isFinite(Number(entry.time))
      && Number.isFinite(Number(entry.cost)) && Number(entry.cost) >= 0
      && Array.isArray(entry.parts)).slice(0, WORKSHOP_HISTORY_LIMIT);
  } catch (_) {
    return [];
  }
}

function appendWorkshopHistory(entry) {
  try {
    const history = readWorkshopHistory();
    const receipt = {
      time: Date.now(),
      service: String(entry.service || 'service').slice(0, 20),
      parts: Array.isArray(entry.parts) ? entry.parts.filter((key) => WORKSHOP_PARTS[key]).slice(0, 3) : [],
      cost: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfter: Math.max(0, Math.floor(Number(entry.walletAfter) || 0)),
    };
    const conditionBefore = normalizeConditionSnapshot(entry.conditionBefore);
    const conditionAfter = normalizeConditionSnapshot(entry.conditionAfter);
    // Store condition details only when both sides of the repair are valid.
    // Legacy receipts remain readable and exportable without fabricated values.
    if (conditionBefore && conditionAfter) {
      receipt.conditionBefore = conditionBefore;
      receipt.conditionAfter = conditionAfter;
    }
    history.unshift(receipt);
    localStorage.setItem(WORKSHOP_HISTORY_KEY, JSON.stringify(history.slice(0, WORKSHOP_HISTORY_LIMIT)));
    return true;
  } catch (error) {
    console.warn('[Kano Life] Workshop service completed but its local receipt could not be saved.', error);
    return false;
  }
}

function workshopHistoryMarkup() {
  const history = readWorkshopHistory();
  if (!history.length) {
    return '<li class="kano-workshop-history-empty">No workshop services recorded on this device yet.</li>';
  }
  return history.map((entry) => {
    const date = new Date(Number(entry.time));
    const dateLabel = Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
    const serviceLabel = entry.service === 'full' ? 'FULL SERVICE'
      : entry.service === 'body' ? 'BODY REPAIR'
        : entry.service === 'engine' ? 'ENGINE SERVICE'
          : entry.service === 'tyres' ? 'TYRE SERVICE' : 'WORKSHOP SERVICE';
    const partsLabel = entry.parts.map((key) => WORKSHOP_PARTS[key]?.label || '').filter(Boolean).join(' · ');
    const before = normalizeConditionSnapshot(entry.conditionBefore);
    const after = normalizeConditionSnapshot(entry.conditionAfter);
    const conditionLine = before && after
      ? Object.keys(WORKSHOP_PARTS).map((key) => ({
          key,
          label: WORKSHOP_PARTS[key].label,
          before: before[key],
          after: after[key],
          restored: Math.max(0, after[key] - before[key]),
        })).filter((part) => part.before !== part.after)
          .map((part) => `${part.label} ${part.before}% → ${part.after}% (+${part.restored})`).join(' · ')
      : 'Condition details unavailable for this older receipt';
    return `<li class="kano-workshop-history-item"><div class="kano-workshop-history-top"><strong>${serviceLabel}</strong><b>${naira(entry.cost)}</b></div><span>${escapeWorkshopHTML(partsLabel || 'Vehicle service')}</span><small class="kano-workshop-history-condition">${escapeWorkshopHTML(conditionLine || 'No condition change recorded')}</small><small>${escapeWorkshopHTML(dateLabel)} · Wallet after: ${naira(entry.walletAfter)}</small></li>`;
  }).join('');
}

function workshopHistorySummaryMarkup() {
  const history = readWorkshopHistory();
  const spend = history.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
  const restoredPoints = history.reduce((sum, entry) => {
    const before = normalizeConditionSnapshot(entry.conditionBefore);
    const after = normalizeConditionSnapshot(entry.conditionAfter);
    if (!before || !after) return sum;
    return sum + Object.keys(WORKSHOP_PARTS).reduce((partSum, key) => partSum + Math.max(0, after[key] - before[key]), 0);
  }, 0);
  const detailedReceipts = history.filter((entry) => normalizeConditionSnapshot(entry.conditionBefore) && normalizeConditionSnapshot(entry.conditionAfter)).length;
  return `<div class="kano-workshop-history-summary" aria-label="Saved service history summary"><div><span>SAVED SERVICES</span><strong>${history.length}</strong></div><div><span>SAVED SPEND</span><strong>${naira(spend)}</strong></div><div><span>CONDITION POINTS RESTORED</span><strong>${restoredPoints}</strong><small>${detailedReceipts} receipt${detailedReceipts === 1 ? '' : 's'} with condition detail</small></div></div>`;
}

function normalizedWorkshopExportRows() {
  const serviceLabels = {
    full: 'Full service',
    body: 'Body repair',
    engine: 'Engine service',
    tyres: 'Tyre service',
  };
  return readWorkshopHistory().map((entry) => {
    const date = new Date(Number(entry.time));
    const conditionBefore = normalizeConditionSnapshot(entry.conditionBefore);
    const conditionAfter = normalizeConditionSnapshot(entry.conditionAfter);
    return {
      date: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
      service: serviceLabels[entry.service] || 'Workshop service',
      components: entry.parts.filter((key) => WORKSHOP_PARTS[key]).map((key) => WORKSHOP_PARTS[key].label).join('; '),
      costNaira: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfterNaira: Math.max(0, Math.floor(Number(entry.walletAfter) || 0)),
      ...(conditionBefore && conditionAfter ? { conditionBefore, conditionAfter } : {}),
    };
  });
}

function downloadWorkshopHistory(format) {
  const rows = normalizedWorkshopExportRows();
  if (!rows.length) {
    setWorkshopMessage('No service records are available to export yet.');
    return;
  }

  try {
    const exportedAt = new Date().toISOString();
    const dateStamp = exportedAt.slice(0, 10);
    let blob;
    let extension;
    let mimeType;

    if (format === 'csv') {
      const csvCell = (value) => {
        let safe = String(value ?? '');
        // Prevent spreadsheet formula execution if a local record was edited.
        if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const header = [
        'Service date (ISO 8601)', 'Service', 'Components', 'Cost (NGN)', 'Wallet after (NGN)',
        'Body before (%)', 'Body after (%)', 'Engine before (%)', 'Engine after (%)', 'Tyres before (%)', 'Tyres after (%)',
      ];
      const lines = [header, ...rows.map((row) => [
        row.date, row.service, row.components, row.costNaira, row.walletAfterNaira,
        row.conditionBefore?.body ?? '', row.conditionAfter?.body ?? '',
        row.conditionBefore?.engine ?? '', row.conditionAfter?.engine ?? '',
        row.conditionBefore?.tyres ?? '', row.conditionAfter?.tyres ?? '',
      ])];
      blob = new Blob(['\uFEFF', lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      extension = 'csv';
      mimeType = 'CSV';
    } else if (format === 'json') {
      const backup = {
        application: 'Kano Life',
        exportType: 'workshop-service-history',
        formatVersion: 1,
        exportedAt,
        recordCount: rows.length,
        note: 'This file contains only saved local workshop history. Newer receipts may include body, engine and tyre condition before and after service. It does not contain the game wallet or vehicle save.',
        records: rows,
      };
      blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      extension = 'json';
      mimeType = 'JSON backup';
    } else {
      setWorkshopMessage('Unsupported export format. Choose CSV or JSON.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-service-history-${dateStamp}.${extension}`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage(`${mimeType} export prepared with ${rows.length} saved service record${rows.length === 1 ? '' : 's'}. The game wallet and vehicle save were not changed.`);
  } catch (error) {
    console.warn('[Kano Life] Workshop history export failed.', error);
    setWorkshopMessage('Export failed in this browser. Your saved service history remains unchanged.');
  }
}

function importServiceKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases = {
    full: 'full', 'full service': 'full',
    body: 'body', 'body repair': 'body',
    engine: 'engine', 'engine service': 'engine',
    tyre: 'tyres', tyres: 'tyres', 'tyre service': 'tyres', 'tyres service': 'tyres',
  };
  return aliases[normalized] || null;
}

function importPartKeys(record, service) {
  const aliases = {
    body: 'body', 'body repair': 'body',
    engine: 'engine', 'engine service': 'engine',
    tyre: 'tyres', tyres: 'tyres', 'tyre service': 'tyres', 'tyres service': 'tyres',
  };
  let values = [];
  if (Array.isArray(record?.parts)) values = record.parts;
  else if (typeof record?.components === 'string') values = record.components.split(/[;,|]/);
  const parts = [...new Set(values.map((value) => {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return WORKSHOP_PARTS[normalized] ? normalized : aliases[normalized];
  }).filter((key) => key && WORKSHOP_PARTS[key]))].slice(0, 3);
  if (parts.length) return parts;
  if (service === 'full') return ['body', 'engine', 'tyres'];
  if (service && WORKSHOP_PARTS[service]) return [service];
  return [];
}

function normalizeWorkshopBackupRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const service = importServiceKey(record.service);
  const timestamp = typeof record.time === 'number' && Number.isFinite(record.time)
    ? record.time
    : Date.parse(record.date);
  const costValue = record.costNaira ?? record.cost;
  const walletValue = record.walletAfterNaira ?? record.walletAfter;
  const cost = Number(costValue);
  const walletAfter = Number(walletValue);
  if (!service || !Number.isFinite(timestamp) || timestamp < 0
    || !Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000
    || !Number.isFinite(walletAfter) || walletAfter < 0 || walletAfter > 1_000_000_000) {
    return null;
  }
  const parts = importPartKeys(record, service);
  if (!parts.length) return null;
  const conditionBefore = normalizeConditionSnapshot(record.conditionBefore ?? record.healthBefore);
  const conditionAfter = normalizeConditionSnapshot(record.conditionAfter ?? record.healthAfter);
  const normalized = {
    time: Math.floor(timestamp),
    service,
    parts,
    cost: Math.floor(cost),
    walletAfter: Math.floor(walletAfter),
  };
  if (conditionBefore && conditionAfter) {
    normalized.conditionBefore = conditionBefore;
    normalized.conditionAfter = conditionAfter;
  }
  return normalized;
}

function workshopRecordIdentity(record) {
  return [
    Math.floor(Number(record.time) || 0),
    importServiceKey(record.service) || 'service',
    [...new Set((Array.isArray(record.parts) ? record.parts : []).filter((key) => WORKSHOP_PARTS[key]))].sort().join(','),
    Math.floor(Number(record.cost) || 0),
    Math.floor(Number(record.walletAfter) || 0),
  ].join('|');
}

async function importWorkshopHistoryFile(file) {
  if (!file) return;
  try {
    if (file.size > WORKSHOP_BACKUP_MAX_BYTES) {
      setWorkshopMessage('Backup rejected. Choose a JSON file smaller than 1 MB. No saved data was changed.');
      return;
    }
    const text = await file.text();
    let backup;
    try {
      backup = JSON.parse(text);
    } catch (_) {
      setWorkshopMessage('Backup rejected. The file is not valid JSON. No saved data was changed.');
      return;
    }
    if (!backup || typeof backup !== 'object' || backup.application !== 'Kano Life'
      || backup.exportType !== 'workshop-service-history' || backup.formatVersion !== 1
      || !Array.isArray(backup.records) || backup.records.length > WORKSHOP_BACKUP_MAX_ROWS) {
      setWorkshopMessage('Backup rejected. Select a Kano Life Workshop JSON Backup exported by this game. No saved data was changed.');
      return;
    }
    const valid = backup.records.map(normalizeWorkshopBackupRecord).filter(Boolean);
    const invalidCount = backup.records.length - valid.length;
    if (!valid.length) {
      setWorkshopMessage('Backup contains no valid service records. Existing records were not changed.');
      return;
    }
    const confirmed = window.confirm(
      `Import ${valid.length} valid service record${valid.length === 1 ? '' : 's'} from this backup?\n\n` +
      'The records will be merged with this device’s workshop history. Only the newest 12 records will be retained. ' +
      'Your game wallet, vehicle condition, and game progress will not be changed.'
    );
    if (!confirmed) {
      setWorkshopMessage('Import cancelled. Existing workshop history and game progress were not changed.');
      return;
    }

    const current = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
      time: Number(entry.time), service: entry.service, parts: entry.parts,
      cost: entry.cost, walletAfter: entry.walletAfter,
      conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
    })).filter(Boolean);
    const byIdentity = new Map();
    for (const record of [...current, ...valid]) {
      const identity = workshopRecordIdentity(record);
      const existing = byIdentity.get(identity);
      if (!existing) {
        byIdentity.set(identity, record);
      } else {
        const existingHasDetails = normalizeConditionSnapshot(existing.conditionBefore) && normalizeConditionSnapshot(existing.conditionAfter);
        const incomingHasDetails = normalizeConditionSnapshot(record.conditionBefore) && normalizeConditionSnapshot(record.conditionAfter);
        // Prefer richer receipts when a legacy and an enhanced backup contain
        // the same transaction, without creating a duplicate service record.
        if (!existingHasDetails && incomingHasDetails) byIdentity.set(identity, record);
      }
    }
    const merged = [...byIdentity.values()]
      .sort((a, b) => b.time - a.time)
      .slice(0, WORKSHOP_HISTORY_LIMIT);
    const serialized = JSON.stringify(merged);
    localStorage.setItem(WORKSHOP_HISTORY_KEY, serialized);
    const verification = JSON.parse(localStorage.getItem(WORKSHOP_HISTORY_KEY) || 'null');
    if (!Array.isArray(verification) || verification.length !== merged.length) {
      throw new Error('The browser could not verify the restored service history.');
    }
    const skipped = invalidCount ? ` ${invalidCount} invalid record${invalidCount === 1 ? ' was' : 's were'} skipped.` : '';
    setWorkshopMessage(`IMPORT COMPLETE · ${merged.length} most recent service record${merged.length === 1 ? '' : 's'} now saved on this device.${skipped} Wallet and vehicle condition unchanged.`);
    renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
  } catch (error) {
    console.warn('[Kano Life] Workshop history import failed safely.', error);
    setWorkshopMessage('Import failed. The game wallet and vehicle condition were not changed. Check browser storage permissions and try again.');
  }
}

function workshopHealth(state, partKey) {
  const config = WORKSHOP_PARTS[partKey];
  const raw = Number(state?.[config.stateKey]);
  return Number.isFinite(raw) ? Math.round(clamp(raw, 0, 100)) : 100;
}

function workshopQuote(state, serviceKey) {
  const keys = serviceKey === 'full' ? Object.keys(WORKSHOP_PARTS) : [serviceKey];
  const parts = keys.filter((key) => WORKSHOP_PARTS[key]).map((key) => {
    const health = workshopHealth(state, key);
    const deficit = Math.max(0, 100 - health);
    const config = WORKSHOP_PARTS[key];
    return { key, label: config.label, health, deficit, cost: Math.ceil(deficit * config.rate) };
  });
  const repairCost = parts.reduce((sum, part) => sum + part.cost, 0);
  const cost = repairCost > 0 ? repairCost + WORKSHOP_LABOUR_FEE : 0;
  return { parts: parts.filter((part) => part.deficit > 0), cost, labour: cost ? WORKSHOP_LABOUR_FEE : 0 };
}

function setWorkshopMessage(message) {
  const panel = document.getElementById('kano-workshop-panel');
  if (!panel) return;
  panel.dataset.message = String(message || 'Select a service to see its cost.');
  const status = panel.querySelector('#kano-workshop-status');
  if (status) status.textContent = panel.dataset.message;
}

function workshopMaintenanceMarkup(values, wallet) {
  const trackedParts = Object.keys(WORKSHOP_PARTS);
  const belowThreshold = trackedParts.filter((key) => values[key] < 80);
  const critical = trackedParts.filter((key) => values[key] < 25);
  const worn = trackedParts.filter((key) => values[key] < 50);
  const thresholdLabel = (key) => `${WORKSHOP_PARTS[key].label} ${values[key]}%`;

  let level = 'good';
  let headline = 'CONDITION CHECK · GOOD';
  let message = 'All tracked components are at 80% or above. Keep monitoring condition during runs.';
  if (critical.length) {
    level = 'critical';
    headline = 'CRITICAL WEAR · SERVICE ADVISED';
    message = `Inspect ${critical.map(thresholdLabel).join(' · ')} before starting another long run.`;
  } else if (worn.length) {
    level = 'warning';
    headline = 'SERVICE RECOMMENDED';
    message = `Worn components: ${worn.map(thresholdLabel).join(' · ')}. Review the repair options below.`;
  } else if (belowThreshold.length) {
    level = 'soon';
    headline = 'MAINTENANCE DUE SOON';
    message = `Monitor ${belowThreshold.map(thresholdLabel).join(' · ')} and plan service when practical.`;
  }

  const fullQuote = workshopQuote(
    Object.fromEntries(trackedParts.map((key) => [WORKSHOP_PARTS[key].stateKey, values[key]])),
    'full',
  );
  let estimate = '';
  if (belowThreshold.length && fullQuote.cost > 0) {
    estimate = wallet >= fullQuote.cost
      ? `Full-service estimate: ${naira(fullQuote.cost)}.`
      : `Full-service estimate: ${naira(fullQuote.cost)} · wallet short by ${naira(fullQuote.cost - wallet)}.`;
  }

  return `<section class="kano-workshop-maintenance" data-level="${level}" aria-live="polite"><div class="kano-workshop-maintenance-heading"><span class="kano-workshop-maintenance-indicator" aria-hidden="true"></span><strong>${headline}</strong></div><p>${escapeWorkshopHTML(message)}</p>${estimate ? `<small>${escapeWorkshopHTML(estimate)}</small>` : ''}<small class="kano-workshop-maintenance-footnote">In-game condition guidance for body, engine and tyres only; no repair is applied automatically.</small></section>`;
}

function renderWorkshopPanel(state = activeGame?.s) {
  const panel = document.getElementById('kano-workshop-panel');
  if (!panel || !state) return;
  const wallet = Math.max(0, Math.floor(Number(save.money) || 0));
  const values = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(state, key)]));
  // The saved history is part of the render signature. Without it, importing a
  // backup while the wallet/vehicle state stays unchanged leaves stale records
  // on screen until a later unrelated state change.
  const historySignature = readWorkshopHistory()
    .map((entry) => `${entry.time}:${entry.service}:${entry.cost}:${entry.walletAfter}:${entry.parts.join(',')}:${JSON.stringify(entry.conditionBefore || null)}:${JSON.stringify(entry.conditionAfter || null)}`)
    .join(';');
  const signature = `${values.body}|${values.engine}|${values.tyres}|${wallet}|${historySignature}`;
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;

  const partsMarkup = Object.entries(WORKSHOP_PARTS).map(([key, config]) => {
    const health = values[key];
    const quote = workshopQuote(state, key);
    return `<div class="kano-workshop-part"><div class="kano-workshop-part-label"><span>${config.label}</span><b>${health}%</b></div><div class="kano-workshop-meter" role="progressbar" aria-label="${config.label} condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${health}"><i style="width:${health}%;background:${config.color}"></i></div><small>${health < 25 ? 'CRITICAL' : health < 50 ? 'WORN' : health < 80 ? 'SERVICEABLE' : 'GOOD'} CONDITION</small></div>`;
  }).join('');

  const services = [
    { key: 'body', label: 'BODY REPAIR' },
    { key: 'engine', label: 'ENGINE SERVICE' },
    { key: 'tyres', label: 'TYRE SERVICE' },
    { key: 'full', label: 'FULL SERVICE' },
  ];
  const serviceMarkup = services.map(({ key, label }) => {
    const quote = workshopQuote(state, key);
    const unavailable = quote.cost === 0;
    const unaffordable = quote.cost > wallet;
    const buttonLabel = unavailable ? `${label} · UP TO DATE` : `${label} · ${naira(quote.cost)}`;
    const title = unavailable ? 'No repair is required for this service.' : unaffordable ? `Costs ${naira(quote.cost)}; banked wallet has ${naira(wallet)}.` : `Repair the selected components for ${naira(quote.cost)}.`;
    return `<button type="button" class="kano-workshop-service" data-kano-workshop-service="${key}" ${unavailable || unaffordable ? 'disabled' : ''} title="${title}"><strong>${buttonLabel}</strong><span>${unavailable ? 'No condition loss detected' : unaffordable ? `Short by ${naira(quote.cost - wallet)}` : `${quote.parts.map((part) => `${part.label} +${part.deficit}%`).join(' · ')}`}</span></button>`;
  }).join('');

  panel.innerHTML = `
    <div class="kano-workshop-header"><div><p class="kano-workshop-eyebrow">KANO LIFE · MECHANIC'S BAY</p><h3 id="kano-workshop-title">Service your keke</h3><p>Repairs use banked funds and restore the selected components to 100%.</p></div><div class="kano-workshop-wallet"><small>BANKED WALLET</small><strong>${naira(wallet)}</strong></div></div>
    ${workshopMaintenanceMarkup(values, wallet)}
    <div class="kano-workshop-parts">${partsMarkup}</div>
    <div class="kano-workshop-service-list">${serviceMarkup}</div>
    <p class="kano-workshop-cost-note">Quote includes a ${naira(WORKSHOP_LABOUR_FEE)} labour fee when repairs are needed. A separate confirmation is required before money is deducted.</p>
    <p id="kano-workshop-status" class="kano-workshop-status" role="status" aria-live="polite"></p>
    <section class="kano-workshop-history" aria-labelledby="kano-workshop-history-title"><div class="kano-workshop-history-heading"><h4 id="kano-workshop-history-title">RECENT SERVICE RECORDS</h4><span>THIS DEVICE · MAX 12</span></div>${workshopHistorySummaryMarkup()}<div class="kano-workshop-history-actions"><button type="button" data-kano-workshop-export="csv" ${readWorkshopHistory().length ? '' : 'disabled'}>EXPORT CSV</button><button type="button" data-kano-workshop-export="json" ${readWorkshopHistory().length ? '' : 'disabled'}>EXPORT JSON BACKUP</button><button type="button" data-kano-workshop-import-trigger>IMPORT JSON BACKUP</button><input type="file" accept=".json,application/json" data-kano-workshop-import-file hidden aria-label="Choose a Kano Life service history JSON backup"></div><ol id="kano-workshop-history-list">${workshopHistoryMarkup()}</ol><p class="kano-workshop-history-note">Exports include the saved local receipts only. They do not include your wallet or game save. Clearing browser storage removes these records.</p></section>
    <dialog id="kano-workshop-confirm" class="kano-workshop-confirm" aria-labelledby="kano-workshop-confirm-title"><div class="kano-workshop-confirm-inner"><p class="kano-workshop-eyebrow">PAYMENT CONFIRMATION</p><h3 id="kano-workshop-confirm-title">Confirm workshop service</h3><p id="kano-workshop-confirm-summary">Review the repair and total before paying.</p><div id="kano-workshop-confirm-breakdown" class="kano-workshop-confirm-breakdown"></div><div class="kano-workshop-confirm-wallet"><span>WALLET AFTER SERVICE</span><strong id="kano-workshop-wallet-after">—</strong></div><div class="kano-workshop-confirm-actions"><button type="button" class="kano-workshop-cancel" data-kano-workshop-cancel>Cancel</button><button type="button" class="kano-workshop-confirm-pay" data-kano-workshop-confirm>CONFIRM &amp; PAY</button></div></div></dialog>`;
  const status = panel.querySelector('#kano-workshop-status');
  status.textContent = panel.dataset.message || 'Select a service to see its cost.';
}

function updateWorkshopWalletLabels() {
  const balance = naira(save.money);
  for (const selector of ['#wallet-balance', '#garage-wallet']) {
    const element = document.querySelector(selector);
    if (element) element.textContent = balance;
  }
}

function requestWorkshopService(serviceKey) {
  const game = activeGame || window.__KANO_LIFE_GAME__;
  const panel = document.getElementById('kano-workshop-panel');
  const garage = document.getElementById('garage-screen');
  const garageVisible = garage && !garage.classList.contains('hidden')
    && getComputedStyle(garage).display !== 'none' && getComputedStyle(garage).visibility !== 'hidden';
  if (!game?.s || !panel || !garageVisible) {
    performWorkshopService(serviceKey);
    return;
  }
  const quote = workshopQuote(game.s, serviceKey);
  const wallet = Math.max(0, Math.floor(Number(save.money) || 0));
  if (!quote.cost || quote.cost > wallet) {
    performWorkshopService(serviceKey);
    return;
  }

  const dialog = panel.querySelector('#kano-workshop-confirm');
  if (!dialog) {
    setWorkshopMessage('Confirmation dialog unavailable. No money was deducted. Reopen the Garage and try again.');
    return;
  }
  const serviceNames = { body: 'BODY REPAIR', engine: 'ENGINE SERVICE', tyres: 'TYRE SERVICE', full: 'FULL SERVICE' };
  const summary = dialog.querySelector('#kano-workshop-confirm-summary');
  const breakdown = dialog.querySelector('#kano-workshop-confirm-breakdown');
  const walletAfter = dialog.querySelector('#kano-workshop-wallet-after');
  const confirm = dialog.querySelector('[data-kano-workshop-confirm]');
  if (summary) summary.textContent = `${serviceNames[serviceKey] || 'WORKSHOP SERVICE'} will restore the listed components to 100%.`;
  if (breakdown) {
    breakdown.innerHTML = `${quote.parts.map((part) => `<div><span>${escapeWorkshopHTML(part.label)} · ${part.deficit}% restored</span><strong>${naira(part.cost)}</strong></div>`).join('')}<div><span>Labour</span><strong>${naira(quote.labour)}</strong></div><div class="kano-workshop-confirm-total"><span>TOTAL</span><strong>${naira(quote.cost)}</strong></div>`;
  }
  if (walletAfter) walletAfter.textContent = naira(wallet - quote.cost);
  if (confirm) confirm.textContent = `CONFIRM & PAY ${naira(quote.cost)}`;
  dialog.dataset.service = serviceKey;
  try {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  } catch (_) {
    // Do not silently charge if the confirmation interface cannot be displayed.
    setWorkshopMessage('Confirmation window unavailable. No money was deducted. Reopen the Garage and try again.');
  }
}

function closeWorkshopConfirmation(dialog) {
  if (!dialog) return;
  try { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); } catch (_) {}
  dialog.removeAttribute('open');
}

function performWorkshopService(serviceKey) {
  const game = activeGame || window.__KANO_LIFE_GAME__;
  const panel = document.getElementById('kano-workshop-panel');
  if (!game?.s || !panel) {
    setWorkshopMessage('Workshop unavailable: the game vehicle is not ready.');
    return;
  }
  // A service is a garage action, not an in-motion repair or collision exploit.
  const garage = document.getElementById('garage-screen');
  const garageVisible = garage && !garage.classList.contains('hidden')
    && getComputedStyle(garage).display !== 'none' && getComputedStyle(garage).visibility !== 'hidden';
  if (!garageVisible) {
    setWorkshopMessage('Open the Garage screen before repairing the keke.');
    return;
  }
  const quote = workshopQuote(game.s, serviceKey);
  const walletBefore = Math.max(0, Math.floor(Number(save.money) || 0));
  if (!quote.cost) {
    setWorkshopMessage('No repair required. The selected components are already at 100%.');
    return;
  }
  if (walletBefore < quote.cost) {
    setWorkshopMessage(`Insufficient banked funds. This service costs ${naira(quote.cost)}; wallet balance is ${naira(walletBefore)}.`);
    return;
  }
  if (!ensureKekeLifecycle(game)) {
    setWorkshopMessage('Workshop could not load the vehicle record. No money was deducted.');
    return;
  }

  const stateBefore = {
    condition: game.s.condition,
    engine: game.s.engine,
    tyres: game.s.tyres,
  };
  try {
    for (const part of quote.parts) {
      const config = WORKSHOP_PARTS[part.key];
      game.s[config.stateKey] = 100;
    }
    save.money = walletBefore - quote.cost;
    if (!syncRunHealthToLifecycle(game)) throw new Error('The vehicle condition could not be saved.');
    persist();
  } catch (error) {
    game.s.condition = stateBefore.condition;
    game.s.engine = stateBefore.engine;
    game.s.tyres = stateBefore.tyres;
    save.money = walletBefore;
    try { syncRunHealthToLifecycle(game); } catch (_) {}
    try { persist(); } catch (_) {}
    setWorkshopMessage(`Service cancelled; changes were rolled back. ${error?.message || 'Save failed.'}`);
    renderWorkshopPanel(game.s);
    updateVehicleHealthBadge(game.s);
    return;
  }

  try { game.ui?.update?.(game.s, game.route, game.driver); } catch (_) {}
  const conditionBefore = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(stateBefore, key)]));
  const conditionAfter = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(game.s, key)]));
  const historySaved = appendWorkshopHistory({
    service: serviceKey,
    parts: quote.parts.map((part) => part.key),
    cost: quote.cost,
    walletAfter: save.money,
    conditionBefore,
    conditionAfter,
  });
  updateWorkshopWalletLabels();
  updateVehicleHealthBadge(game.s);
  const completed = quote.parts.map((part) => part.label).join(', ');
  setWorkshopMessage(`SERVICE COMPLETE · ${completed} restored to 100% · ${naira(quote.cost)} deducted.${historySaved ? ' Receipt saved.' : ' Receipt could not be saved; the service itself is complete.'}`);
  renderWorkshopPanel(game.s);
  window.dispatchEvent(new CustomEvent('kano:workshop-service-complete', { detail: { service: serviceKey, cost: quote.cost, wallet: save.money, parts: quote.parts.map((part) => part.key), historySaved } }));
}

function installWorkshopUI() {
  const garagePanel = document.querySelector('#garage-screen .garage-panel');
  if (!garagePanel) return;
  let panel = document.getElementById('kano-workshop-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'kano-workshop-panel';
    panel.className = 'kano-workshop-panel';
    panel.setAttribute('aria-labelledby', 'kano-workshop-title');
    const backButton = garagePanel.querySelector('button.primary.full[data-close="garage-screen"]');
    if (backButton) garagePanel.insertBefore(panel, backButton);
    else garagePanel.append(panel);
  }
  if (!document.getElementById('kano-workshop-style')) {
    const style = document.createElement('style');
    style.id = 'kano-workshop-style';
    style.textContent = `
      #garage-screen .garage-panel{overflow-y:auto;overscroll-behavior:contain}
      #kano-workshop-panel{box-sizing:border-box;width:100%;margin:18px 0 12px;padding:14px;border:1px solid #00b4d855;border-radius:12px;background:linear-gradient(145deg,rgba(11,30,58,.98),rgba(8,17,28,.98));color:#eef5ff;text-align:left}
      .kano-workshop-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .kano-workshop-eyebrow{margin:0 0 5px;color:#00c4e7;font-size:9px;font-weight:900;letter-spacing:.12em}
      .kano-workshop-header h3{margin:0;color:#fff;font-size:18px;line-height:1.2}
      .kano-workshop-header p:not(.kano-workshop-eyebrow){margin:5px 0 0;color:#bbcbdd;font-size:11px;line-height:1.4;max-width:420px}
      .kano-workshop-wallet{flex:0 0 auto;padding:7px 9px;border:1px solid #f5c54266;border-radius:8px;background:#101d2c;text-align:right}
      .kano-workshop-wallet small{display:block;color:#f5d77d;font-size:8px;font-weight:900;white-space:nowrap}
      .kano-workshop-wallet strong{display:block;margin-top:3px;color:#ffe18b;font-size:14px;white-space:nowrap}
      .kano-workshop-maintenance{margin:12px 0 0;padding:10px 11px;border:1px solid #4dd6ac55;border-radius:9px;background:#4dd6ac0b}
      .kano-workshop-maintenance[data-level="soon"]{border-color:#00b4d866;background:#00b4d80b}
      .kano-workshop-maintenance[data-level="warning"]{border-color:#ffd16699;background:#ffd1660d}
      .kano-workshop-maintenance[data-level="critical"]{border-color:#ff6262aa;background:#ff62620d}
      .kano-workshop-maintenance-heading{display:flex;align-items:center;gap:7px;color:#a5f3d4;font-size:10px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-maintenance[data-level="soon"] .kano-workshop-maintenance-heading{color:#8ce8f6}
      .kano-workshop-maintenance[data-level="warning"] .kano-workshop-maintenance-heading{color:#ffd166}
      .kano-workshop-maintenance[data-level="critical"] .kano-workshop-maintenance-heading{color:#ff8989}
      .kano-workshop-maintenance-indicator{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#4dd6ac;box-shadow:0 0 0 3px #4dd6ac1d}
      .kano-workshop-maintenance[data-level="soon"] .kano-workshop-maintenance-indicator{background:#00b4d8;box-shadow:0 0 0 3px #00b4d81d}
      .kano-workshop-maintenance[data-level="warning"] .kano-workshop-maintenance-indicator{background:#ffd166;box-shadow:0 0 0 3px #ffd1661d}
      .kano-workshop-maintenance[data-level="critical"] .kano-workshop-maintenance-indicator{background:#ff6262;box-shadow:0 0 0 3px #ff62621d}
      .kano-workshop-maintenance p{margin:6px 0 0;color:#c5d5e5;font-size:10px;line-height:1.45;overflow-wrap:anywhere}
      .kano-workshop-maintenance small{display:block;margin-top:5px;color:#ffe18b;font-size:9px;line-height:1.4;overflow-wrap:anywhere}
      .kano-workshop-maintenance .kano-workshop-maintenance-footnote{color:#8198ad}
      .kano-workshop-parts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:14px 0}
      .kano-workshop-part{min-width:0;padding:9px;border:1px solid #ffffff16;border-radius:8px;background:#ffffff07}
      .kano-workshop-part-label{display:flex;justify-content:space-between;gap:4px;color:#eaf1f9;font-size:10px;font-weight:900}
      .kano-workshop-part-label b{color:#fff}
      .kano-workshop-meter{height:5px;margin:7px 0 5px;overflow:hidden;border-radius:99px;background:#314154}
      .kano-workshop-meter i{display:block;height:100%;border-radius:99px;transition:width .2s ease}
      .kano-workshop-part small{color:#8fa5bb;font-size:8px;font-weight:800}
      .kano-workshop-service-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .kano-workshop-service{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:52px;padding:9px;border:1px solid #00b4d866;border-radius:8px;background:#10243a;color:#f2f7fc;text-align:left;cursor:pointer;touch-action:manipulation}
      .kano-workshop-service strong{font-size:10px;line-height:1.3}
      .kano-workshop-service span{color:#aec4d8;font-size:9px;line-height:1.3}
      .kano-workshop-service:not(:disabled):active{transform:translateY(1px);background:#173552}
      .kano-workshop-service:disabled{border-color:#ffffff15;background:#ffffff06;color:#748496;cursor:not-allowed;opacity:.8}
      .kano-workshop-service:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-cost-note{margin:9px 0 6px;color:#9eb2c6;font-size:9px;line-height:1.4}
      .kano-workshop-status{min-height:17px;margin:7px 0 0;padding:8px;border:1px solid #4dd6ac3d;border-radius:7px;background:#4dd6ac0d;color:#a5f3d4;font-size:10px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}
      .kano-workshop-history{margin-top:13px;padding-top:11px;border-top:1px solid #ffffff17}
      .kano-workshop-history-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-history-heading h4{margin:0;color:#f3f7fc;font-size:10px;letter-spacing:.06em}
      .kano-workshop-history-heading span{color:#8fa5bb;font-size:8px;font-weight:900}
      .kano-workshop-history-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 0}
      .kano-workshop-history-summary>div{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0;padding:8px;border:1px solid #ffffff15;border-radius:7px;background:#ffffff06}
      .kano-workshop-history-summary span{color:#9fb4c8;font-size:8px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-history-summary strong{color:#ffe18b;font-size:11px;overflow-wrap:anywhere;text-align:right}.kano-workshop-history-summary small{grid-column:1/-1;color:#8198ad;font-size:8px;line-height:1.3;text-align:right}
      .kano-workshop-history-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 0}
      .kano-workshop-history-actions button{min-height:38px;padding:8px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:9px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-history-actions button:disabled{opacity:.45;cursor:not-allowed}
      .kano-workshop-history-actions button:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      #kano-workshop-history-list{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
      .kano-workshop-history-item{padding:8px;border:1px solid #ffffff13;border-radius:7px;background:#ffffff05;min-width:0}
      .kano-workshop-history-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .kano-workshop-history-top strong{color:#d9e8f7;font-size:9px}
      .kano-workshop-history-top b{color:#ffe18b;font-size:10px;white-space:nowrap}
      .kano-workshop-history-item>span,.kano-workshop-history-item small{display:block;margin-top:4px;color:#a9bbcd;font-size:9px;line-height:1.35;overflow-wrap:anywhere}.kano-workshop-history-item .kano-workshop-history-condition{color:#a5f3d4}
      .kano-workshop-history-item small{color:#8198ad}
      .kano-workshop-history-empty,.kano-workshop-history-note{color:#8198ad;font-size:9px;line-height:1.4}
      .kano-workshop-history-empty{padding:8px;border:1px dashed #ffffff1b;border-radius:7px}
      .kano-workshop-history-note{margin:7px 0 0}
      .kano-workshop-confirm{width:min(440px,calc(100vw - 28px));max-width:calc(100vw - 28px);box-sizing:border-box;padding:0;border:1px solid #00b4d899;border-radius:14px;background:#0b1e3a;color:#eff6ff;box-shadow:0 24px 80px #0009}
      .kano-workshop-confirm::backdrop{background:rgba(2,8,16,.78);backdrop-filter:blur(3px)}
      .kano-workshop-confirm-inner{padding:17px}
      .kano-workshop-confirm h3{margin:0;color:#fff;font-size:18px}
      .kano-workshop-confirm-inner>p:not(.kano-workshop-eyebrow){margin:7px 0 12px;color:#b7c9db;font-size:11px;line-height:1.45}
      .kano-workshop-confirm-breakdown{display:grid;gap:7px;padding:10px;border-radius:8px;background:#ffffff08}
      .kano-workshop-confirm-breakdown>div{display:flex;justify-content:space-between;gap:10px;color:#bcd0e3;font-size:11px}
      .kano-workshop-confirm-breakdown>div strong{color:#f4f7fb;white-space:nowrap}
      .kano-workshop-confirm-breakdown .kano-workshop-confirm-total{margin-top:3px;padding-top:8px;border-top:1px solid #ffffff22;color:#ffe18b;font-weight:900}
      .kano-workshop-confirm-breakdown .kano-workshop-confirm-total strong{color:#ffe18b;font-size:14px}
      .kano-workshop-confirm-wallet{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:11px 0;padding:9px;border:1px solid #f5c54255;border-radius:8px;background:#f5c5420a}
      .kano-workshop-confirm-wallet span{color:#f5d77d;font-size:9px;font-weight:900}
      .kano-workshop-confirm-wallet strong{color:#ffe18b;font-size:13px}
      .kano-workshop-confirm-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
      .kano-workshop-confirm-actions button{min-height:42px;padding:8px;border-radius:8px;font-size:10px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-cancel{border:1px solid #ffffff25;background:#14263a;color:#d7e4f0}
      .kano-workshop-confirm-pay{border:1px solid #ffe18b;background:#f5c542;color:#142033}
      .kano-workshop-confirm-actions button:focus-visible{outline:2px solid #00d0ef;outline-offset:2px}
      @media(max-width:440px){.kano-workshop-history-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.kano-workshop-history-summary>div:last-child{grid-column:1/-1}.kano-workshop-history-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.kano-workshop-history-actions button[data-kano-workshop-import-trigger]{grid-column:1/-1}#kano-workshop-panel{padding:10px}.kano-workshop-header{gap:6px}.kano-workshop-header h3{font-size:15px}.kano-workshop-wallet{padding:6px}.kano-workshop-wallet strong{font-size:12px}.kano-workshop-parts{gap:4px}.kano-workshop-part{padding:7px 5px}.kano-workshop-part-label{font-size:9px}.kano-workshop-service-list{gap:5px}.kano-workshop-service{padding:8px 7px}.kano-workshop-service strong{font-size:9px}}
      @media(max-width:340px){.kano-workshop-service-list{grid-template-columns:minmax(0,1fr)}.kano-workshop-header{flex-direction:column}.kano-workshop-wallet{width:100%;box-sizing:border-box;text-align:left}}
    `;
    document.head.append(style);
  }
  if (!panel.dataset.bound) {
    panel.dataset.bound = 'true';
    panel.addEventListener('click', (event) => {
      const importButton = event.target.closest('[data-kano-workshop-import-trigger]');
      if (importButton) {
        panel.querySelector('[data-kano-workshop-import-file]')?.click();
        return;
      }
      const exportButton = event.target.closest('[data-kano-workshop-export]');
      if (exportButton) {
        if (!exportButton.disabled) downloadWorkshopHistory(exportButton.dataset.kanoWorkshopExport);
        return;
      }
      const cancelButton = event.target.closest('[data-kano-workshop-cancel]');
      if (cancelButton) {
        closeWorkshopConfirmation(panel.querySelector('#kano-workshop-confirm'));
        return;
      }
      const confirmButton = event.target.closest('[data-kano-workshop-confirm]');
      if (confirmButton) {
        const dialog = panel.querySelector('#kano-workshop-confirm');
        const serviceKey = dialog?.dataset.service;
        closeWorkshopConfirmation(dialog);
        if (serviceKey) performWorkshopService(serviceKey);
        return;
      }
      const button = event.target.closest('[data-kano-workshop-service]');
      if (!button || button.disabled) return;
      requestWorkshopService(button.dataset.kanoWorkshopService);
    });
    panel.addEventListener('change', (event) => {
      const input = event.target.closest('[data-kano-workshop-import-file]');
      if (!input) return;
      const file = input.files?.[0] || null;
      // Reset so selecting the same backup twice still fires a change event.
      input.value = '';
      if (file) void importWorkshopHistoryFile(file);
    });
  }
  renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
}

function numberFromRow(row) {
  const n = Number(row?.score ?? row?.highScore ?? row?.points ?? row?.bestScore ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function nameFromRow(row) {
  return String(row?.displayName || row?.playerName || row?.name || row?.username || row?.driver || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 28);
}
function localRecord() {
  const runs = Array.isArray(save.lastRuns) ? save.lastRuns : [];
  const runBest = runs.reduce((best, row) => numberFromRow(row) > numberFromRow(best) ? row : best, null);
  const persistedScore = Math.max(0, Math.floor(Number(save.highScore) || 0));
  const runScore = numberFromRow(runBest);
  let savedName = '';
  try { savedName = localStorage.getItem(RECORD_NAME_KEY) || ''; } catch (_) {}
  const name = runScore >= persistedScore && runBest
    ? nameFromRow(runBest) || 'Kano Driver'
    : String(savedName || save.playerName || save.displayName || nameFromRow(runBest) || 'Kano Driver').trim().slice(0, 28);
  return { name, score: Math.max(persistedScore, runScore), source: 'local' };
}
function showRecord(record) {
  const safeName = String(record.name || 'Kano Driver').replace(/[<>\u0000-\u001f]/g, '').slice(0, 28);
  const score = `₦${Math.floor(Number(record.score) || 0).toLocaleString('en-NG')}`;
  const label = record.source === 'global'
    ? `OVERALL #1 · ${safeName} · ${score}`
    : `LOCAL HIGH SCORE · ${safeName} · ${score}`;
  const hud = document.getElementById('kano-overall-record');
  const start = document.getElementById('kano-start-record');
  if (hud) { hud.textContent = label; hud.hidden = false; hud.style.display = 'inline-flex'; }
  if (start) { start.textContent = label; start.hidden = false; start.style.display = 'block'; }
}
function renderLocalRecord() {
  lastRecord = localRecord();
  showRecord(lastRecord);
}
async function refreshOverallRecord(force = false) {
  if (recordRequestInFlight) return;
  const now = Date.now();
  if (!force && now - recordRequestAt < 3500) { showRecord(lastRecord); return; }
  recordRequestAt = now;
  recordRequestInFlight = true;
  lastRecord = localRecord();
  showRecord(lastRecord);
  try {
    const response = await fetch(`${SCORE_ENDPOINT}&_=${Date.now()}`, { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      const candidates = [payload, payload?.entries, payload?.rows, payload?.leaderboard, payload?.scores, payload?.results, payload?.data, payload?.data?.entries, payload?.data?.rows, payload?.data?.scores];
      let rows = candidates.find(Array.isArray) || [];
      if (!rows.length && payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        const nested = Object.values(payload.data).find(Array.isArray);
        if (nested) rows = nested;
      }
      const valid = rows.filter((row) => row && typeof row === 'object' && numberFromRow(row) >= 0);
      if (valid.length) {
        valid.sort((a, b) => numberFromRow(b) - numberFromRow(a));
        const row = valid[0];
        const name = nameFromRow(row);
        const score = numberFromRow(row);
        if (name && score > 0) lastRecord = { name, score, source: 'global' };
      }
    }
  } catch (_) {
    // Keep local score visible when the global service is offline or unavailable.
  } finally {
    recordRequestInFlight = false;
    showRecord(lastRecord);
  }
}

function updateVehicleHealthBadge(state) {
  const badge = document.getElementById('kano-vehicle-health');
  if (!badge || !state) return;

  const readHealth = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(clamp(number, 0, 100)) : null;
  };
  const body = readHealth(state.condition);
  const engine = readHealth(state.engine);
  const tyres = readHealth(state.tyres);
  const values = [body, engine, tyres].filter((value) => value !== null);
  if (!values.length) return;

  const worst = Math.min(...values);
  const level = worst < 25 ? 'critical' : worst < 50 ? 'warning' : 'good';
  const status = level === 'critical' ? 'SERVICE NOW' : level === 'warning' ? 'SERVICE SOON' : 'STATUS GOOD';
  const display = `KEKE HEALTH · BODY ${body ?? '—'}% · ENGINE ${engine ?? '—'}% · TYRES ${tyres ?? '—'}% · ${status}`;
  if (badge.textContent !== display) badge.textContent = display;
  badge.dataset.level = level;
  badge.hidden = false;
  badge.style.display = 'inline-flex';
  badge.title = level === 'critical'
    ? 'Vehicle condition is critical. Visit the workshop when service options are available.'
    : level === 'warning'
      ? 'Vehicle wear is increasing. Plan a workshop visit.'
      : 'Vehicle condition is currently within the healthy range.';
  renderWorkshopPanel(state);
}

// -----------------------------------------------------------------------------
// Driver/rider visibility for actual motorcycle GLB traffic
// -----------------------------------------------------------------------------
function hasNamedRider(actor) {
  let found = false;
  actor?.traverse?.((node) => {
    // A helmet by itself is not a rider. Some motorcycle GLBs contain a
    // helmet or helmet prop but omit the human model, which caused the old
    // check to suppress the rider fallback incorrectly.
    if (/(rider|motorist|motorcycle.?driver|humanoid|pedestrian|person|driver.?body|biker)/i.test(node.name || '')) {
      found = true;
    }
  });
  return found;
}
function objectContains(root, target) {
  if (!root || !target) return false;
  if (root === target) return true;
  let found = false;
  root.traverse?.((node) => { if (node === target) found = true; });
  return found;
}
function attachRider(actor) {
  if (!actor?.isObject3D || actor.userData?.kanoRepairRider || actor.userData?.kanoGeneratedTraffic) return;
  if (hasNamedRider(actor)) { actor.userData.kanoRiderPresent = true; return; }
  const rider = makeRoot('Kano motorcycle rider');
  const jacket = makeMaterial(rider, '#25313e');
  const trousers = makeMaterial(rider, '#333942');
  const skin = makeMaterial(rider, '#86563b');
  const helmet = makeMaterial(rider, '#f5c542', { metalness: 0.06, roughness: 0.38 });
  makeMesh(rider, new THREE.CapsuleGeometry(0.13, 0.31, 3, 6), jacket, [0, 0.98, 0], [0.95, 1, 0.82]).name = 'Motorcycle rider torso';
  makeMesh(rider, new THREE.SphereGeometry(0.12, 9, 7), skin, [0, 1.26, -0.015]).name = 'Motorcycle rider head';
  makeMesh(rider, new THREE.SphereGeometry(0.145, 9, 7), helmet, [0, 1.32, -0.02]).name = 'Motorcycle rider helmet';
  makeMesh(rider, new THREE.BoxGeometry(0.16, 0.035, 0.05), makeMaterial(rider, '#172029'), [0, 1.32, -0.155]);
  for (const side of [-1, 1]) {
    const arm = makeMesh(rider, new THREE.CapsuleGeometry(0.04, 0.24, 2, 5), jacket, [side * 0.15, 1.01, -0.13]);
    arm.rotation.z = -side * 0.52;
    const leg = makeMesh(rider, new THREE.CapsuleGeometry(0.055, 0.23, 2, 5), trousers, [side * 0.095, 0.64, 0.08]);
    leg.rotation.x = -0.42;
  }
  rider.scale.setScalar(0.78);
  rider.position.set(0, 0.30, 0.02);
  actor.add(rider);
  actor.userData.kanoRepairRider = rider;
  riderGroups.add(rider);
}

// -----------------------------------------------------------------------------
// Player keke ride response. This augments the existing renderer animation only
// while the road is active; it does not alter gameplay physics, speed, collisions,
// steering state, or the garage/morning scenes.
// -----------------------------------------------------------------------------
function applyPlayerKekeRideResponse(renderer, state, dt) {
  if (!renderer || renderer.lifeScene !== 'road') {
    if (renderer) renderer._kanoRideBasePlayer = null;
    return;
  }
  const player = renderer.player;
  if (!player?.isObject3D) return;

  // Keep a stable vertical anchor. Adding an oscillating offset directly to the
  // current y-position every frame can slowly walk the keke up or down over a
  // long run. Re-anchor when the active player model changes or road play resumes.
  if (renderer._kanoRideBasePlayer !== player || !Number.isFinite(renderer._kanoRideBaseY)) {
    renderer._kanoRideBasePlayer = player;
    renderer._kanoRideBaseY = Number(player.position.y) || 0;
  }

  const delta = clamp(Number(dt) || 0, 0, 0.05);
  if (delta <= 0) return;

  const signedSpeed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse
      ? -Math.abs(Number(state?.speed) || 0)
      : Math.abs(Number(state?.speed) || 0);
  const speed = Math.abs(signedSpeed);
  const speedFactor = clamp(speed / 38, 0, 1);
  const steer = clamp(Number(state?.steer) || 0, -1, 1);

  renderer._kanoRideTime = (Number(renderer._kanoRideTime) || 0)
    + delta * (1.0 + speedFactor * 1.7);
  const time = renderer._kanoRideTime;

  // Low-amplitude suspension response. Wet and muddy surfaces feel rougher;
  // road texture does not move independently of the game world's scroll.
  const roadFactor = state?.environment === 'muddy'
    ? 1.0
    : state?.environment === 'rainPuddles'
      ? 0.74
      : 0.24;
  const suspension = Math.sin(time * (5.8 + speedFactor * 5.4))
    * (0.0015 + speedFactor * 0.0045) * roadFactor;
  const impact = clamp(Number(state?.crashShake) || 0, 0, 1.25);
  const impactPulse = Math.sin(time * 38) * impact * 0.006;
  player.position.y = renderer._kanoRideBaseY + suspension + impactPulse;

  // The stock renderer has already set its steering bank before it calls the
  // driver animator. Add a small chassis response without accumulating angles.
  const steeringBank = -steer * (0.008 + speedFactor * 0.012);
  const surfaceRoll = Math.sin(time * 3.4) * roadFactor * 0.0018;
  player.rotation.z = -steer * 0.075 + steeringBank + surfaceRoll;

  // Subtle pitch makes throttle, braking and reversing easier to read visually.
  const pitch = state?.reverse
    ? speedFactor * 0.010
    : state?.brake
      ? speedFactor * 0.014
      : state?.gas
        ? -speedFactor * 0.006
        : 0;
  player.rotation.x = pitch + Math.sin(time * 31) * impact * 0.0025;

  // Imported keke models may not provide their wheels through the native driver
  // rig. Rotate only explicitly named wheels in that case to avoid double-spin.
  const rigWheels = player.userData?.driverAnimationParts?.wheels;
  if (Array.isArray(rigWheels) && rigWheels.length) return;

  if (renderer._kanoPlayerWheelRoot !== player) {
    const namedWheels = [];
    const seen = new Set();
    player.traverse?.((node) => {
      if (node === player || !node?.isObject3D || seen.has(node)) return;
      const name = `${node.name || ''} ${node.userData?.name || ''}`;
      if (!/(wheel|tyre|tire)/i.test(name)) return;
      if (!node.isMesh && !(node.children?.length)) return;
      seen.add(node);
      namedWheels.push(node);
    });
    renderer._kanoPlayerWheelRoot = player;
    renderer._kanoPlayerNamedWheels = namedWheels;
  }
  for (const wheel of renderer._kanoPlayerNamedWheels || []) {
    if (!wheel?.parent) continue;
    try { wheel.rotateX(signedSpeed * delta * 0.08); } catch (_) {}
  }
}

// Animate traffic wheels and suspension without replacing the vehicle models.
// Imported GLBs use wheel/tire names when available; procedural fallbacks expose
// the keke wheel list directly, with geometry-based detection for fallback cars
// and motorcycles. Original rotations and transforms are preserved.
function collectTrafficWheels(actor) {
  if (!actor?.isObject3D) return [];
  if (Array.isArray(actor.userData?.kanoTrafficWheelParts)) {
    return actor.userData.kanoTrafficWheelParts;
  }

  const parts = actor.userData?.driverAnimationParts?.wheels;
  if (Array.isArray(parts) && parts.length) {
    actor.userData.kanoTrafficWheelParts = parts.filter((wheel) => wheel?.isObject3D);
    return actor.userData.kanoTrafficWheelParts;
  }

  const wheels = [];
  const seen = new Set();
  actor.traverse?.((node) => {
    if (!node?.isMesh || !node.geometry || seen.has(node)) return;
    const name = `${node.name || ''} ${node.material?.name || ''}`;
    const geometry = node.geometry;
    const type = geometry.type || '';
    const radius = Number(geometry.parameters?.radiusTop ?? geometry.parameters?.radius ?? 0);
    const namedWheel = /wheel|tyre|tire/i.test(name) && (radius >= 0.12 || type === 'TorusGeometry' || geometry.isBufferGeometry === true);
    const fallbackBikeWheel = type === 'TorusGeometry' && Number(node.position?.y) < 0.55;
    const fallbackCarWheel = type === 'CylinderGeometry'
      && radius >= 0.19
      && Number(node.position?.y) > 0.12
      && Number(node.position?.y) < 0.42
      && Math.abs(Math.abs(Number(node.rotation?.z) || 0) - Math.PI / 2) < 0.18
      && (Math.abs(Number(node.position?.x) || 0) > 0.3 || Math.abs(Number(node.position?.z) || 0) > 0.3);

    if (namedWheel || fallbackBikeWheel || fallbackCarWheel) {
      seen.add(node);
      wheels.push(node);
    }
  });

  actor.userData ||= {};
  actor.userData.kanoTrafficWheelParts = wheels;
  return wheels;
}

function animateTrafficActor(actor, vehicle, dt, time) {
  if (!actor?.isObject3D || dt <= 0) return;
  actor.userData ||= {};
  if (!Number.isFinite(actor.userData.kanoTrafficPhase)) {
    actor.userData.kanoTrafficPhase = Math.random() * Math.PI * 2;
  }
  if (!Number.isFinite(actor.userData.kanoTrafficBaseZ)) {
    actor.userData.kanoTrafficBaseZ = Number(actor.rotation.z) || 0;
  }

  const phase = actor.userData.kanoTrafficPhase;
  const speed = clamp(Number(vehicle?.speedKmh) || Number(vehicle?.speed) * 24 || 0, 0, 55);
  const directionSign = vehicle?.direction === -1 ? -1 : 1;
  const wheelStep = directionSign * (speed / 20) * dt;
  const wheels = collectTrafficWheels(actor);
  for (const wheel of wheels) {
    if (!wheel?.isObject3D || !wheel.parent) continue;
    // Local-axis rotation works for the common imported and generated wheel rigs.
    try { wheel.rotateX(wheelStep); } catch (_) {}
  }

  const bike = vehicle?.type === 'motorcycle';
  const keke = vehicle?.type === 'keke';
  const bounce = bike ? 0.010 : keke ? 0.007 : 0.004;
  actor.position.y = Math.max(0, Math.sin(time * (bike ? 7.2 : 4.8) + phase) * bounce);
  actor.rotation.z = actor.userData.kanoTrafficBaseZ
    + Math.sin(time * (bike ? 2.6 : 1.5) + phase) * (bike ? 0.012 : 0.003);

  // A named GLB rider receives a restrained upper-body bob. Procedural fallback
  // riders are animated separately and are not double-animated here.
  const rider = actor.userData.kanoNamedRiderRoot;
  if (rider?.parent && !actor.userData.kanoRepairRider) {
    if (!Number.isFinite(rider.userData.kanoBaseY)) rider.userData.kanoBaseY = Number(rider.position.y) || 0;
    if (!Number.isFinite(rider.userData.kanoBaseZ)) rider.userData.kanoBaseZ = Number(rider.rotation.z) || 0;
    rider.position.y = rider.userData.kanoBaseY + Math.abs(Math.sin(time * 5.1 + phase)) * 0.006;
    rider.rotation.z = rider.userData.kanoBaseZ + Math.sin(time * 2.0 + phase) * 0.008;
  }
}

if (typeof originalMakeTrafficActor === 'function') {
  Renderer3D.prototype.makeTrafficActor = function patchedMakeTrafficActor(vehicle, ...args) {
    const manager = this.models;
    const getInstance = manager?.getInstance;
    let returnedModel = null;
    if (typeof getInstance === 'function') {
      manager.getInstance = function observedGetInstance(...innerArgs) {
        const result = getInstance.apply(this, innerArgs);
        if (result?.isObject3D) returnedModel = result;
        return result;
      };
    }
    let actor;
    try { actor = originalMakeTrafficActor.call(this, vehicle, ...args); }
    finally { if (manager && getInstance) manager.getInstance = getInstance; }
    if (actor && vehicle?.type === 'motorcycle') {
      actor.userData ||= {};
      if (returnedModel && objectContains(actor, returnedModel)) actor.userData.kanoLoadedTrafficModel = true;
      else actor.userData.kanoGeneratedTraffic = true;
      actor.userData.kanoTrafficWheelParts = undefined;
      actor.userData.kanoTrafficBaseZ = Number(actor.rotation.z) || 0;
      actor.userData.kanoTrafficPhase = Math.random() * Math.PI * 2;
      actor.traverse?.((node) => {
        if (!actor.userData.kanoNamedRiderRoot && node !== actor
          && /(rider|motorist|motorcycle.?driver|humanoid|person|driver.?body|biker)/i.test(node.name || '')
          && (node.isGroup || node.children?.length)) {
          actor.userData.kanoNamedRiderRoot = node;
        }
      });
    }
    return actor;
  };
}
if (typeof originalSyncTraffic === 'function') {
  Renderer3D.prototype.syncTraffic = function patchedSyncTraffic(state, ...args) {
    const result = originalSyncTraffic.call(this, state, ...args);
    const traffic = state?.traffic || activeGame?.s?.traffic || [];
    for (const vehicle of traffic) {
      if (vehicle?.type !== 'motorcycle') continue;
      const actor = this.trafficActors?.get?.(vehicle.id) || this.trafficActors?.[vehicle.id];
      if (!actor) continue;
      if (!actor.userData?.kanoNamedRiderRoot) {
        actor.traverse?.((node) => {
          if (!actor.userData.kanoNamedRiderRoot && node !== actor
            && /(rider|motorist|motorcycle.?driver|humanoid|person|driver.?body|biker)/i.test(node.name || '')
            && (node.isGroup || node.children?.length)) {
            actor.userData.kanoNamedRiderRoot = node;
          }
        });
      }
      // Attach to every motorcycle actor. The rider helper intentionally
      // skips this layer's procedural fallback bikes because renderer3d.js
      // already builds a torso and helmet for those. Loaded GLBs are checked
      // by their human-rig names, not by the presence of a helmet alone.
      attachRider(actor);
      const rider = actor.userData?.kanoRepairRider;
      if (rider) {
        const time = Number(this._kanoRepairTime) || 0;
        rider.rotation.z = Math.sin(time * 3.5 + (vehicle.lane || 0)) * 0.018;
        rider.position.y = 0.30 + Math.abs(Math.sin(time * 5.3 + (vehicle.lane || 0))) * 0.018;
      }
      animateTrafficActor(actor, vehicle, clamp(Number(this._kanoRepairDelta) || 0, 0, 0.05), Number(this._kanoRepairTime) || 0);
    }
    return result;
  };
}

// Requested Kano traffic mix: approximately 40% keke, 30% motorcycles, 30% cars.
if (typeof originalSpawnTraffic === 'function') {
  Game.prototype.spawnTraffic = function balancedKanoTraffic(...args) {
    const before = new Set(this.s?.traffic || []);
    const result = originalSpawnTraffic.apply(this, args);
    const added = (this.s?.traffic || []).filter((vehicle) => !before.has(vehicle));
    for (const vehicle of added) {
      const value = Math.random();
      if (value < 0.40) vehicle.type = 'keke';
      else if (value < 0.70) vehicle.type = 'motorcycle';
      else {
        const carChoice = Math.random();
        vehicle.type = carChoice < 0.63 ? 'car' : carChoice < 0.84 ? 'taxi' : 'suv';
      }
    }
    return result;
  };
}

// -----------------------------------------------------------------------------
// Sound mix: keep the recorded engine clearly above synthetic rolling noise.
// -----------------------------------------------------------------------------
if (typeof originalAudioEngine === 'function') {
  AudioManager.prototype.engine = function engineDominantMix(speed, ...args) {
    const result = originalAudioEngine.call(this, speed, ...args);
    try {
      const context = this.ctx || this.audioContext || this.context;
      const now = context?.currentTime || 0;
      const absoluteSpeed = Math.abs(Number(speed) || 0);
      const roadGain = this.roadNoiseGain?.gain;
      if (roadGain) {
        const level = absoluteSpeed > 0.2 ? clamp(absoluteSpeed * 0.0000042, 0.000025, 0.00032) : 0.000015;
        if (typeof roadGain.setTargetAtTime === 'function') roadGain.setTargetAtTime(level, now, 0.08);
        else roadGain.value = level;
      }
      if (this.engineAudio && this.enabled !== false && absoluteSpeed > 1) {
        this.engineAudio.volume = clamp(this.engineAudio.volume || 0.30, 0.30, 0.82);
      }
    } catch (_) {}
    return result;
  };
}

// Reverse-gear changes can come from either the on-screen control or R.
// Keep the visible button and HUD gear label in sync with the actual game state.
if (typeof originalSetReverse === 'function') {
  Game.prototype.setReverse = function trackedSetReverse(value, ...args) {
    const result = originalSetReverse.call(this, value, ...args);
    this.ui?.updateReverseControl?.(this.s);
    return result;
  };
}

// -----------------------------------------------------------------------------
// Tie hook lifetimes to the active game and renderer instances.
// -----------------------------------------------------------------------------
Game.prototype.start = function trackedGameStart(...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  const result = originalGameStart.apply(this, args);
  this.ui?.updateReverseControl?.(this.s);
  updateVehicleHealthBadge(this.s);
  renderLocalRecord();
  return result;
};
Game.prototype.tick = function trackedGameTick(dt, ...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  return originalGameTick.call(this, dt, ...args);
};
if (typeof originalAnimateFallbackDriver === 'function') {
  Renderer3D.prototype.animateFallbackDriver = function responsivePlayerDriver(state, dt, ...args) {
    const result = originalAnimateFallbackDriver.call(this, state, dt, ...args);
    try {
      applyPlayerKekeRideResponse(this, state, dt);
    } catch (error) {
      if (!this._kanoRideResponseWarningShown) {
        this._kanoRideResponseWarningShown = true;
        console.warn('[Kano Life] Player ride response skipped safely.', error);
      }
    }
    return result;
  };
}

if (typeof originalRendererDraw === 'function') {
  Renderer3D.prototype.draw = function patchedPresentationDraw(state, dt, ...args) {
    activeRenderer = this;
    tuneRendererForClarity(this);
    this._kanoRepairDelta = clamp(dt, 0, 0.05);
    this._kanoRepairTime = (Number(this._kanoRepairTime) || 0) + this._kanoRepairDelta;
    const game = activeGame || window.__KANO_LIFE_GAME__;
    const eventType = typeof game?.s?.event === 'string' ? game.s.event : null;
    try {
      syncEventVisual(this, eventType);
      animateEventVisual(this, dt);
      animatePotholeDetails(dt);
    } catch (error) {
      if (!this._kanoRepairWarningShown) {
        this._kanoRepairWarningShown = true;
        console.warn('[Kano Life] Event presentation recovered from a visual error.', error);
      }
    }
    const result = originalRendererDraw.call(this, state, dt, ...args);
    // Release only rider geometry created by this layer when an actor leaves the scene.
    for (const rider of [...riderGroups]) {
      let node = rider;
      let attached = false;
      while (node) { if (node === worldFor(this)) { attached = true; break; } node = node.parent; }
      if (!attached) {
        riderGroups.delete(rider);
        disposeRoot(rider);
      }
    }
    return result;
  };
}
window.addEventListener('pagehide', () => {
  if (recordRefreshTimer) window.clearInterval(recordRefreshTimer);
  if (activeRenderer?._kanoRepairEventVisual?.root) disposeRoot(activeRenderer._kanoRepairEventVisual.root);
}, { once: true });

// -----------------------------------------------------------------------------
// Persistent player-vehicle damage
//
// Game.s remains the live-run authority. The lifecycle director stores the
// damaged component health so a new run or page reload does not magically
// restore the keke to 100%. This layer never deducts money or performs repairs.
// -----------------------------------------------------------------------------
const KANO_PLAYER_VEHICLE_ID = 'kano-life-player-keke-v1';
let lifecycleWarningShown = false;

function ensureKekeLifecycle(game) {
  if (!game || !game.s) return null;
  try {
    if (!game.vehicleLifecycle || typeof game.vehicleLifecycle.getVehicle !== 'function') {
      game.vehicleLifecycle = new KanoVehicleLifecycleDirector();
    }
    game.playerVehicleId ||= KANO_PLAYER_VEHICLE_ID;
    let vehicle = game.vehicleLifecycle.getVehicle(game.playerVehicleId);
    if (!vehicle) {
      vehicle = game.vehicleLifecycle.createVehicle({
        id: game.playerVehicleId,
        type: 'keke',
        name: 'Adaidaita Sahu',
        odometerKm: Math.max(0, Number(game.s.distance) || 0),
        parts: {
          body: { health: clamp(game.s.condition, 0, 100) },
          engine: { health: clamp(game.s.engine, 0, 100) },
          tyres: { health: clamp(game.s.tyres, 0, 100) },
        },
      });
    }
    return vehicle || game.vehicleLifecycle.getVehicle(game.playerVehicleId);
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Persistent vehicle damage is unavailable; the normal run will continue.', error);
    }
    return null;
  }
}

function syncRunHealthToLifecycle(game) {
  const vehicle = ensureKekeLifecycle(game);
  if (!vehicle) return null;
  try {
    game.vehicleLifecycle.syncPartHealth({
      vehicleId: game.playerVehicleId,
      parts: {
        body: clamp(game.s.condition, 0, 100),
        engine: clamp(game.s.engine, 0, 100),
        tyres: clamp(game.s.tyres, 0, 100),
      },
    });
    return game.vehicleLifecycle.getVehicle(game.playerVehicleId);
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Vehicle health could not be saved; gameplay remains active.', error);
    }
    return null;
  }
}

function applyLifecycleHealthToRun(game, suppliedVehicle = null) {
  if (!game?.s) return false;
  try {
    const vehicle = suppliedVehicle || ensureKekeLifecycle(game);
    if (!vehicle?.parts) return false;
    const bodyHealth = Number(vehicle.parts.body?.health);
    const engineHealth = Number(vehicle.parts.engine?.health);
    const tyreHealth = Number(vehicle.parts.tyres?.health);
    if (Number.isFinite(bodyHealth)) game.s.condition = clamp(bodyHealth, 0, 100);
    if (Number.isFinite(engineHealth)) game.s.engine = clamp(engineHealth, 0, 100);
    if (Number.isFinite(tyreHealth)) game.s.tyres = clamp(tyreHealth, 0, 100);
    return true;
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Persistent health could not be restored; gameplay remains active.', error);
    }
    return false;
  }
}

if (typeof originalResetRun === 'function') {
  Game.prototype.resetRun = function persistentVehicleReset(...args) {
    const result = originalResetRun.apply(this, args);
    // On the very first reset this creates a record from the fresh default
    // health. On later resets it restores the saved component health.
    const vehicle = ensureKekeLifecycle(this);
    applyLifecycleHealthToRun(this, vehicle);
    updateVehicleHealthBadge(this.s);
    return result;
  };
}

if (typeof originalHitTraffic === 'function') {
  Game.prototype.hit = function persistentTrafficImpact(vehicle, ...args) {
    const s = this.s;
    const playerSignedSpeed = Number.isFinite(s?.signedSpeed)
      ? Number(s.signedSpeed)
      : (s?.reverse ? -Math.abs(Number(s?.speed) || 0) : Math.abs(Number(s?.speed) || 0));
    const trafficSpeed = Math.max(0, Number(vehicle?.speedKmh) || 25);
    const trafficSignedSpeed = (vehicle?.direction === -1 ? -1 : 1) * trafficSpeed;
    const relativeSpeed = Math.abs(playerSignedSpeed - trafficSignedSpeed);
    const severity = clamp(relativeSpeed / 100, 0.08, 0.42);

    const result = originalHitTraffic.call(this, vehicle, ...args);
    try {
      if (!this.s || !this.vehicleLifecycle) ensureKekeLifecycle(this);
      if (this.vehicleLifecycle) {
        // Record the event first, then persist the game's actual post-collision
        // health. This preserves lifecycle impact history without applying the
        // same collision damage a second time.
        this.vehicleLifecycle.recordImpact({
          vehicleId: this.playerVehicleId,
          part: 'body',
          severity,
          collision: true,
        });
      }
      const persistent = syncRunHealthToLifecycle(this);
      if (persistent) this.ui?.update?.(this.s, this.route, this.driver);
      updateVehicleHealthBadge(this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Traffic impact persistence skipped safely.', error);
      }
    }
    return result;
  };
}

if (typeof originalHitPothole === 'function') {
  Game.prototype.hitPothole = function persistentPotholeImpact(...args) {
    const result = originalHitPothole.apply(this, args);
    try {
      if (!this.s || !this.vehicleLifecycle) ensureKekeLifecycle(this);
      if (this.vehicleLifecycle) {
        const roughRoad = this.s?.environment === 'badRoad' || this.s?.environment === 'muddy';
        // Keep the director's separate suspension-wear record, then overwrite
        // shared body/engine/tyre health with the exact result from the game.
        this.vehicleLifecycle.recordImpact({
          vehicleId: this.playerVehicleId,
          part: 'suspension',
          severity: roughRoad ? 0.22 : 0.14,
          pothole: true,
        });
      }
      const persistent = syncRunHealthToLifecycle(this);
      if (persistent) this.ui?.update?.(this.s, this.route, this.driver);
      updateVehicleHealthBadge(this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Pothole damage persistence skipped safely.', error);
      }
    }
    return result;
  };
}

// Save non-impact condition changes too (for example a scripted breakdown or
// roadside repair) only when a component actually changes. This avoids writes
// on every frame while preserving the live game's existing rules.
const presentationTrackedTick = Game.prototype.tick;
if (typeof presentationTrackedTick === 'function') {
  Game.prototype.tick = function persistChangedVehicleHealth(dt, ...args) {
    const before = this.s ? {
      body: Number(this.s.condition),
      engine: Number(this.s.engine),
      tyres: Number(this.s.tyres),
    } : null;
    const result = presentationTrackedTick.call(this, dt, ...args);
    try {
      const s = this.s;
      if (before && s && (
        Math.abs(Number(s.condition) - before.body) > 0.001 ||
        Math.abs(Number(s.engine) - before.engine) > 0.001 ||
        Math.abs(Number(s.tyres) - before.tyres) > 0.001
      )) {
        syncRunHealthToLifecycle(this);
      }
      updateVehicleHealthBadge(s || this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Changed vehicle health could not be persisted; gameplay remains active.', error);
      }
    }
    return result;
  };
}

// Register all hooks before the actual game entry point creates its objects.
await import('./main.js');
