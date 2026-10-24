/**
 * Roadside life: a herd of goats, stray dogs and KAROTA traffic officers.
 * Everything is built from small low-poly meshes (no new assets, no extra
 * draw-call explosion: ~12 actors, shared geometries/materials).
 * Actors scroll with the road exactly like the existing roadside children.
 */
import * as THREE from 'three';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { createProceduralGoat } from './KanoCulturalStreetEventsUpgrade.js';

const PATCH_TAG = Symbol.for('kano.life.streetAnimalsOfficer.v1');
const states = new WeakMap();
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const kanoStreetAnimalsAudit = { goats: 0, dogs: 0, officers: 0, errors: [] };

const mat = (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const SHARED = {};
function shared() {
  if (SHARED.ready) return SHARED;
  SHARED.ready = true;
  SHARED.dogCoats = [0xb98a55, 0x2f2a26, 0xd9c7a0, 0x7b5a3a].map((c) => mat(c, 0.95));
  SHARED.dark = mat(0x1d1a18);
  SHARED.sphere = new THREE.SphereGeometry(1, 10, 8);
  SHARED.cap = new THREE.CapsuleGeometry(0.5, 1, 3, 6);
  SHARED.box = new THREE.BoxGeometry(1, 1, 1);
  SHARED.cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  SHARED.cone = new THREE.ConeGeometry(1, 1, 10);
  SHARED.uniform = mat(0x1f4d3a);
  SHARED.vest = new THREE.MeshStandardMaterial({ color: 0xd8ff2a, roughness: 0.6, emissive: 0x44550a, emissiveIntensity: 0.35 });
  SHARED.skin = mat(0x6b4630, 0.8);
  SHARED.capMat = mat(0x14301f);
  SHARED.baton = new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xaa1500, emissiveIntensity: 0.6 });
  SHARED.white = mat(0xf2f2ec);
  SHARED.orange = mat(0xff7a1a, 0.7);
  return SHARED;
}
function part(parent, geo, material, pos, scale, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

function createDog() {
  const S = shared();
  const root = new THREE.Group();
  root.name = 'KANO_STRAY_DOG';
  const coat = S.dogCoats[Math.floor(Math.random() * S.dogCoats.length)];
  part(root, S.sphere, coat, [0, 0.42, 0], [0.34, 0.17, 0.15]);
  part(root, S.sphere, coat, [0.30, 0.52, 0], [0.12, 0.12, 0.11]);
  part(root, S.sphere, S.dark, [0.42, 0.49, 0], [0.07, 0.05, 0.05]);
  for (const s of [-1, 1]) part(root, S.cone, coat, [0.27, 0.64, s * 0.07], [0.04, 0.12, 0.03], [0, 0, 0]);
  const tail = part(root, S.cap, coat, [-0.34, 0.50, 0], [0.04, 0.2, 0.04], [0, 0, 0.9]);
  const legs = [];
  for (const x of [-0.22, 0.2]) for (const z of [-0.09, 0.09]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    part(pivot, S.cap, coat, [0, -0.15, 0], [0.05, 0.22, 0.05]);
    root.add(pivot);
    legs.push(pivot);
  }
  root.scale.setScalar(1.15);
  return { root, legs, tail };
}

function createOfficer() {
  const S = shared();
  const root = new THREE.Group();
  root.name = 'KANO_KAROTA_OFFICER';
  part(root, S.box, S.uniform, [0, 0.95, 0], [0.38, 0.62, 0.22]);            // torso
  part(root, S.box, S.vest, [0, 0.98, 0.002], [0.4, 0.5, 0.235]);             // hi-vis vest
  part(root, S.box, S.white, [0, 1.0, 0.12], [0.4, 0.06, 0.02]);              // reflective band
  for (const s of [-1, 1]) part(root, S.cap, S.uniform, [s * 0.12, 0.32, 0], [0.12, 0.62, 0.12]); // legs
  part(root, S.sphere, S.skin, [0, 1.46, 0], [0.13, 0.15, 0.13]);             // head
  part(root, S.cyl, S.capMat, [0, 1.6, 0], [0.14, 0.05, 0.14]);               // cap crown
  part(root, S.box, S.capMat, [0, 1.55, 0.12], [0.2, 0.025, 0.12]);           // peak
  part(root, S.box, S.white, [0, 1.12, 0.125], [0.17, 0.06, 0.012]);          // badge/KAROTA strip
  const armL = new THREE.Group(); armL.position.set(-0.26, 1.2, 0);
  part(armL, S.cap, S.uniform, [0, -0.22, 0], [0.1, 0.4, 0.1]);
  root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.26, 1.2, 0);
  part(armR, S.cap, S.uniform, [0, -0.22, 0], [0.1, 0.4, 0.1]);
  part(armR, S.cyl, S.baton, [0, -0.5, 0.12], [0.025, 0.5, 0.025], [Math.PI / 2.4, 0, 0]);
  root.add(armR);
  // roadside sign + cones so the officer reads from a distance
  const sign = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#12351f'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#f5d77b'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
  g.fillStyle = '#fff4d0'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.fillText('KAROTA', 128, 62);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 2.05, 0);
  part(sign, S.cyl, S.dark, [0, 1.0, 0], [0.025, 1.0, 0.025]);
  sign.add(face);
  sign.position.set(0.7, 0, 0);
  root.add(sign);
  for (const z of [0.8, 1.6]) part(root, S.cone, S.orange, [0.3, 0.2, z], [0.14, 0.4, 0.14]);
  root.scale.setScalar(1.12);
  return { root, armR, armL };
}

function buildState(system) {
  const world = system.renderer.world;
  const group = new THREE.Group();
  group.name = 'KANO_STREET_ANIMALS_OFFICERS';
  world.add(group);
  const state = { group, goats: [], dogs: [], officers: [], t: 0, disposed: false };
  const sideOf = (i) => (i % 2 ? 1 : -1);
  for (let i = 0; i < 5; i += 1) {
    const goat = createProceduralGoat();
    goat.root.visible = true;
    const side = sideOf(i);
    const herdZ = -40 - Math.floor(i / 3) * 70;
    goat.root.position.set(side * rand(7.2, 8.2), 0.012, herdZ - rand(0, 8));
    goat.root.rotation.y = rand(0, Math.PI * 2);
    goat.root.scale.setScalar(rand(0.62, 0.8));
    group.add(goat.root);
    state.goats.push({ ...goat, side, phase: rand(0, 6), heading: goat.root.rotation.y, speed: rand(0.05, 0.25) });
  }
  for (let i = 0; i < 3; i += 1) {
    const dog = createDog();
    const side = sideOf(i + 1);
    dog.root.position.set(side * rand(6.9, 8), 0, -30 - i * 45 - rand(0, 20));
    group.add(dog.root);
    state.dogs.push({ ...dog, side, phase: rand(0, 6), vz: rand(0.6, 1.6) * (Math.random() < 0.5 ? 1 : -1) });
  }
  for (let i = 0; i < 2; i += 1) {
    const officer = createOfficer();
    const side = sideOf(i);
    officer.root.position.set(side * 6.1, 0, -60 - i * 85);
    officer.root.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(officer.root);
    state.officers.push({ ...officer, side, phase: rand(0, 6) });
  }
  kanoStreetAnimalsAudit.goats = state.goats.length;
  kanoStreetAnimalsAudit.dogs = state.dogs.length;
  kanoStreetAnimalsAudit.officers = state.officers.length;
  return state;
}

function recycle(root, side, minZ, maxZ, xMin, xMax) {
  root.position.z = -rand(minZ, maxZ);
  root.position.x = side * rand(xMin, xMax);
}

function update(system, dt, snap) {
  if (!system?.renderer?.world || system.renderer.disposed) return;
  let state = states.get(system);
  if (!state) { state = buildState(system); states.set(system, state); }
  const visible = !system.renderer.lifeScene || system.renderer.lifeScene === 'road';
  state.group.visible = visible;
  if (!visible) return;
  const delta = clamp(dt, 0, 0.05);
  state.t += delta;
  const signed = Number.isFinite(snap?.signedSpeed) ? snap.signedSpeed
    : snap?.reverse ? -Math.abs(Number(snap?.speed) || 0) : Math.abs(Number(snap?.speed) || 0);
  const scroll = signed * delta * 0.28;

  for (const g of state.goats) {
    const r = g.root;
    r.position.z += scroll;
    g.phase += delta;
    // slow grazing wander with a bobbing step; stay on the shoulder
    if (Math.sin(g.phase * 0.4) > 0.2) {
      r.position.x += Math.sin(g.heading) * g.speed * delta;
      r.position.z += Math.cos(g.heading) * g.speed * delta;
      g.legPivots.forEach((leg, i) => { leg.rotation.z = Math.sin(g.phase * 6 + i * Math.PI * 0.5) * 0.14; });
    } else {
      g.legPivots.forEach((leg) => { leg.rotation.z *= 0.9; });
      if (Math.random() < 0.01) g.heading = rand(0, Math.PI * 2);
    }
    r.rotation.y = g.heading + Math.PI / 2;
    if (Math.abs(r.position.x) < 6.6) r.position.x = g.side * 7.0;
    if (Math.abs(r.position.x) > 9.5) r.position.x = g.side * 8.0;
    if (r.position.z > 10) recycle(r, g.side, 120, 170, 7.0, 8.4);
    else if (r.position.z < -185) r.position.z = 10;
  }

  for (const d of state.dogs) {
    const r = d.root;
    d.phase += delta;
    r.position.z += scroll + d.vz * delta;
    r.rotation.y = d.vz > 0 ? 0 : Math.PI;
    r.rotation.y += Math.PI / 2 * -1;
    d.legs.forEach((leg, i) => { leg.rotation.z = Math.sin(d.phase * 11 + (i % 2) * Math.PI + (i > 1 ? 0.5 : 0)) * 0.5; });
    d.tail.rotation.x = Math.sin(d.phase * 9) * 0.5;
    r.position.y = Math.abs(Math.sin(d.phase * 11)) * 0.015;
    if (r.position.z > 10) recycle(r, d.side, 110, 170, 6.9, 8);
    else if (r.position.z < -190) r.position.z = 10;
  }

  for (const o of state.officers) {
    const r = o.root;
    o.phase += delta;
    r.position.z += scroll;
    o.armR.rotation.z = -1.9 + Math.sin(o.phase * 3.2) * 0.45;   // waving the baton
    o.armL.rotation.z = 0.15;
    if (r.position.z > 12) recycle(r, o.side, 110, 190, 6.0, 6.3);
    else if (r.position.z < -200) r.position.z = 12;
  }
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithStreetAnimalsOfficers(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { update(this, dt, state); } catch (error) {
        if (kanoStreetAnimalsAudit.errors.length < 6) kanoStreetAnimalsAudit.errors.push(String(error?.message || error));
      }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeStreetAnimalsOfficers(...args) {
      const state = states.get(this);
      if (state) { state.group.parent?.remove(state.group); states.delete(this); }
      return originalDispose.apply(this, args);
    };
  }
}
