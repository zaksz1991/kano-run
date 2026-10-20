/**
 * KANO LIFE — GAMEPLAY PRESENTATION REPAIR
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
const originalBeginMorningRoutine = UI.prototype.beginMorningRoutine;
const originalUIBind = UI.prototype.bind;
const originalGameStart = Game.prototype.start;
const originalGameTick = Game.prototype.tick;
const originalSpawnTraffic = Game.prototype.spawnTraffic;
const originalRendererDraw = Renderer3D.prototype.draw;
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
  root.parent?.remove(root);
  const resources = root.userData?.kanoRepairResources;
  for (const geometry of resources?.geometries || []) {
    try { geometry.dispose(); } catch (_) {}
  }
  for (const material of resources?.materials || []) {
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
UI.prototype.bind = function patchedUIBind(game, ...args) {
  const result = originalUIBind.call(this, game, ...args);
  this.game = game;
  activeUI = this;
  activeGame = game;
  window.__KANO_LIFE_GAME__ = game;
  installRecordUI();
  renderLocalRecord();
  refreshOverallRecord(true);
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
      #hud .hud-bottom{display:flex;flex-wrap:wrap;align-items:center;row-gap:5px}
      #game-canvas{display:block;width:100%;height:100%;image-rendering:auto;touch-action:none;outline:none}
      #app,#game-container{min-width:0;max-width:100vw}
      #drive-controls .control{touch-action:manipulation;-webkit-user-select:none;user-select:none}
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

// -----------------------------------------------------------------------------
// Tie hook lifetimes to the active game and renderer instances.
// -----------------------------------------------------------------------------
Game.prototype.start = function trackedGameStart(...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  const result = originalGameStart.apply(this, args);
  renderLocalRecord();
  return result;
};
Game.prototype.tick = function trackedGameTick(dt, ...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  return originalGameTick.call(this, dt, ...args);
};
if (typeof originalRendererDraw === 'function') {
  Renderer3D.prototype.draw = function patchedPresentationDraw(state, dt, ...args) {
    activeRenderer = this;
    tuneRendererForClarity(this);
    this._kanoRepairTime = (Number(this._kanoRepairTime) || 0) + clamp(dt, 0, 0.05);
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

// Register all hooks before the actual game entry point creates its objects.
await import('./main.js');
