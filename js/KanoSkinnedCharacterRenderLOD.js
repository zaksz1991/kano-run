/**
 * KANO LIFE — mobile skinned-character render LOD.
 *
 * Far idle characters keep their actual GLB appearance, but their current
 * skeletal pose is baked to ordinary BufferGeometry. The original SkinnedMesh
 * remains in the scene hierarchy (so node transforms and visibility continue
 * to work) but is moved off the default camera layer. On approach, the static
 * child is removed and the untouched SkinnedMesh is restored.
 *
 * This module receives THREE from its caller so its policy can be tested in
 * Node without loading the browser's Three.js package.
 */

export const KANO_CHARACTER_STATIC_POSE_ENTER_DISTANCE = 40;
export const KANO_CHARACTER_STATIC_POSE_EXIT_DISTANCE = 32;
const CAMERA_DEFAULT_LAYER = 0;

export function chooseSkinnedCharacterRenderMode({
  mobile = false,
  role = 'walk',
  distanceSquared = NaN,
  staticPoseActive = false,
} = {}) {
  if (!mobile || role !== 'idle' || !Number.isFinite(Number(distanceSquared))) {
    return 'skinned';
  }

  const distanceSq = Math.max(0, Number(distanceSquared));
  const enterSq = KANO_CHARACTER_STATIC_POSE_ENTER_DISTANCE ** 2;
  const exitSq = KANO_CHARACTER_STATIC_POSE_EXIT_DISTANCE ** 2;

  if (staticPoseActive) return distanceSq <= exitSq ? 'skinned' : 'static-pose';
  return distanceSq >= enterSq ? 'static-pose' : 'skinned';
}

function materialList(material) {
  if (Array.isArray(material)) return material.filter(Boolean);
  return material ? [material] : [];
}

function hasMorphTargets(mesh) {
  const morphAttributes = mesh.geometry?.morphAttributes || {};
  if (Object.values(morphAttributes).some((attributes) => Array.isArray(attributes) && attributes.length > 0)) {
    return true;
  }
  return Array.isArray(mesh.morphTargetInfluences) && mesh.morphTargetInfluences.length > 0;
}

function canBakeSkinnedMesh(mesh) {
  const geometry = mesh?.geometry;
  if (!mesh?.isSkinnedMesh || !geometry?.getAttribute || !geometry?.clone) return false;
  if (!geometry.getAttribute('position') || !geometry.getAttribute('skinIndex') || !geometry.getAttribute('skinWeight')) return false;
  if (!mesh.skeleton?.update || typeof mesh.applyBoneTransform !== 'function') return false;
  if (hasMorphTargets(mesh)) return false;

  const materials = materialList(mesh.material);
  if (!materials.length) return false;
  // Tangent-space normal maps depend on a matching animated tangent frame.
  // Skip those assets rather than risk changing the GLB's surface appearance.
  if (materials.some((material) => material.normalMap)) return false;
  if (geometry.getAttribute('tangent')) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  return true;
}

function createStaticPoseMesh(source, THREE) {
  const geometry = source.geometry.clone();
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  source.skeleton.update();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    source.applyBoneTransform(index, vertex);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;

  // Skinning attributes are no longer needed once the pose is baked. Normals
  // are regenerated from the posed positions so static lighting stays valid.
  geometry.deleteAttribute('skinIndex');
  geometry.deleteAttribute('skinWeight');
  if (typeof geometry.computeVertexNormals === 'function') geometry.computeVertexNormals();
  geometry.computeBoundingBox?.();
  geometry.computeBoundingSphere?.();

  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.name = `${source.name || 'KanoCharacter'}__STATIC_POSE_LOD`;
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.matrix.identity();
  mesh.matrixAutoUpdate = true;
  mesh.layers.mask = source.layers?.mask ?? 1;
  mesh.renderOrder = source.renderOrder;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.frustumCulled = source.frustumCulled;
  mesh.visible = true;
  mesh.onBeforeRender = source.onBeforeRender;
  mesh.onAfterRender = source.onAfterRender;
  mesh.userData.kanoStaticPoseLod = true;
  return mesh;
}

/**
 * Bake every skinned mesh under one idle GLB root as a single atomic operation.
 * Unsupported meshes abort the conversion so the character never becomes a
 * mixture of frozen and animated body parts.
 */
export function bakeSkinnedCharacterStaticPose(root, THREE) {
  if (!root?.traverse || !THREE?.Mesh || !THREE?.Vector3) {
    return { applied: false, meshes: 0, reason: 'three-or-root-unavailable' };
  }
  if (root.userData?.kanoCharacterStaticPoseLodActive) {
    return { applied: true, meshes: Number(root.userData.kanoCharacterStaticPoseLodMeshes) || 0, alreadyApplied: true };
  }

  const sources = [];
  root.traverse((object) => {
    if (object?.isSkinnedMesh) sources.push(object);
  });
  if (!sources.length) return { applied: false, meshes: 0, reason: 'no-skinned-meshes' };

  const unsupported = sources.find((mesh) => !canBakeSkinnedMesh(mesh));
  if (unsupported) return { applied: false, meshes: 0, reason: 'unsupported-skinned-mesh' };

  root.updateMatrixWorld?.(true);
  const staged = [];
  try {
    for (const source of sources) staged.push({ source, mesh: createStaticPoseMesh(source, THREE) });
  } catch (error) {
    for (const entry of staged) entry.mesh.geometry?.dispose?.();
    return { applied: false, meshes: 0, reason: 'pose-bake-failed', error };
  }

  for (const { source, mesh } of staged) {
    const originalLayerMask = source.layers?.mask ?? 1;
    source.userData.kanoStaticPoseLodState = { mesh, originalLayerMask };
    // Keep the original node visible in the hierarchy so the static child
    // inherits all parent/node transforms. Only its render layer is disabled.
    source.layers?.disable?.(CAMERA_DEFAULT_LAYER);
    source.add(mesh);
  }

  root.userData ??= {};
  root.userData.kanoCharacterStaticPoseLodActive = true;
  root.userData.kanoCharacterStaticPoseLodMeshes = staged.length;
  root.updateMatrixWorld?.(true);
  return { applied: true, meshes: staged.length };
}

/** Restore untouched source SkinnedMeshes and dispose only the temporary pose geometries. */
export function restoreSkinnedCharacterPose(root) {
  if (!root?.traverse) return { restored: 0 };
  let restored = 0;
  root.traverse((source) => {
    if (!source?.isSkinnedMesh) return;
    const state = source.userData?.kanoStaticPoseLodState;
    if (!state) return;
    if (state.mesh?.parent === source) source.remove(state.mesh);
    state.mesh?.geometry?.dispose?.();
    if (source.layers && Number.isFinite(state.originalLayerMask)) {
      source.layers.mask = state.originalLayerMask;
    }
    delete source.userData.kanoStaticPoseLodState;
    restored += 1;
  });

  if (root.userData) {
    delete root.userData.kanoCharacterStaticPoseLodActive;
    delete root.userData.kanoCharacterStaticPoseLodMeshes;
  }
  root.updateMatrixWorld?.(true);
  return { restored };
}
