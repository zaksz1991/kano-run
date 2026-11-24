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
const WALL_X = 7.9; // front face of the shop row
const WALL_XL = 9.7; // front face of the matching shop row on the left (behind the left stalls)
const WALL_COLORS = [0xe9e1cf, 0xc9dcc0, 0xf1dca0, 0xd9a98b, 0xd8d4ca];
const JUNCTIONS = [-30, -130];

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// Shop row gaps at the side streets (also used by the painted shopfront signs below).
const nearShopGap = (z) => JUNCTIONS.some((j) => [0, 100].some((k) => Math.abs(z - (j - k)) < 8.5));

function buildPieces() {
  const items = [];
  const rnd = lcg(20241115);
  const nearJunction = (z) => JUNCTIONS.some((j) => Math.abs(((z - j) % 100 + 150) % 100 - 50) < 13);
  // shop row on the pavement edge: shop body, roof slab, door and window per shop, 8.2 m apart, gaps at side streets
  for (let i = 0; i < 24; i += 1) {
    const z = -i * 8.2 - 4;
    if (nearShopGap(z)) continue;
    const body = WALL_COLORS[(i * 3 + Math.floor(i / 2)) % WALL_COLORS.length];
    const h = 2.7 + (i % 3) * 0.45;
    items.push({ base: z, x: WALL_X + 1.0, y: h / 2, sx: 2.0, sy: h, sz: 7.3, color: body });
    items.push({ base: z, x: WALL_X + 0.95, y: h + 0.08, sx: 2.2, sy: 0.16, sz: 7.5, color: 0x8d8579 });
    items.push({ base: z - 2.2, x: WALL_X - 0.02, y: 0.95, sx: 0.08, sy: 1.9, sz: 1.3, color: 0x3a2f27 });
    items.push({ base: z + 1.7, x: WALL_X - 0.02, y: 1.25, sx: 0.08, sy: 1.1, sz: 2.2, color: 0x9fc4d6 });
  }
  // the left side gets the same shop row, so both sides of the street match
  for (let i = 0; i < 24; i += 1) {
    const z = -i * 8.2 - 8.1;
    if (nearShopGap(z)) continue;
    const body = WALL_COLORS[(i * 5 + 2) % WALL_COLORS.length];
    const h = 2.7 + ((i + 1) % 3) * 0.45;
    items.push({ base: z, x: -(WALL_XL + 1.0), y: h / 2, sx: 2.0, sy: h, sz: 7.3, color: body });
    items.push({ base: z, x: -(WALL_XL + 0.95), y: h + 0.08, sx: 2.2, sy: 0.16, sz: 7.5, color: 0x8d8579 });
    items.push({ base: z - 2.2, x: -(WALL_XL - 0.02), y: 0.95, sx: 0.08, sy: 1.9, sz: 1.3, color: 0x3a2f27 });
    items.push({ base: z + 1.7, x: -(WALL_XL - 0.02), y: 1.25, sx: 0.08, sy: 1.1, sz: 2.2, color: 0x9fc4d6 });
  }
  // side streets and zebra crossings
  for (const j of JUNCTIONS) {
    for (const k of [0, 100]) {
      const z = j - k;
      items.push({ base: z, x: 18, y: 0.013, sx: 16, sy: 0.02, sz: 8, color: 0x4d5259 });       // side-street tarmac
      items.push({ base: z, x: 5.45, y: 0.04, sx: 0.5, sy: 0.12, sz: 8.4, color: 0xcdcbc3 });  // dropped kerb ramp
      for (let b = -4; b <= 4; b += 1) items.push({ base: z + 7.2, x: b * 0.98, y: 0.026, sx: 0.5, sy: 0.02, sz: 3.0, color: 0xf1efe6 }); // zebra
    }
  }
  // (no repair patches / stains / cracks: they read as grey blocks on the road)
  return items;
}

const SHOPS = [
  ['ALHAJI GENERAL STORE', '#1f6f43'], ['MAI SHAI & BREAD', '#b5532b'], ['GSM / POS / AIRTIME', '#1b5fa8'],
  ['PHARMACY', '#12805c'], ['SUYA SPOT', '#8e2b20'], ['M. TAILORING', '#6a3d8f'], ['TYRE & VULCANIZER', '#d49a00'], ['ELECTRONICS', '#233a5e'],
];

function signTexture(label, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, 512, 8); g.fillRect(0, 120, 512, 8);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 54; g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(label).width > 470 && size > 20) { size -= 2; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillText(label, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
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
  const wearMat = lam({ color: 0x2c2f33, transparent: true, opacity: 0.2, depthWrite: false });
  const wearGeo = new THREE.PlaneGeometry(0.5, 250);
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

  // shopfronts painted on the wall: a signboard and a striped awning each, repeating along the street
  const signs = [];
  for (let i = 0; i < 24; i += 1) {
    const base = -i * 8.2 - 4 - 0.2;
    if (nearShopGap(base)) continue;
    signs.push({ base, kind: i % SHOPS.length, side: 1 });
  }
  for (let i = 0; i < 24; i += 1) {
    const base = -i * 8.2 - 8.1 - 0.2;
    if (nearShopGap(base)) continue;
    signs.push({ base, kind: (i + 3) % SHOPS.length, side: -1 });
  }
  const signGeo = new THREE.PlaneGeometry(4.6, 1.15);
  const awnGeo = new THREE.BoxGeometry(1.0, 0.1, 4.8);
  const awnMat = lam({ color: 0xffffff });
  const awnMesh = new THREE.InstancedMesh(awnGeo, awnMat, signs.length);
  awnMesh.frustumCulled = false;
  const AWN = [0xd8332a, 0xf2b700, 0x1d7fd1, 0x2a9d5c, 0xef7d1a];
  signs.forEach((sg, i) => awnMesh.setColorAt(i, new THREE.Color(AWN[i % AWN.length])));
  if (awnMesh.instanceColor) awnMesh.instanceColor.needsUpdate = true;
  root.add(awnMesh);
  const signMeshes = SHOPS.map(([label, color]) => {
    const list = signs.filter((sg) => sg.kind === SHOPS.findIndex((x) => x[0] === label));
    const m = new THREE.InstancedMesh(signGeo, noShift(new THREE.MeshBasicMaterial({ map: signTexture(label, color) })), Math.max(1, list.length));
    m.frustumCulled = false; m.count = list.length; root.add(m);
    return { mesh: m, list };
  });

  // contact shadow under the keke
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.8), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, fog: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.02, 0.1); blob.name = 'KANO_KEKE_CONTACT_SHADOW'; blob.renderOrder = 2;
  renderer.player?.add(blob);

  renderer.world.add(root);
  return { root, mesh, items, offset: 0, dummy: new THREE.Object3D(), blob, signs, signMeshes, awnMesh };
}

function layout(k) {
  const d = k.dummy;
  k.items.forEach((p, i) => {
    const z = ((((p.base + k.offset - NEAR) % SPAN) + SPAN) % SPAN) + NEAR - SPAN;
    d.position.set(p.x, p.y, z); d.scale.set(p.sx, p.sy, p.sz); d.rotation.set(0, 0, 0); d.updateMatrix();
    k.mesh.setMatrixAt(i, d.matrix);
  });
  k.mesh.instanceMatrix.needsUpdate = true;
  const wz = (b) => ((((b + k.offset - NEAR) % SPAN) + SPAN) % SPAN) + NEAR - SPAN;
  k.signs.forEach((sg, i) => {
    d.position.set(sg.side < 0 ? -(WALL_XL - 0.5) : WALL_X - 0.5, 2.3, wz(sg.base)); d.scale.set(1, 1, 1); d.rotation.set(0.28 * sg.side, 0, 0); d.updateMatrix(); k.awnMesh.setMatrixAt(i, d.matrix);
  });
  k.awnMesh.instanceMatrix.needsUpdate = true;
  for (const { mesh, list } of k.signMeshes) {
    list.forEach((sg, i) => { d.position.set(sg.side < 0 ? -(WALL_XL - 0.1) : WALL_X - 0.1, 2.85, wz(sg.base)); d.scale.set(1, 1, 1); d.rotation.set(0, sg.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
  }
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
