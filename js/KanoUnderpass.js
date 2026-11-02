/**
 * Kano underpass, from the player's photo of the red-and-white tiled underpass: cream tiled
 * retaining walls with a red/white band on both sides of the road, a bridge slab with red and
 * cream parapets across the top, and short stepped wall ends. It repeats every 1900 m (flyovers
 * repeat every 1700 m, so the two drift apart). Visual only: the road stays level, lanes,
 * collisions, stops and fares are unchanged.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const PATCH = Symbol.for('kano.life.underpass.v1');
const PERIOD = 1900;
const HALF = 70;            // tunnel half-length in metres
const WALL_H = 4.1;
const RIGHT_X = 7.3;        // inner face of the right wall
const LEFT_X = -16.0;       // inner face of the left wall (beyond the oncoming carriageway)
const SLAB_Y = 4.9;

function tileTexture(repeatX) {
  const w = 256; const h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e4d9bd'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,100,70,0.35)'; g.lineWidth = 2;
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  // red/white band near the top (the signature Kano underpass trim)
  g.fillStyle = '#b3262e'; g.fillRect(0, 0, w, 54);
  g.fillStyle = '#f4efe2';
  for (let x = -64; x < w + 64; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 64, 54); g.lineTo(x + 32, 54); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(repeatX, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function build(renderer) {
  const mat = (color, rough = 0.9, map = null) => {
    // Own material (not the renderer's shared cache) so the tile texture cannot leak onto other meshes.
    const m = new THREE.MeshLambertMaterial({ color, map: map || null });
    m.userData = m.userData || {};
    m.userData.kanoNoShift = true;
    return m;
  };
  const root = new THREE.Group();
  root.name = 'KANO_INSTANCED_UNDERPASS'; // name keeps the phone scenery-merge pass away from this moving group
  const inner = new THREE.Group();
  inner.position.z = -PERIOD / 2;
  root.add(inner);

  const length = HALF * 2;
  const wallMap = tileTexture(length / 8);
  const addWall = (x, side, len, height, zc) => {
    const geo = new THREE.BoxGeometry(0.7, height, len);
    const map = len === length ? wallMap : tileTexture(len / 8);
    const mesh = new THREE.Mesh(geo, mat(0xffffff, 0.9, map));
    mesh.position.set(x + side * 0.35, height / 2, zc);
    inner.add(mesh);
  };
  addWall(RIGHT_X, 1, length, WALL_H, 0);
  addWall(LEFT_X, -1, length, WALL_H, 0);
  // stepped ends so the walls rise out of the ground instead of starting as a wall
  for (const [dz, len, h] of [[HALF + 6, 12, 2.7], [HALF + 15, 6, 1.4], [-HALF - 6, 12, 2.7], [-HALF - 15, 6, 1.4]]) {
    addWall(RIGHT_X, 1, len, h, dz);
    addWall(LEFT_X, -1, len, h, dz);
  }

  // bridge slab across the top, with red and cream parapets and a darker underside
  const slabW = RIGHT_X - LEFT_X + 1.4;
  const slabX = (RIGHT_X + LEFT_X) / 2;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.9, 16), mat(0x8f8a80, 0.95));
  slab.position.set(slabX, SLAB_Y, 0);
  inner.add(slab);
  for (const [dz, color] of [[7.7, 0xb3262e], [-7.7, 0xb3262e]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.55, 0.28), mat(color, 0.8));
    rail.position.set(slabX, SLAB_Y + 0.72, dz);
    inner.add(rail);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.12, 0.4), mat(0xf4efe2, 0.8));
    cap.position.set(slabX, SLAB_Y + 1.04, dz);
    inner.add(cap);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(slabW - 0.4, 0.05, 14.8), mat(0x4a4f55, 0.95));
  deck.position.set(slabX, SLAB_Y + 0.47, 0);
  inner.add(deck);

  renderer.world.add(root);
  return { root, inner, z: Math.random() * PERIOD };
}

function update(renderer, state, dt) {
  const k = renderer.__kanoUnderpass;
  if (!k) return;
  const signed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse ? -Math.abs(Number(state?.speed) || 0) : Math.abs(Number(state?.speed) || 0);
  k.z = (((k.z + signed * Math.max(0, Math.min(0.05, dt)) * 0.28) % PERIOD) + PERIOD) % PERIOD;
  k.root.position.z = k.z;
  const worldZ = k.z - PERIOD / 2;      // where the tunnel centre is now
  // Never overlap a flyover: hide this underpass while one is within 420 m of it.
  const nearFlyover = (renderer.flyovers || []).some((f) => f && Math.abs((f.position?.z ?? 1e9) - worldZ) < 420);
  k.root.visible = renderer.lifeScene === 'road' && Math.abs(worldZ) < 260 && !nearFlyover;
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[PATCH]) {
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true });
  const draw = Renderer3D.prototype.draw;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithUnderpass(state, dt, ...rest) {
      try {
        if (!this.__kanoUnderpass && this.world && this.lifeScene === 'road' && !window.kanoNoUnderpass) {
          this.__kanoUnderpass = build(this);
          window.kanoUnderpassState = this.__kanoUnderpass;
        }
        if (this.__kanoUnderpass) update(this, state, Number(dt) || 0.016);
      } catch (error) {
        console.warn('[Kano Life] Underpass skipped safely.', error);
        window.kanoNoUnderpass = true;
      }
      return draw.call(this, state, dt, ...rest);
    };
  }
}
