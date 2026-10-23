/**
 * Kano Life Step 101 — dependency-free traffic-flow and model-selection rules.
 */
export const KANO_FLOW_DIRECTIONS = Object.freeze(['same', 'oncoming']);

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * The current three-lane runner has no surveyed opposing-road graph. Keep the
 * left lane as the oncoming lane and the two right lanes as same-direction
 * traffic. A prior valid assignment is preserved during subsequent frames.
 */
export function flowDirectionForLane(lane, existing = null) {
  if (existing === 'same' || existing === 'oncoming') return existing;
  return Math.round(finiteNumber(lane, 1)) === 0 ? 'oncoming' : 'same';
}

/**
 * Relative screen-space speed for the runner camera: same-flow traffic should
 * close more slowly as the player overtakes; oncoming traffic closes quickly.
 */
export function relativeApproachDelta(playerSpeed, speedFactor = 1, direction = 'same') {
  const speed = Math.max(0, finiteNumber(playerSpeed, 0));
  const factor = Math.max(0.65, Math.min(1.25, finiteNumber(speedFactor, 1)));
  const flow = direction === 'oncoming' ? 1.52 : 0.43;
  return speed * factor * flow;
}

export function modelKeyForVehicle(type) {
  if (type === 'keke') return 'keke';
  if (type === 'motorcycle') return 'motorcycle';
  if (type === 'car') return 'car';
  return null;
}
