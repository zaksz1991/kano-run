/**
 * Kano underpass, from the player's photo: tall beige ribbed concrete retaining walls with a
 * black-and-white kerb band along the top on both sides of the road, a bridge slab with concrete
 * parapets across the top, and short stepped wall ends. It repeats every 1900 m (flyovers
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
  // beige ribbed concrete retaining wall, as in the player's underpass photo
  g.fillStyle = '#cfc5ae'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = 'rgba(110,98,76,0.30)'; g.fillRect(x, 0, 3, h);
    g.fillStyle = 'rgba(255,250,235,0.22)'; g.fillRect(x + 3, 0, 2, h);
  }
  // black-and-white kerb band along the top edge of the wall
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, 30);
  g.fillStyle = '#1c1f22';
  for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 32, 30);
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
  for (const [dz, color] of [[7.7, 0xb9b3a4], [-7.7, 0xb9b3a4]]) {
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
