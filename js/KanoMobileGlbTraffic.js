/**
 * Your own GLB vehicles for ALL background traffic on phones.
 * Phones used a generated "lite" box vehicle for most traffic. Here each of your vehicle GLBs (keke, car, taxi, suv,
 * truck, bus, motorcycle, police, ambulance, KAROTA) is baked ONCE into a single vertex-coloured geometry and the
 * existing one-draw-call-per-type InstancedMesh batches render that instead. Same draw count as before, real shapes.
 */
import * as THREE from 'three';

const TYPES = ['keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police', 'ambulance', 'karota'];
const MAX_TRIS = 16000;                       // bake-time guard for phones
const baked = new Map();                       // type -> BufferGeometry
const requested = new Set();
const tmp = new THREE.Color();

function averageMapColor(map) {
  try {
    const img = map?.image;
    if (!img || !(img.width > 0)) return null;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
    if (!n) return null;
    return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch (_) { return null; }
}

function bake(model) {
  model.updateMatrixWorld(true);
  const positions = []; const normals = []; const colors = [];
  let tris = 0;
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isSkinnedMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mat = mats[0];
    const base = mat?.color ? mat.color.clone() : new THREE.Color(0x888888);
    const avg = mat?.map ? averageMapColor(mat.map) : null;
    if (avg) base.multiply(avg);
    const p = geo.getAttribute('position'); const n = geo.getAttribute('normal');
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(base.r, base.g, base.b);
    }
    tris += p.count / 3;
    geo.dispose();
  });
  if (!positions.length || tris > MAX_TRIS * 3) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function ensure(R) {
  for (const type of TYPES) {
    if (baked.has(type) || requested.has(type)) continue;
    const key = (window.__KANO_VEHICLE_MODEL_KEY && window.__KANO_VEHICLE_MODEL_KEY[type]) || type;
    requested.add(type);
    R.models.load(key).then(() => {
      const m = R.models.getInstance(key);
      if (!m) return;
      const g = bake(m);
      if (g) baked.set(type, g);
    }).catch(() => { requested.delete(type); });
  }
}

function swapBatches(R) {
  for (const [type, batch] of R._mobileTrafficBatches || []) {
    const g = baked.get(type);
    if (!g || !batch?.mesh || batch.mesh.geometry === g) continue;
    batch.mesh.geometry = g;
    batch.mesh.userData.kanoGlbBaked = true;
  }
}

if (typeof window !== 'undefined' && !window.__kanoMobileGlbTraffic) {
  window.__kanoMobileGlbTraffic = true;
  const patch = () => {
    const R = window.kanoRenderer;
    const proto = R && Object.getPrototypeOf(R);
    if (!proto || proto.__kanoGlbBatchPatched || typeof proto.getMobileTrafficBatch !== 'function') return false;
    proto.__kanoGlbBatchPatched = true;
    const original = proto.getMobileTrafficBatch;
    proto.getMobileTrafficBatch = function glbBatch(type, count) {
      const batch = original.call(this, type, count);
      const g = baked.get(type);
      if (g && batch?.mesh && batch.mesh.geometry !== g) {
        batch.mesh.geometry = g;
        batch.mesh.userData.kanoGlbBaked = true;
      }
      return batch;
    };
    return true;
  };
  setInterval(() => {
    try {
      const R = window.kanoRenderer;
      if (!R || !R.mobile || !R.models || document.hidden) return;
      patch();
      ensure(R);
      swapBatches(R);
    } catch (_) { /* optional */ }
  }, 1500);
}
