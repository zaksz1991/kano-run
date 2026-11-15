/**
 * The opposite carriageway of the dual carriageway carries its own traffic, coming towards the player.
 * Uses the same GLB vehicle shapes the phone traffic batches already hold (the player's own models), drawn as
 * a few InstancedMeshes. Visual only: it never touches gameplay collisions or lanes.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const LANES = [-8.9, -11.4, -13.9];          // centres of the three oncoming lanes (carriageway -7.6 .. -15.2)
const TYPES = ['car', 'taxi', 'suv', 'keke', 'car', 'truck', 'motorcycle', 'bus', 'taxi', 'keke'];
const FAR = -230;
const NEAR = 16;

function rand(seed) { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); }

function build(R) {
  const count = R.mobile ? 14 : 20;
  const group = new THREE.Group();
  group.name = 'KANO_ONCOMING_TRAFFIC';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.userData.kanoNoShift = true;       // sits exactly on the oncoming carriageway, not shifted by the curved-world shader
  const meshes = new Map();
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const wanted = TYPES[i % TYPES.length];
    const have = [...(R._mobileTrafficBatches?.keys?.() || [])].filter((k) => R._mobileTrafficBatches.get(k)?.mesh?.geometry && !/bus|truck|ambulance|police|karota/.test(k) || k === wanted);
    if (!have.length) continue;
    const type = have.includes(wanted) ? wanted : have[i % have.length];
    const batch = R._mobileTrafficBatches.get(type);
    if (!batch?.mesh?.geometry) continue;
    let entry = meshes.get(type);
    if (!entry) {
      const mesh = new THREE.InstancedMesh(batch.mesh.geometry, material, count);
      mesh.name = `KANO_ONCOMING_${type}`;
      mesh.frustumCulled = false;
      mesh.count = 0;
      group.add(mesh);
      entry = { mesh, used: 0 };
      meshes.set(type, entry);
    }
    const lane = i % LANES.length;
    cars.push({
      entry, slot: entry.used, lane,
      z: FAR + 18 + (i / count) * (FAR * -0.0 + 215) * 0.9 + rand(i + 3) * 14,
      speed: 8 + rand(i + 9) * 6,
    });
    entry.used += 1;
  }
  if (!cars.length) return null;
  for (const e of meshes.values()) e.mesh.count = e.used;
  R.world.add(group);
  return { group, cars, meshes };
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);

if (typeof Renderer3D?.prototype?.draw === 'function' && !Renderer3D.prototype.__kanoOncomingPatched) {
  Renderer3D.prototype.__kanoOncomingPatched = true;
  const original = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function kanoOncomingDraw(state, dt, ...rest) {
    const result = original.call(this, state, dt, ...rest);
    try {
      const road = this.world && (!this.lifeScene || this.lifeScene === 'road');
      if (!road) { if (this.__kanoOncoming?.group) this.__kanoOncoming.group.visible = false; return result; }
      if (!this.__kanoOncoming) {
        if (!this.__kanoOncomingTries || performance.now() - this.__kanoOncomingTries > 2500) {
          this.__kanoOncomingTries = performance.now();
          this.__kanoOncoming = (this.__kanoOncomingFrames = (this.__kanoOncomingFrames || 0) + 1) > 3 ? (build(this) || null) : null;
        }
        if (!this.__kanoOncoming) return result;
      }
      const o = this.__kanoOncoming;
      o.group.visible = true;
      const step = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
      const own = Math.abs(Number(state?.signedSpeed ?? state?.speed) || 0) * 0.28;
      for (const c of o.cars) {
        c.z += (own + c.speed) * step;
        if (c.z > NEAR) { c.z = FAR - rand(c.slot + performance.now() % 97) * 40; c.speed = 8 + rand(c.slot + c.z) * 6; }
        pos.set(LANES[c.lane], 0, c.z);
        q.setFromAxisAngle(up, Math.PI);
        m4.compose(pos, q, one);
        c.entry.mesh.setMatrixAt(c.slot, m4);
      }
      for (const e of o.meshes.values()) e.mesh.instanceMatrix.needsUpdate = true;
    } catch (e) { /* decorative only */ }
    return result;
  };
}
