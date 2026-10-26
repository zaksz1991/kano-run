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
