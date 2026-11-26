/**
 * Roadside billboards advertising Ruffneck Entertainment
 * (ruffneck-entertainment.vercel.app). A few boards on alternating sides of the
 * road scroll with the world like other scenery and are recycled ahead of the
 * player, so draw cost stays constant (2 boards on phones, 3 on desktop).
 */
import * as THREE from 'three';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';

export const KANO_AD_URL = 'ruffneck-entertainment.vercel.app';
const PATCH_TAG = Symbol.for('kano.life.roadsideAds.v1');
const states = new WeakMap();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SPACING = 170;

const SKINS = [
  { bg: '#16213a', fg: '#ffd84a', fg2: '#ffffff', head: 'RUFFNECK', sub: 'ENTERTAINMENT', foot: KANO_AD_URL },
  { bg: '#7a1f1f', fg: '#fff3c4', fg2: '#ffd84a', head: 'KANO LIFE', sub: 'DRIVE. LOAD. NEGOTIATE. SURVIVE.', foot: 'A RUFFNECK ENTERTAINMENT GAME' },
  { bg: '#0f4d3a', fg: '#ffffff', fg2: '#ffd84a', head: 'HASSAN ZAKARIYA', sub: 'CEO · RUFFNECK ENTERTAINMENT', foot: KANO_AD_URL },
  { bg: '#2b1b4d', fg: '#ffd84a', fg2: '#ffffff', head: 'RUFFNECK LEARN', sub: 'PRACTICAL AI & DIGITAL SKILLS', foot: 'ruffneck-lms.vercel.app' },
  { bg: '#0d3b66', fg: '#ffffff', fg2: '#ffd84a', head: 'YOUR BRAND HERE', sub: 'ADVERTISE WITH RUFFNECK', foot: KANO_AD_URL },
  { bg: '#3a2a10', fg: '#ffd84a', fg2: '#ffffff', head: 'PLAY MORE GAMES', sub: 'FROM RUFFNECK ENTERTAINMENT', foot: KANO_AD_URL },
  { bg: '#0b6b3a', fg: '#ffffff', fg2: '#ffe45c', head: 'CHAT ON WHATSAPP', sub: 'RUFFNECK ENTERTAINMENT', foot: 'GAMES · APPS · ADS · TRAINING' },
  { bg: '#1c1c1c', fg: '#ffd84a', fg2: '#ffffff', head: 'WEBSITES · APPS · GAMES', sub: 'BUILT BY RUFFNECK ENTERTAINMENT', foot: KANO_AD_URL },
  { bg: '#8a3b0f', fg: '#fff3c4', fg2: '#ffd84a', head: 'KANO · CENTRE OF COMMERCE', sub: 'KANTIN KWARI · SABON GARI · KURMI', foot: 'GREETINGS FROM RUFFNECK ENTERTAINMENT' },
  { bg: '#142a5e', fg: '#ffffff', fg2: '#ffd84a', head: 'ADVERTISE HERE', sub: 'BILLBOARDS · GAMES · SOCIAL MEDIA', foot: 'MESSAGE RUFFNECK ON WHATSAPP' },
];
const textureCache = new Map();

function fitFont(g, text, maxW, size, weight = 900) {
  let s = size;
  do { g.font = `${weight} ${s}px Arial, sans-serif`; s -= 4; } while (g.measureText(text).width > maxW && s > 24);
}

function makeTexture(skin) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = skin.bg; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = skin.fg; g.lineWidth = 14; g.strokeRect(14, 14, 996, 484);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, skin.head, 940, 150);
  g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineJoin = 'round'; g.strokeText(skin.head, 512, 140);
  g.fillStyle = skin.fg; g.fillText(skin.head, 512, 140);
  fitFont(g, skin.sub, 940, 76);
  g.fillStyle = skin.fg2; g.fillText(skin.sub, 512, 270);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(60, 360, 904, 100);
  fitFont(g, skin.foot, 860, 54, 800);
  g.fillStyle = '#ffffff'; g.fillText(skin.foot, 512, 410);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textureFor(index) {
  const i = ((index % SKINS.length) + SKINS.length) % SKINS.length;
  if (!textureCache.has(i)) textureCache.set(i, makeTexture(SKINS[i]));
  return textureCache.get(i);
}

function buildBoard(skin, side) {
  const root = new THREE.Group();
  root.name = 'KANO_RUFFNECK_AD';
  const steel = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.8 });
  for (const x of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), steel);
    post.position.set(x, 2.1, 0);
    root.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 0.16), steel);
  frame.position.set(0, 5.0, -0.02);
  root.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(6.1, 3.05),
    new THREE.MeshBasicMaterial({ map: textureFor(SKINS.indexOf(skin)), toneMapped: false }),
  );
  face.position.set(0, 5.0, 0.07);
  face.name = 'ruffneck_ad_face';
  root.add(face);
  root.position.x = side * 11.5;
  root.rotation.y = side * -0.35; // angled toward the driver
  return root;
}

function update(system, dt, snap) {
  const renderer = system?.renderer;
  if (!renderer?.world || renderer.disposed) return;
  let st = states.get(system);
  if (!st) {
    st = { group: new THREE.Group(), boards: [] };
    st.group.name = 'KANO_ROADSIDE_ADS';
    const count = renderer.mobile ? 2 : 3;
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const board = buildBoard(SKINS[i % SKINS.length], side);
      board.userData.skin = i % SKINS.length;
      board.position.z = -70 - i * SPACING;
      st.boards.push(board);
      st.group.add(board);
    }
    renderer.world.add(st.group);
    states.set(system, st);
  }
  const road = !renderer.lifeScene || renderer.lifeScene === 'road';
  st.group.visible = road && !(window.kanoFrameGovernorLevel >= 3);
  if (!road) return;
  const delta = clamp(dt, 0, 0.05);
  const signed = Number.isFinite(snap?.signedSpeed) ? snap.signedSpeed
    : snap?.reverse ? -Math.abs(Number(snap?.speed) || 0) : Math.abs(Number(snap?.speed) || 0);
  const span = SPACING * st.boards.length;
  for (const board of st.boards) {
    board.position.z += signed * delta * 0.28;
    const before = board.position.z;
    if (board.position.z > 18) board.position.z -= span;
    else if (board.position.z < 18 - span) board.position.z += span;
    if (board.position.z !== before) {
      // every lap shows the next message: company, the game, the CEO, other platforms
      board.userData.skin = (Number(board.userData.skin) || 0) + (before > 0 ? 1 : -1) * st.boards.length;
      const face = board.getObjectByName('ruffneck_ad_face');
      if (face) face.material.map = textureFor(board.userData.skin);
    }
  }
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithRuffneckAds(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { update(this, dt, state); } catch (error) { console.warn('[Kano ads] skipped', error); }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeRuffneckAds(...args) {
      const st = states.get(this);
      if (st) { st.group.parent?.remove(st.group); states.delete(this); }
      return originalDispose.apply(this, args);
    };
  }
}
