/**
 * Road paint depth fix. The lane dashes and the yellow/white edge lines are thin planes only
 * 1-3 cm above the asphalt. Close to the camera (especially near flyovers) the asphalt wins the
 * depth test and the paint vanishes, leaving a plain grey road with a hard seam in the distance.
 * Giving every paint mesh a depth bias makes it always draw on top of the asphalt.
 */
import * as THREE from 'three';

const SWEEP_MS = 1000;
const box = new THREE.Box3();

function isPaint(mesh) {
  if (mesh.name === 'KANO_INSTANCED_LANE_MARKINGS') return true;
  if (mesh.isInstancedMesh || mesh.isSkinnedMesh || !mesh.geometry) return false;
  box.setFromObject(mesh);
  const height = box.max.y - box.min.y;
  const length = box.max.z - box.min.z;
  return height < 0.06 && length > 60 && box.max.y > 0.004 && box.max.y < 0.06;
}

function bias(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material) continue;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -40;
    material.needsUpdate = true;
  }
  mesh.userData.kanoPaintBiased = true;
}

if (typeof window !== 'undefined' && !window.__kanoRoadPaintDepth) {
  window.__kanoRoadPaintDepth = true;
  window.setInterval(() => {
    const world = window.__KANO_ACTIVE_RENDERER__?.world;
    if (!world) return;
    world.traverse((node) => {
      if (!node.isMesh || node.userData.kanoPaintChecked) return;
      node.userData.kanoPaintChecked = true; // shape never changes, so each mesh is measured only once
      if (isPaint(node)) bias(node);
    });
  }, SWEEP_MS);
}
