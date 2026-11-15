/**
 * Real-road detail so the street does not feel thin: tyre-wear strips in every lane, patched tarmac and manholes,
 * zebra crossings, a stone gutter beside the kerb, a plastered boundary wall with pilasters on the right, side
 * streets that open through that wall, and a soft contact shadow under the keke. One InstancedMesh carries all
 * scrolling pieces (a single draw call) and one shared texture does the shadow. Visual only.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const SPAN = 200;       // pieces repeat every 200 m
const NEAR = 12;        // keep pieces in [NEAR - SPAN, NEAR)
const WALL_X = 10.7;
const WALL_COLORS = [0xe9e1cf, 0xc9dcc0, 0xf1dca0, 0xd9a98b, 0xd8d4ca];
const JUNCTIONS = [-30, -130];

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function buildPieces() {
  const items = [];
  const rnd = lcg(20241115);
  const nearJunction = (z) => JUNCTIONS.some((j) => Math.abs(((z - j) % 100 + 150) % 100 - 50) < 13);
  // boundary wall, 10 m bays, gaps at side streets
  for (let i = 0; i < SPAN / 10; i += 1) {
    const z = -i * 10 - 5;
    if (nearJunction(z)) continue;
    const c = WALL_COLORS[(i * 7 + Math.floor(i / 3)) % WALL_COLORS.length];
    items.push({ base: z, x: WALL_X, y: 1.05, sx: 0.3, sy: 2.1, sz: 9.4, color: c });
    items.push({ base: z, x: WALL_X - 0.02, y: 0.12, sx: 0.36, sy: 0.24, sz: 9.5, color: 0x8d8579 }); // plinth
    items.push({ base: z - 5, x: WALL_X, y: 1.25, sx: 0.6, sy: 2.5, sz: 0.6, color: 0xb9b2a4 });      // pilaster
  }
  // side streets and zebra crossings
  for (const j of JUNCTIONS) {
    for (const k of [0, 100]) {
      const z = j - k;
      items.push({ base: z, x: 17, y: 0.013, sx: 14, sy: 0.02, sz: 8, color: 0x4d5259 });       // side-street tarmac
      items.push({ base: z, x: 5.45, y: 0.04, sx: 0.5, sy: 0.12, sz: 8.4, color: 0xcdcbc3 });  // dropped kerb ramp
      for (let b = -4; b <= 4; b += 1) items.push({ base: z + 7.2, x: b * 0.98, y: 0.026, sx: 0.5, sy: 0.02, sz: 3.0, color: 0xf1efe6 }); // zebra
    }
  }
  // patches and manholes in the carriageway
  for (let i = 0; i < 10; i += 1) {
    const lane = [-3, 0, 3][Math.floor(rnd() * 3)];
    items.push({ base: -rnd() * SPAN, x: lane + (rnd() - 0.5) * 1.2, y: 0.018, sx: 0.7 + rnd() * 0.9, sy: 0.015, sz: 1.2 + rnd() * 1.6, color: rnd() > 0.5 ? 0x3b4046 : 0x454a50 });
  }
  for (let i = 0; i < 4; i += 1) {
    const lane = [-3, 0, 3][i % 3];
    items.push({ base: -rnd() * SPAN, x: lane + 1.5, y: 0.02, sx: 0.75, sy: 0.015, sz: 0.75, color: 0x2a2d31 });
  }
  return items;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function build(renderer) {
  const root = new THREE.Group(); root.name = 'KANO_ROAD_DETAIL';
  const noShift = (m) => { m.userData = { ...(m.userData || {}), kanoNoShift: true }; return m; };
  const lam = (opts) => noShift(renderer.mobile ? new THREE.MeshLambertMaterial(opts) : new THREE.MeshStandardMaterial({ roughness: 0.95, ...opts }));

  // static: tyre-wear strips in each lane and a gutter beside the right kerb
  const wearMat = lam({ color: 0x2c2f33, transparent: true, opacity: 0.07, depthWrite: false });
  const wearGeo = new THREE.PlaneGeometry(0.36, 250);
  for (const lane of [-3, 0, 3]) for (const off of [-0.8, 0.8]) {
    const m = new THREE.Mesh(wearGeo, wearMat);
    m.rotation.x = -Math.PI / 2; m.position.set(lane + off, 0.012, -92); m.renderOrder = 1; root.add(m);
  }
  const gutter = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 250), lam({ color: 0x34373a }));
  gutter.rotation.x = -Math.PI / 2; gutter.position.set(5.27, -0.045, -92); root.add(gutter);

  const items = buildPieces();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam({ color: 0xffffff }), items.length);
  mesh.frustumCulled = false; mesh.name = 'KANO_ROAD_DETAIL_PIECES';
  items.forEach((p, i) => mesh.setColorAt(i, new THREE.Color(p.color)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);

  // contact shadow under the keke
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.8), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, fog: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.02, 0.1); blob.name = 'KANO_KEKE_CONTACT_SHADOW'; blob.renderOrder = 2;
  renderer.player?.add(blob);

  renderer.world.add(root);
  return { root, mesh, items, offset: 0, dummy: new THREE.Object3D(), blob };
}

function layout(k) {
  const d = k.dummy;
  k.items.forEach((p, i) => {
    const z = ((((p.base + k.offset - NEAR) % SPAN) + SPAN) % SPAN) + NEAR - SPAN;
    d.position.set(p.x, p.y, z); d.scale.set(p.sx, p.sy, p.sz); d.rotation.set(0, 0, 0); d.updateMatrix();
    k.mesh.setMatrixAt(i, d.matrix);
  });
  k.mesh.instanceMatrix.needsUpdate = true;
}

function update(renderer, state, dt) {
  const k = renderer.__kanoRoadDetail; if (!k) return;
  const signed = Number.isFinite(state?.signedSpeed) ? state.signedSpeed : state?.reverse ? -Math.abs(Number(state?.speed) || 0) : Math.abs(Number(state?.speed) || 0);
  k.offset += signed * Math.max(0, Math.min(0.05, dt)) * 0.28;
  if (!k.laidOut || signed !== 0) { layout(k); k.laidOut = true; }
  k.root.visible = renderer.lifeScene === 'road';
  if (k.blob && k.blob.parent !== renderer.player && renderer.player) renderer.player.add(k.blob);
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype.__kanoRoadDetail) {
  Object.defineProperty(Renderer3D.prototype, '__kanoRoadDetail', { value: null, writable: true, configurable: true });
  const draw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function drawWithRoadDetail(state, dt, ...rest) {
    try {
      if (!this.__kanoRoadDetailBuilt && this.world && this.player && this.lifeScene === 'road') {
        this.__kanoRoadDetailBuilt = true;
        this.__kanoRoadDetail = build(this);
      }
      if (this.__kanoRoadDetail) update(this, state, Number(dt) || 0.016);
    } catch (error) {
      console.warn('[Kano Life] Road detail skipped safely.', error);
      this.__kanoRoadDetail = null;
    }
    return draw.call(this, state, dt, ...rest);
  };
}
