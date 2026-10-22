/**
 * Scrolls a periodic instanced road pattern without rewriting every instance
 * matrix on every frame. Only an instance crossing the loop boundary is
 * updated; all instances are rewritten only when the root offset is rebased.
 *
 * The caller owns the mesh geometry/material and a reusable THREE.Object3D
 * scratch object. This module intentionally has no Three.js import so the
 * core arithmetic can be tested without creating a WebGL context.
 */
export function advanceInstancedRoadPattern({
  mesh,
  records,
  scroll,
  scratch,
  y,
  rotationX = 0,
  period = 250,
  frontLimit = 8,
  backLimit = -250,
}) {
  if (!mesh?.position || !Array.isArray(records) || !records.length || !scratch) {
    return 0;
  }

  const step = Number.isFinite(Number(scroll)) ? Number(scroll) : 0;
  const loop = Number.isFinite(period) && period > 0 ? period : 250;
  mesh.position.z += step;

  // Keep the root transform bounded. Moving local instance positions by the
  // same amount preserves every world position exactly during the rebase.
  const rebase = Math.trunc(mesh.position.z / loop) * loop;
  const fullRefresh = rebase !== 0;
  if (fullRefresh) {
    mesh.position.z -= rebase;
    for (const record of records) record.z += rebase;
  }

  let updatedCount = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const worldZ = record.z + mesh.position.z;
    let changed = fullRefresh;

    // Mirror the legacy per-instance wrap limits while leaving the common
    // scroll on the InstancedMesh object itself.
    if (worldZ > frontLimit) {
      record.z -= loop;
      changed = true;
    } else if (worldZ < backLimit) {
      record.z += loop;
      changed = true;
    }

    if (!changed) continue;

    scratch.position.set(record.x, y, record.z);
    scratch.rotation.set(rotationX, 0, 0);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
    updatedCount += 1;
  }

  if (updatedCount > 0 && mesh.instanceMatrix) {
    mesh.instanceMatrix.needsUpdate = true;
  }

  return updatedCount;
}
