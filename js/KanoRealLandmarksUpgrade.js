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
  const root = new THREE.Group();
  root.name = 'KANO_KOFAR_MATA_GATE';
  const mud = mat(0xb08a5c);
  const mudDark = mat(0x8f6c44);
  const w = 3.0, h = 9.0, x = 8.2;
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3.2), mud);
    pillar.position.set(s * x, h / 2, 0);
    root.add(pillar);
    // tapering buttress like the old city wall
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 2.2, 4), mudDark);
    base.position.set(s * x, 1.1, 0);
    root.add(base);
  }
  // Arch: half ring over the carriageway
  const arch = new THREE.Mesh(new THREE.TorusGeometry(x - w / 2 - 0.2, 1.1, 8, 24, Math.PI), mud);
  arch.position.set(0, h - 1.4, 0);
  root.add(arch);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2 * x + w, 2.4, 3.0), mud);
  lintel.position.set(0, h + 3.4, 0);
  root.add(lintel);
  // crenellations
  const crenGeo = new THREE.BoxGeometry(1.0, 0.9, 3.0);
  for (let i = -8; i <= 8; i += 1) {
    const c = new THREE.Mesh(crenGeo, mudDark);
    c.position.set(i * 1.25, h + 5.05, 0);
    root.add(c);
  }
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture({ bg: '#7a5230', border: '#f5d77b', stroke: '#2b1a0c', fg: '#fff4d0', fg2: '#f5d77b', main: 'KOFAR MATA', sub: 'KANO CITY GATE' }), toneMapped: false, side: THREE.DoubleSide }),
  );
  plaque.position.set(0, h + 3.4, 1.55);
  root.add(plaque);
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
  const key = road ? KANO_LANDMARK_ROUTES[snap?.route] || null : null;
  if (key !== st.current) {
    for (const actor of Object.values(st.actors)) actor.visible = false;
    st.current = key;
    if (key) {
      if (!st.actors[key]) {
        st.actors[key] = key === 'kofarMataGate' ? buildKofarMataGate() : buildILoveKano();
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
