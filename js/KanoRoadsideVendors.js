/**
 * Roadside vendors on the pavement: mai shai (tea) parasol stalls and fruit / pure-water tables, in the loud colours
 * of real Kano roadsides. Instanced (4 draw calls), scrolling at exactly the road's speed, no textures.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const SIDE_X = 7.7;
const PERIOD = 46;
const CANOPY = [0xd8332a, 0xf2b700, 0x1d7fd1, 0xef7d1a, 0x2a9d5c, 0xe9e4d8];

function instanced(group, geometry, material, items, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.ry || 0, 0);
    dummy.scale.set(p.s || 1, p.s || 1, p.s || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

function build(renderer) {
  const mat = (color, rough = 0.9) => {
    const m = renderer.material ? renderer.material(color, rough) : new THREE.MeshStandardMaterial({ color, roughness: rough });
    m.userData = m.userData || {};
    m.userData.kanoNoShift = true;
    return m;
  };
  const root = new THREE.Group();
  root.name = 'KANO_ROADSIDE_VENDORS';
  const inner = new THREE.Group();
  inner.userData.period = PERIOD;
  root.add(inner);

  const stalls = [];
  const zs = [-9, -17, -33, -41, -58, -73, -88, -104, -121, -139, -157, -175, -192];
  zs.forEach((z, i) => {
    const near = i % 3 === 1;
    stalls.push({ x: SIDE_X + (near ? -0.5 : 0.5) + ((i * 37) % 10) / 20, y: 0.1, z: z + ((i * 53) % 7) / 3, s: 0.92 + ((i * 17) % 5) / 25, ry: (i * 1.3) % 6 });
  });
  const colors = stalls.map((_, i) => CANOPY[i % CANOPY.length]);
  const pole = (x, z) => ({ x, y: 0.1 + 1.0, z });

  instanced(inner, new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), mat(0x3a3a3c, 0.6), stalls.map((p) => pole(p.x, p.z)));
  const canopy = instanced(inner, new THREE.ConeGeometry(1.15, 0.5, 10), mat(0xffffff, 0.85),
    stalls.map((p) => ({ x: p.x, y: 2.15, z: p.z, s: p.s })), colors);
  canopy.castShadow = false;
  instanced(inner, new THREE.BoxGeometry(1.1, 0.07, 0.55), mat(0x8a5a33, 0.9),
    stalls.map((p) => ({ x: p.x, y: 0.82, z: p.z + 0.1 })));
  instanced(inner, new THREE.BoxGeometry(1.0, 0.7, 0.45), mat(0xb8afa0, 0.95),
    stalls.map((p) => ({ x: p.x, y: 0.45, z: p.z + 0.1 })));
  // flask / kettle and stacked goods on the table
  instanced(inner, new THREE.CylinderGeometry(0.14, 0.17, 0.34, 8), mat(0xcfd3d6, 0.5),
    stalls.map((p) => ({ x: p.x - 0.25, y: 1.02, z: p.z + 0.1 })));
  instanced(inner, new THREE.BoxGeometry(0.34, 0.2, 0.3), mat(0x2f7fd0, 0.7),
    stalls.map((p) => ({ x: p.x + 0.25, y: 0.96, z: p.z + 0.1 })));
  // plastic stool
  instanced(inner, new THREE.CylinderGeometry(0.2, 0.17, 0.3, 8), mat(0xe03a2e, 0.7),
    stalls.map((p) => ({ x: p.x - 0.95 - (p.s - 0.9), y: 0.25, z: p.z + 0.6 })));

  renderer.world.add(root);
  return { root, inner };
}

function update(renderer, state, dt) {
  const k = renderer.__kanoVendors;
  if (!k) return;
  const signed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse ? -Math.abs(Number(state?.speed) || 0) : Math.abs(Number(state?.speed) || 0);
  const scroll = signed * Math.max(0, Math.min(0.05, dt)) * 0.28;
  k.inner.position.z = (((k.inner.position.z + scroll) % PERIOD) + PERIOD) % PERIOD;
  k.root.visible = renderer.lifeScene === 'road' && !renderer.mobileLite;
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype.__kanoVendors) {
  Object.defineProperty(Renderer3D.prototype, '__kanoVendors', { value: true, writable: true, configurable: true });
  const draw = Renderer3D.prototype.draw;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithVendors(state, dt, ...rest) {
      try {
        if (!this.__kanoVendorsBuilt && this.world && this.lifeScene === 'road') {
          this.__kanoVendorsBuilt = true;
          this.__kanoVendors = build(this);
        }
        if (this.__kanoVendors) update(this, state, Number(dt) || 0.016);
      } catch (error) {
        console.warn('[Kano Life] Roadside vendors skipped safely.', error);
        this.__kanoVendors = null;
      }
      return draw.call(this, state, dt, ...rest);
    };
  }
}
