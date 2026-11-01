/**
 * Draw-call saver for animated people. A character such as man-2.glb ships as 9 skinned
 * pieces (shirt, skin, pants, shoes, hair...) that each use one flat colour. Every piece
 * costs a draw call, and a handful of people on screen cost hundreds on a phone.
 * This bakes each flat colour into vertex colours and joins the pieces into ONE skinned
 * mesh, so a person is a single draw call. Skeleton, animation and look are unchanged.
 * Anything it cannot merge safely (textures, morph targets, different skeletons) is left alone.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeFlatSkinnedMeshes(root) {
  const skinned = [];
  root.traverse((node) => { if (node.isSkinnedMesh) skinned.push(node); });
  if (skinned.length < 2) return { merged: false, before: skinned.length, after: skinned.length };

  const first = skinned[0];
  const sameParent = skinned.every((mesh) => mesh.parent === first.parent);
  const sameSkeleton = skinned.every((mesh) => mesh.skeleton?.bones?.length === first.skeleton?.bones?.length
    && mesh.skeleton.bones.every((bone, i) => bone === first.skeleton.bones[i]));
  const sameMatrix = skinned.every((mesh) => mesh.matrix.equals(first.matrix));
  const flat = skinned.every((mesh) => {
    const material = Array.isArray(mesh.material) ? null : mesh.material;
    return material && !material.map && !material.normalMap && !material.alphaMap && !material.transparent
      && !mesh.geometry.morphAttributes?.position && mesh.geometry.attributes.skinIndex && mesh.geometry.attributes.skinWeight;
  });
  if (!sameParent || !sameSkeleton || !sameMatrix || !flat) return { merged: false, before: skinned.length, after: skinned.length };

  const geometries = skinned.map((mesh) => {
    const geometry = mesh.geometry.clone();
    const count = geometry.attributes.position.count;
    const color = mesh.material.color || new THREE.Color(1, 1, 1);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Keep only attributes every piece has, so the merge cannot fail on a stray uv set.
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(name)) geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return geometry;
  });

  const merged = mergeGeometries(geometries, false);
  if (!merged) return { merged: false, before: skinned.length, after: skinned.length };

  const reference = first.material;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: reference.roughness ?? 0.85,
    metalness: reference.metalness ?? 0,
    side: reference.side,
  });
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = `${first.name || 'person'}_merged`;
  mesh.matrix.copy(first.matrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.frustumCulled = false;
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);

  for (const piece of skinned) { piece.parent?.remove(piece); piece.geometry.dispose(); piece.material?.dispose?.(); }
  return { merged: true, before: skinned.length, after: 1 };
}
