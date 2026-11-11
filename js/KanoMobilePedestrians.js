/**
 * Your own people on every phone sidewalk (used by KanoStreetLifeMotionUpgrade on phones). Phones were drawing procedural capsule walkers (only 1-3 GLB people).
 * Each pedestrian GLB is baked once into a single vertex-coloured mesh (texture colours sampled per vertex, skinned
 * bodies baked in rest pose), then every roadside walker becomes a cheap static figure with a light walking bob.
 * One draw call per walker, no skeleton cost.
 */
import * as THREE from 'three';

const KEYS = ['pedestrian', 'pedestrianWoman', 'passengerMan', 'passengerWoman', 'passenger', 'security'];
const HEIGHT = 1.72;
const baked = new Map();
const requested = new Set();
const material = new THREE.MeshLambertMaterial({ vertexColors: true });

function imageData(map) {
  try {
    const img = map?.image;
    if (!img || !(img.width > 0)) return null;
    const s = Math.min(256, img.width, img.height);
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, s, s);
    return { d: ctx.getImageData(0, 0, s, s).data, s, flip: map.flipY };
  } catch (_) { return null; }
}

function bake(model) {
  model.updateMatrixWorld(true);
  const pos = []; const col = [];
  const v = new THREE.Vector3(); const tmp = new THREE.Color();
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    const p = geo.getAttribute('position'); const uv = geo.getAttribute('uv');
    if (!p) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mat = mats[0];
    const base = mat?.color ? mat.color.clone() : new THREE.Color(0xbbbbbb);
    const tex = mat?.map ? imageData(mat.map) : null;
    const index = geo.index;
    const triCount = (index ? index.count : p.count) / 3;
    const vertexColor = (i) => {
      tmp.copy(base);
      if (tex && uv) {
        const u = uv.getX(i) - Math.floor(uv.getX(i)); const w = uv.getY(i) - Math.floor(uv.getY(i));
        const x = Math.min(tex.s - 1, Math.floor(u * tex.s));
        const y = Math.min(tex.s - 1, Math.floor((tex.flip ? 1 - w : w) * tex.s));
        const k = (y * tex.s + x) * 4;
        tmp.multiply(new THREE.Color().setRGB(tex.d[k] / 255, tex.d[k + 1] / 255, tex.d[k + 2] / 255, THREE.SRGBColorSpace));
      }
      return tmp;
    };
    for (let t = 0; t < triCount * 3; t += 1) {
      const i = index ? index.getX(t) : t;
      if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(p, i);
      v.applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      const c = vertexColor(i);
      col.push(c.r, c.g, c.b);
    }
  });
  if (!pos.length || pos.length / 3 > 60000) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  const b = g.boundingBox;
  const h = b.max.y - b.min.y;
  if (!(h > 0.05)) return null;
  const s = HEIGHT / h;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(s, s, s);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function ensure(R) {
  for (const key of KEYS) {
    if (baked.has(key) || requested.has(key)) continue;
    requested.add(key);
    R.models.load(key).then(() => {
      const m = R.models.getInstance(key);
      const g = m && bake(m);
      if (g) baked.set(key, g);
    }).catch(() => { requested.delete(key); });
  }
}

/** A baked person (null while the GLB is still being baked). Used by the street-life system on phones. */
export function bakedPerson(renderer, keys, index, height) {
  ensure(renderer);
  const ready = (keys && keys.length ? keys : KEYS).filter((k) => baked.has(k));
  const pool = ready.length ? ready : [...baked.keys()];
  if (!pool.length) return null;
  const g = baked.get(pool[index % pool.length]);
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'kano_real_person_baked';
  mesh.scale.setScalar(height / HEIGHT);
  const holder = new THREE.Group();
  holder.name = 'kano_real_person';
  holder.add(mesh);
  return holder;
}

if (typeof window !== 'undefined' && !window.__kanoMobilePedestrians) {
  window.__kanoMobilePedestrians = true;
  setInterval(() => {
    try {
      const R = window.kanoRenderer;
      if (R?.mobile && R.models && !document.hidden) ensure(R);
    } catch (_) { /* optional */ }
  }, 1800);
}
