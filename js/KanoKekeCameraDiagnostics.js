/**
 * Debug-only camera/frustum measurements for the active player keke.
 * This module does not alter transforms, visibility, materials or camera state.
 * Call it at a throttled cadence because Box3.setFromObject walks the model tree.
 */
function vectorRecord(vector) {
  if (!vector) return null;
  const x = Number(vector.x);
  const y = Number(vector.y);
  const z = Number(vector.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

export function measureKekeCameraDiagnostics(root, camera, THREE) {
  if (!root || !camera || typeof THREE?.Box3 !== 'function' || typeof THREE?.Vector3 !== 'function') {
    return {
      available: false,
      boundsValid: false,
      inFrustum: null,
      reason: 'camera-or-three-unavailable',
    };
  }

  try {
    // Synchronize matrices only; no position, scale, parent or camera setting is changed.
    root.updateWorldMatrix?.(true, true);
    camera.updateMatrixWorld?.(true);

    const bounds = new THREE.Box3().setFromObject(root);
    if (typeof bounds.isEmpty === 'function' && bounds.isEmpty()) {
      return {
        available: true,
        boundsValid: false,
        inFrustum: null,
        reason: 'empty-world-bounds',
      };
    }

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    let cameraWorldPosition = null;
    if (typeof camera.getWorldPosition === 'function') {
      cameraWorldPosition = camera.getWorldPosition(new THREE.Vector3());
    } else {
      cameraWorldPosition = camera.position || null;
    }

    const distanceToCenter = cameraWorldPosition && typeof center.distanceTo === 'function'
      ? center.distanceTo(cameraWorldPosition)
      : NaN;

    let inFrustum = null;
    let frustumReason = 'frustum-unavailable';
    if (typeof THREE.Matrix4 === 'function' && typeof THREE.Frustum === 'function' &&
        camera.projectionMatrix && camera.matrixWorldInverse) {
      const viewProjection = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      inFrustum = new THREE.Frustum()
        .setFromProjectionMatrix(viewProjection)
        .intersectsBox(bounds);
      frustumReason = inFrustum ? 'bounds-intersect-camera-frustum' : 'bounds-outside-camera-frustum';
    }

    return {
      available: true,
      boundsValid: true,
      boundsSize: vectorRecord(size),
      boundsCenter: vectorRecord(center),
      cameraWorldPosition: vectorRecord(cameraWorldPosition),
      distanceToCenter: Number.isFinite(distanceToCenter) ? distanceToCenter : null,
      inFrustum,
      reason: frustumReason,
    };
  } catch (error) {
    return {
      available: false,
      boundsValid: false,
      inFrustum: null,
      reason: 'measurement-error',
      error: String(error?.message || error).slice(0, 180),
    };
  }
}
