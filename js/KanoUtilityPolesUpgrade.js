/**
 * NEPA-style utility poles with crossarms and sagging wires along the far
 * roadside, as seen on real Kano roads. Each pole-plus-wire span is ONE merged
 * mesh (1 draw call), recycled ahead of the player like other scenery.
 */
import * as THREE from 'three';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { mergeChildMeshes } from './KanoMergeStaticMeshes.js';

const PATCH_TAG = Symbol.for('kano.life.utilityPoles.v1');
const states = new WeakMap();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SPACING = 38;
const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const wood = mat(0x7a6b58, 0.95);
const wire = mat(0x151515, 0.7);
const insul = mat(0xdde6ea, 0.4);

function put(group, geo, m, pos, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); mesh.rotation.set(...rot);
  group.add(mesh);
  return mesh;
}

export function buildPoleSpan(side) {
  const g = new THREE.Group();
  g.name = 'KANO_UTILITY_POLE_SPAN';
  put(g, new THREE.CylinderGeometry(0.11, 0.16, 8.4, 7), wood, [0, 4.2, 0]);
  put(g, new THREE.BoxGeometry(3.0, 0.14, 0.14), wood, [0, 7.9, 0]);
  put(g, new THREE.BoxGeometry(1.8, 0.1, 0.1), wood, [0, 7.2, 0]);
  const xs = [-1.3, 0, 1.3];
  for (const x of xs) put(g, new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5), insul, [x, 8.06, 0]);
  // three sagging wires to the next pole (SPACING units further down the road, -z)
  const segments = 6;
  const sag = 0.7;
  for (const x of xs) {
    for (let i = 0; i < segments; i += 1) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const y0 = 8.1 - sag * 4 * t0 * (1 - t0);
      const y1 = 8.1 - sag * 4 * t1 * (1 - t1);
      const z0 = -SPACING * t0;
      const z1 = -SPACING * t1;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const seg = put(g, new THREE.BoxGeometry(0.035, 0.035, len), wire, [x, (y0 + y1) / 2, (z0 + z1) / 2]);
      seg.rotation.x = Math.atan2(-(y1 - y0), z1 - z0);
    }
  }
  mergeChildMeshes(g);
  g.rotation.y = side < 0 ? 0 : 0;
  return g;
}

function update(system, dt, snap) {
  const renderer = system?.renderer;
  if (!renderer?.world || renderer.disposed) return;
  let st = states.get(system);
  if (!st) {
    st = { group: new THREE.Group(), spans: [] };
    st.group.name = 'KANO_UTILITY_POLES';
    const count = renderer.mobile ? 5 : 8;
    for (let i = 0; i < count; i += 1) {
      const span = buildPoleSpan(1);
      span.position.set(10.6, 0, 10 - i * SPACING);
      st.spans.push(span);
      st.group.add(span);
    }
    renderer.world.add(st.group);
    states.set(system, st);
  }
  const road = !renderer.lifeScene || renderer.lifeScene === 'road';
  st.group.visible = road;
  if (!road) return;
  const delta = clamp(dt, 0, 0.05);
  const signed = Number.isFinite(snap?.signedSpeed) ? snap.signedSpeed
    : snap?.reverse ? -Math.abs(Number(snap?.speed) || 0) : Math.abs(Number(snap?.speed) || 0);
  const total = SPACING * st.spans.length;
  for (const span of st.spans) {
    span.position.z += signed * delta * 0.28;
    if (span.position.z > 14) span.position.z -= total;
    else if (span.position.z < 14 - total) span.position.z += total;
  }
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithUtilityPoles(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { update(this, dt, state); } catch (error) { /* cosmetic only */ }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeUtilityPoles(...args) {
      const st = states.get(this);
      if (st) { st.group.parent?.remove(st.group); states.delete(this); }
      return originalDispose.apply(this, args);
    };
  }
}
