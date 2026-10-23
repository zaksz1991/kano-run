/**
 * Captures a player's pose in the coordinate space of the parent that will
 * receive the recovery vehicle. This prevents a visibility recovery or
 * corrective reparent from teleporting the keke to the default spawn point.
 * The THREE namespace is injected so this module remains easy to test.
 */
function copyTuple(value, keys) {
  if (!value) return null;
  if (typeof value.clone === 'function') return value.clone();
  const out = {};
  for (const key of keys) out[key] = Number(value[key]);
  return out;
}

function tupleIsFinite(value, keys, maxAbs = 10000) {
  return Boolean(value) && keys.every((key) => {
    const number = Number(value[key]);
    return Number.isFinite(number) && Math.abs(number) <= maxAbs;
  });
}

/**
 * Returns local position/quaternion/scale for `targetParent`, or null when the
 * object's matrices are unavailable or invalid. Same-parent captures copy the
 * exact local pose; cross-parent captures convert the world matrix.
 */
export function capturePlayerKekeRecoveryPose(player, targetParent, THREE) {
  if (!player?.position || !player?.quaternion || !player?.scale) return null;

  const vectorKeys = ['x', 'y', 'z'];
  const quaternionKeys = ['x', 'y', 'z', 'w'];
  const sameParent = Boolean(targetParent) && player.parent === targetParent;

  if (sameParent || !targetParent) {
    const position = copyTuple(player.position, vectorKeys);
    const quaternion = copyTuple(player.quaternion, quaternionKeys);
    const scale = copyTuple(player.scale, vectorKeys);
    if (!tupleIsFinite(position, vectorKeys) ||
        !tupleIsFinite(quaternion, quaternionKeys, 2) ||
        !tupleIsFinite(scale, vectorKeys, 1000)) return null;
    return { position, quaternion, scale, source: 'same-parent-local' };
  }

  if (!THREE?.Matrix4 || !THREE?.Vector3 || !THREE?.Quaternion ||
      !player.matrixWorld || !targetParent.matrixWorld) return null;

  try {
    player.updateWorldMatrix?.(true, false);
    targetParent.updateWorldMatrix?.(true, false);
    const localMatrix = new THREE.Matrix4()
      .copy(targetParent.matrixWorld)
      .invert()
      .multiply(player.matrixWorld);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    localMatrix.decompose(position, quaternion, scale);

    if (!tupleIsFinite(position, vectorKeys) ||
        !tupleIsFinite(quaternion, quaternionKeys, 2) ||
        !tupleIsFinite(scale, vectorKeys, 1000)) return null;
    const quaternionLength = Math.hypot(
      quaternion.x, quaternion.y, quaternion.z, quaternion.w,
    );
    if (!Number.isFinite(quaternionLength) || quaternionLength < 1e-8) return null;
    quaternion.normalize?.();
    return { position, quaternion, scale, source: 'world-converted' };
  } catch {
    return null;
  }
}
