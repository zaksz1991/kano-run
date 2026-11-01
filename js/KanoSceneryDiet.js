/**
 * Phone scenery diet. The Kano Lab on a Mali-G52 showed that hiding the roadside scenery
 * took the game from 6.5 to 15.5 FPS, and resolution made no difference: the phone is
 * limited by the NUMBER of objects drawn, not by pixels. A handful of buildings and
 * people were each made of 7 to 15 little meshes (about 270 draw calls in the scene).
 *
 * Every second, for any scenery group not yet processed, on phones:
 *   1. generated stand-in pedestrians (capsule people) are hidden. Only real GLB people stay.
 *   2. every flat-coloured, non-animated mesh in the group is baked into ONE vertex-coloured mesh
 *   3. textured pieces that share a material are joined (existing helper)
 * Look, size and positions are unchanged; only the draw-call count falls.
 */
import * as THREE from 'three';
import { mergeTexturedByMaterial } from './KanoMergeStaticMeshes.js';

const DONE = new WeakSet();
const SHARED = new Map();

function sharedMaterial(roughness) {
  const key = Math.round(roughness * 10);
  let material = SHARED.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness });
    SHARED.set(key, material);
  }
  return material;
}

export function mergeFlatDeep(group) {
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const meshes = [];
  group.traverse((node) => {
    if (node === group || !node.isMesh || node.isSkinnedMesh || node.isInstancedMesh) return;
    const material = node.material;
    if (!node.geometry?.attributes?.position || Array.isArray(material) || !material) return;
    if (material.map || material.alphaMap || material.transparent || material.isMeshBasicMaterial) return;
    if (material.emissive && material.emissiveIntensity && material.emissive.getHex() !== 0) return; // keep glowing lamps separate
    if (node.userData?.animated || node.userData?.kanoKeep) return;
    meshes.push(node);
  });
  if (meshes.length < 2) return 0;

  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const positions = []; const normals = []; const colors = []; const indices = [];
  let base = 0;
  let roughness = 0.9;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);
    const color = mesh.material.color || new THREE.Color(0x888888);
    roughness = mesh.material.roughness ?? roughness;
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      if (normal) { v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize(); normals.push(v.x, v.y, v.z); } else normals.push(0, 1, 0);
      colors.push(color.r, color.g, color.b);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i += 1) indices.push(base + geometry.index.getX(i));
    else for (let i = 0; i < position.count; i += 1) indices.push(base + i);
    base += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  const result = new THREE.Mesh(merged, sharedMaterial(roughness));
  result.name = 'merged_flat_scenery';
  for (const mesh of meshes) mesh.parent?.remove(mesh);
  group.add(result);
  return meshes.length - 1;
}

function countMeshes(group) {
  let n = 0;
  group.traverse((node) => { if (node.isMesh && node.visible) n += 1; });
  return n;
}

function sweep() {
  const R = window.__KANO_ACTIVE_RENDERER__;
  if (!R?.world || R.lifeScene !== 'road') return;
  for (const child of R.world.children) {
    if (child.userData?.fallbackPedestrian) { child.visible = false; continue; }
    if (DONE.has(child) || !child.isGroup && child.type !== 'Group') continue;
    if (/^KANO_(TWO_WAY|INSTANCED|PROCEDURAL)|KWANKWASIYYA|COINS/.test(child.name || '')) { DONE.add(child); continue; }
    if (countMeshes(child) < 3) { if (child.children.length) DONE.add(child); continue; }
    // Wait until a model that is still loading has filled the holder.
    if (child.userData?.pendingModel || child.userData?.kanoPendingPerson) continue;
    try {
      const before = countMeshes(child);
      const saved = mergeFlatDeep(child);
      try { mergeTexturedByMaterial(child); } catch (_) { /* optional */ }
      DONE.add(child);
      child.userData.kanoSceneryDiet = { before, after: countMeshes(child), saved };
      (window.kanoSceneryDietLog ||= []).push([child.name || child.userData?.modelKey || 'group', before, countMeshes(child)]);
    } catch (error) {
      DONE.add(child);
      console.debug('[Kano Life] scenery diet skipped a group', error?.message || error);
    }
  }
}

const isPhone = () => {
  try { return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; }
};
if (typeof window !== 'undefined' && isPhone()) window.setInterval(sweep, 1000);
