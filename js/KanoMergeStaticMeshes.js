/**
 * Draw-call saver for small procedural actors. Merges all plain Mesh children of
 * a group into ONE mesh using vertex colours (material colours are baked in), so
 * a goat made of 20 little meshes costs 1 draw call instead of 20.
 * Only direct Mesh children are merged; child Groups (animated legs, arms) are
 * left alone so their animation keeps working. Dependency-free (no addons).
 */
import * as THREE from 'three';

const vertexColorMaterials = new Map();
function sharedMaterial(source) {
  const key = `${Math.round((source?.roughness ?? 0.9) * 10)}|${source?.emissiveIntensity ? 'e' : 'n'}`;
  let m = vertexColorMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: source?.roughness ?? 0.9 });
    vertexColorMaterials.set(key, m);
  }
  return m;
}

export function mergeChildMeshes(group) {
  if (!group || !group.children) return null;
  const meshes = group.children.filter((c) => c.isMesh && !c.isSkinnedMesh && c.geometry?.attributes?.position
    && !Array.isArray(c.material) && !c.material?.map && !c.material?.transparent && !c.material?.isMeshBasicMaterial);
  if (meshes.length < 2) return null;
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let base = 0;
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);
    const color = mesh.material?.color || new THREE.Color(0x888888);
    const emissive = mesh.material?.emissive && mesh.material.emissiveIntensity
      ? mesh.material.emissive.clone().multiplyScalar(mesh.material.emissiveIntensity) : null;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        normals.push(v.x, v.y, v.z);
      } else normals.push(0, 1, 0);
      colors.push(
        Math.min(1, color.r + (emissive ? emissive.r : 0)),
        Math.min(1, color.g + (emissive ? emissive.g : 0)),
        Math.min(1, color.b + (emissive ? emissive.b : 0)),
      );
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i += 1) indices.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i += 1) indices.push(base + i);
    base += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  const result = new THREE.Mesh(merged, sharedMaterial(meshes[0].material));
  result.name = 'merged_static_parts';
  result.castShadow = false;
  result.receiveShadow = false;
  for (const mesh of meshes) group.remove(mesh);
  group.add(result);
  return result;
}

/** Merge the root's own meshes and every direct child group's meshes. */
export function mergeActor(root) {
  mergeChildMeshes(root);
  for (const child of [...root.children]) if (child.isGroup || child.type === 'Group') mergeChildMeshes(child);
  return root;
}

const KEEP_SEPARATE = /wheel|tyre|tire|(^|[^a-z])rim([^a-z]|$)|steer|handlebar|propeller|rotor|driver/i;

function keepSeparate(mesh, root) {
  for (let node = mesh; node && node !== root.parent; node = node.parent) {
    if (KEEP_SEPARATE.test(String(node.name || ''))) return true;
    if (node === root) break;
  }
  return false;
}

function materialSignature(mesh) {
  const m = mesh.material;
  const g = mesh.geometry;
  return [
    m.map?.uuid || '-', m.normalMap?.uuid || '-', m.color?.getHexString?.() || '-',
    m.emissive?.getHexString?.() || '-', m.emissiveMap?.uuid || '-',
    Math.round((m.roughness ?? 1) * 20), Math.round((m.metalness ?? 0) * 20),
    m.opacity ?? 1, m.transparent ? 't' : 'o', m.side ?? 0, m.alphaTest || 0,
    g.attributes.uv ? 'uv' : 'nouv', g.attributes.color ? 'vc' : 'novc', m.type,
  ].join('|');
}

/**
 * Merge a static, textured model's meshes that share a material into one mesh,
 * keeping textures and colours. A GLB split into 25 pieces that all use the same
 * atlas texture then costs 1-3 draw calls instead of 25. Wheels, doors, and
 * anything else that animates (see KEEP_SEPARATE) stay separate. Skinned
 * meshes are never touched.
 */
export function mergeTexturedByMaterial(root) {
  if (!root) return 0;
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return;
    if (Array.isArray(mesh.material) || !mesh.material) return;
    const g = mesh.geometry;
    if (!g?.attributes?.position || !g.attributes.normal) return;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    if (keepSeparate(mesh, root)) return;
    const sig = materialSignature(mesh);
    if (!buckets.has(sig)) buckets.set(sig, []);
    buckets.get(sig).push(mesh);
  });
  let removed = 0;
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const hasUv = Boolean(meshes[0].geometry.attributes.uv);
    const hasColor = Boolean(meshes[0].geometry.attributes.color);
    let vertexCount = 0;
    for (const mesh of meshes) vertexCount += mesh.geometry.attributes.position.count;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = hasUv ? new Float32Array(vertexCount * 2) : null;
    const colors = hasColor ? new Float32Array(vertexCount * 3) : null;
    const indices = [];
    let base = 0;
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      normalMatrix.getNormalMatrix(matrix);
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        positions.set([v.x, v.y, v.z], (base + i) * 3);
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        normals.set([v.x, v.y, v.z], (base + i) * 3);
        if (uvs) { const uv = geo.attributes.uv; uvs[(base + i) * 2] = uv.getX(i); uvs[(base + i) * 2 + 1] = uv.getY(i); }
        if (colors) { const c = geo.attributes.color; colors[(base + i) * 3] = c.getX(i); colors[(base + i) * 3 + 1] = c.getY(i); colors[(base + i) * 3 + 2] = c.getZ(i); }
      }
      // Mirrored transforms flip triangle winding.
      const flip = matrix.determinant() < 0;
      const count = geo.index ? geo.index.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const a = geo.index ? geo.index.getX(i) : i;
        const b = geo.index ? geo.index.getX(i + 1) : i + 1;
        const c = geo.index ? geo.index.getX(i + 2) : i + 2;
        if (flip) indices.push(base + a, base + c, base + b); else indices.push(base + a, base + b, base + c);
      }
      base += pos.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (uvs) merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    merged.setIndex(vertexCount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const result = new THREE.Mesh(merged, meshes[0].material);
    result.name = 'merged_by_material';
    root.add(result);
    for (const mesh of meshes) { mesh.parent?.remove(mesh); mesh.geometry.dispose?.(); removed += 1; }
  }
  return removed;
}
