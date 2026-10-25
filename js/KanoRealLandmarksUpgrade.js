/**
 * Real Kano landmarks shown only on the routes where they actually stand:
 *  - Kofar Mata: the old city gate arch spanning the road
 *  - Kano City Centre / Murtala Muhammad Way: the "I ♥ KANO" monument board
 * Built from shared low-poly primitives; scrolls with the road like other scenery.
 */
import * as THREE from 'three';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';

const PATCH_TAG = Symbol.for('kano.life.realLandmarks.v1');
const states = new WeakMap();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const KANO_LANDMARK_ROUTES = {
  'Kofar Mata': 'kofarMataGate',
  'Kofar Famfo': 'kofarFamfoGate',
  'Kano City Centre': 'iLoveKano',
  'Murtala Muhammad Way': 'iLoveKano',
};

const mat = (color, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough });

function textTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = lines.bg; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = lines.border; g.lineWidth = 12; g.strokeRect(8, 8, 1008, 240);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px Arial, sans-serif';
  g.lineWidth = 10; g.strokeStyle = lines.stroke; g.strokeText(lines.main, 512, 100);
  g.fillStyle = lines.fg; g.fillText(lines.main, 512, 100);
  g.font = '800 54px Arial, sans-serif';
  g.fillStyle = lines.fg2; g.fillText(lines.sub, 512, 205);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildKofarMataGate() {
  // Style from the reference photo: cream twin-arch city gate on red-brown pillars,
  // with a white signboard on each arch carrying green capital letters.
  const root = new THREE.Group();
  root.name = 'KANO_CITY_GATE';
  const cream = mat(0xe9e1c9);
  const creamShade = mat(0xd3c9ac);
  const pillarMat = mat(0x9a4a2e);
  const spanHalf = 7.6;
  // central pier with red-brown twin columns
  const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.2, 1.6), creamShade);
  pier.position.set(0, 3.1, 0);
  root.add(pier);
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 6.0, 10), pillarMat);
    col.position.set(s * 1.5, 3.0, 0.9);
    root.add(col);
  }
  // end piers
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.2, 1.6), creamShade);
    end.position.set(s * (spanHalf * 2 - 0.4) * 0.5 * 1.02 * 1.0 + s * 0.0, 3.1, 0);
    end.position.x = s * (spanHalf + 1.6);
    root.add(end);
  }
  // two arches (half tori) and the cream deck above them
  for (const s of [-1, 1]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(spanHalf / 2 + 0.1, 0.55, 8, 24, Math.PI), cream);
    arch.position.set(s * (spanHalf / 2 + 1.2), 3.3, 0);
    root.add(arch);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 1.7),
      new THREE.MeshBasicMaterial({ map: textTexture({ bg: '#f4f1e6', border: '#d9d2bd', stroke: '#f4f1e6', fg: '#0b7a3b', fg2: '#0b7a3b', main: s < 0 ? 'KOFAR' : 'KANO', sub: '' }), toneMapped: false, side: THREE.DoubleSide }),
    );
    board.position.set(s * (spanHalf / 2 + 1.2), 7.7, 0.85);
    root.add(board);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2 * (spanHalf + 1.6) + 1.8, 2.6, 1.6), cream);
  deck.position.set(0, 7.5, 0);
  root.add(deck);
  root.userData.spacing = 230;
  return root;
}

function buildILoveKano() {
  const root = new THREE.Group();
  root.name = 'KANO_I_LOVE_KANO_MONUMENT';
  const steel = mat(0x3b3f45, 0.6);
  for (const s of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steel);
    pylon.position.set(s * 6.2, 4.5, 0);
    root.add(pylon);
  }
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3.4),
    new THREE.MeshBasicMaterial({ map: textTexture({ bg: '#0f5a3a', border: '#ffffff', stroke: '#06281a', fg: '#ffffff', fg2: '#d8ff2a', main: 'I ♥ KANO', sub: 'CENTRE OF COMMERCE' }), toneMapped: false, side: THREE.DoubleSide }),
  );
  board.position.set(0, 9.2, 0);
  root.add(board);
  root.userData.spacing = 200;
  return root;
}


// Twin-arch cream gate with red-brown pillars and green lettering (Kofar Famfo).
function buildKofarFamfoGate() {
  const root = new THREE.Group();
  root.name = 'KANO_KOFAR_FAMFO_GATE';
  const cream = mat(0xe8dfc4);
  const pillarMat = mat(0x9b4a2a);
  const span = 9;
  for (const s of [-1, 1]) {
    const outer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7.2, 1.8), cream);
    outer.position.set(s * (span + 3.2), 3.6, 0);
    root.add(outer);
  }
  // central red-brown pillars carrying posters
  for (const s of [-0.5, 0.5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 6.6, 12), pillarMat);
    p.position.set(s * 1.5, 3.3, 0);
    root.add(p);
  }
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.0, 1.6), cream);
  core.position.set(0, 3.2, 0);
  root.add(core);
  for (const s of [-1, 1]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2 + 1, 0.8, 8, 20, Math.PI), cream);
    arch.position.set(s * (span / 2 + 2.1), 6.4, 0);
    root.add(arch);
    const top = new THREE.Mesh(new THREE.BoxGeometry(span + 3.4, 1.6, 1.8), cream);
    top.position.set(s * (span / 2 + 2.1), 8.0, 0);
    root.add(top);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(span - 1.5, 1.7),
      new THREE.MeshBasicMaterial({ map: textTexture({ bg: '#f4f1e6', border: '#f4f1e6', stroke: '#f4f1e6', fg: '#0f7a3c', fg2: '#f4f1e6', main: s < 0 ? 'KOFAR' : 'FAMFO', sub: '' }), toneMapped: false, side: THREE.DoubleSide }),
    );
    board.position.set(s * (span / 2 + 2.1), 8.0, 0.95);
    root.add(board);
  }
  root.userData.spacing = 240;
  return root;
}

// Pedestrian footbridge: pink/white deck on pink piers with stair towers (seen over Kano dual carriageways).
function buildFootbridge() {
  const root = new THREE.Group();
  root.name = 'KANO_PINK_FOOTBRIDGE';
  const pink = mat(0xd8478f, 0.8);
  const white = mat(0xf4f1ec, 0.8);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.35, 2.0), white);
  deck.position.set(0, 6.0, 0);
  root.add(deck);
  for (const z of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 0.12), white);
    rail.position.set(0, 6.65, z * 0.95);
    root.add(rail);
  }
  for (const x of [-9, 9]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.0, 1.6), pink);
    pier.position.set(x, 3.0, 0);
    root.add(pier);
  }
  for (const s of [-1, 1]) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 1.8), white);
    stair.position.set(s * 15.5, 3.0, 0);
    stair.rotation.z = s * -0.5;
    root.add(stair);
  }
  root.userData.spacing = 340;
  return root;
}

function update(system, dt, snap) {
  if (!system?.renderer?.world || system.renderer.disposed) return;
  let st = states.get(system);
  if (!st) {
    st = { group: new THREE.Group(), actors: {}, current: null };
    st.group.name = 'KANO_REAL_LANDMARKS';
    system.renderer.world.add(st.group);
    states.set(system, st);
  }
  const road = !system.renderer.lifeScene || system.renderer.lifeScene === 'road';
  const key = road ? KANO_LANDMARK_ROUTES[snap?.route] || 'footbridge' : null;
  if (key !== st.current) {
    for (const actor of Object.values(st.actors)) actor.visible = false;
    st.current = key;
    if (key) {
      if (!st.actors[key]) {
        st.actors[key] = key === 'kofarMataGate' ? buildKofarMataGate()
          : key === 'kofarFamfoGate' ? buildKofarFamfoGate()
          : key === 'footbridge' ? buildFootbridge() : buildILoveKano();
        st.group.add(st.actors[key]);
      }
      const actor = st.actors[key];
      actor.visible = true;
      actor.position.set(0, 0, -120);
    }
  }
  if (!key) return;
  const actor = st.actors[key];
  const delta = clamp(dt, 0, 0.05);
  const signed = Number.isFinite(snap?.signedSpeed) ? snap.signedSpeed
    : snap?.reverse ? -Math.abs(Number(snap?.speed) || 0) : Math.abs(Number(snap?.speed) || 0);
  actor.position.z += signed * delta * 0.28;
  if (actor.position.z > 18) actor.position.z -= actor.userData.spacing;
  else if (actor.position.z < -actor.userData.spacing + 18) actor.position.z += actor.userData.spacing;
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithRealLandmarks(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { update(this, dt, state); } catch (error) { console.warn('[Kano landmarks] skipped', error); }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeRealLandmarks(...args) {
      const st = states.get(this);
      if (st) { st.group.parent?.remove(st.group); states.delete(this); }
      return originalDispose.apply(this, args);
    };
  }
}
