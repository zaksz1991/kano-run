/** Pure movement rules shared by the Kano Life roadside-walker upgrade/tests. */
export const KANO_PEDESTRIAN_WALK_LIMITS = Object.freeze({
  maxDeltaSeconds: 0.05,
  nearbyDistance: 64,
  legInstanceBudget: Object.freeze({ low: 3, mid: 5, high: 7, desktop: 12 }),
});

export function clampWalkDeltaSeconds(value) {
  const delta = Number(value);
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return Math.min(KANO_PEDESTRIAN_WALK_LIMITS.maxDeltaSeconds, delta);
}

/** Each row of two walkers travels in the same direction; the next row opposes it. */
export function getPavementWalkDirection(index) {
  const safeIndex = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0;
  return Math.floor(safeIndex / 2) % 2 === 0 ? -1 : 1;
}

export function getPavementWalkSpeed(index) {
  const safeIndex = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0;
  return 0.62 + (safeIndex % 4) * 0.085;
}

export function advancePavementWalkerZ(z, direction, speed, deltaSeconds) {
  const position = Number(z);
  if (!Number.isFinite(position)) return 0;
  const sign = Number(direction) < 0 ? -1 : 1;
  const velocity = Number(speed);
  if (!Number.isFinite(velocity) || velocity < 0) return position;
  return position + sign * velocity * clampWalkDeltaSeconds(deltaSeconds);
}

export function getPavementGait(timeSeconds, phaseOffset = 0) {
  const time = Number(timeSeconds);
  const phase = (Number.isFinite(time) ? time : 0) * 7.1
    + (Number.isFinite(Number(phaseOffset)) ? Number(phaseOffset) : 0);
  const stride = Math.sin(phase) * 0.42;
  return {
    phase,
    leftLeg: stride,
    rightLeg: -stride,
    leftArm: -stride * 0.42,
    rightArm: stride * 0.42,
    bob: Math.max(0, Math.sin(phase * 2)) * 0.016,
    sway: Math.sin(phase) * 0.012,
  };
}

/** Select only nearby procedural walkers that do not already have authored legs. */
export function selectPavementLegWalkers(pedestrians, cameraZ, maxCount, maxDistance = KANO_PEDESTRIAN_WALK_LIMITS.nearbyDistance) {
  if (!Array.isArray(pedestrians)) return [];
  const zCamera = Number(cameraZ) || 0;
  const limit = Math.max(0, Math.floor(Number(maxCount) || 0));
  const range = Math.max(0, Number(maxDistance) || 0);
  if (!limit) return [];
  return pedestrians
    .filter((pedestrian) => {
      const actor = pedestrian?.actor;
      const z = Number(actor?.position?.z);
      const index = Number(pedestrian?.index);
      const authoredLegs = [2, 3].includes((Number.isFinite(index) ? index : 0) % 5);
      return Boolean(
        actor?.position
        && actor.userData?.fallbackPedestrian === true
        && !pedestrian?.usingModel
        && !authoredLegs
        && Number.isFinite(z)
        && Math.abs(z - zCamera) <= range,
      );
    })
    .sort((a, b) => Math.abs(a.actor.position.z - zCamera) - Math.abs(b.actor.position.z - zCamera))
    .slice(0, limit);
}
