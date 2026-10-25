/** Convert shared road depth coordinates into junction-relative depth.
 * Positive values are before the junction; negative values are after it.
 */
export function computeKanoTrafficRelativeDepth(vehicleDepth, junctionDepth) {
  const vehicle = Number(vehicleDepth);
  const junction = Number(junctionDepth);
  if (!Number.isFinite(vehicle) || !Number.isFinite(junction)) return NaN;
  return vehicle - junction;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const t = clamp(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
};

export function computeKanoTrafficTurnFrame(relativeDepth, side, travelDirection = 1) {
  const approachDepth = 0.28;
  const exitDepth = -0.15;
  const progress = clamp((approachDepth - Number(relativeDepth)) / (approachDepth - exitDepth), 0, 1);
  const eased = smoothstep(progress);
  const direction = Number(side) < 0 ? -1 : 1;
  const travelSign = Number(travelDirection) < 0 ? -1 : 1;
  // Lateral offset is shared world X; yaw is relative to each vehicle's
  // forward axis, which reverses for oncoming traffic.
  const yawEnvelope = progress <= 0 || progress >= 1 ? 0 : Math.sin(progress * Math.PI);
  const rawYawDelta = -direction * travelSign * (Math.PI / 2) * yawEnvelope;
  const yawDelta = Math.abs(rawYawDelta) < 1e-12 ? 0 : rawYawDelta;
  return {
    progress,
    eased,
    lateralOffset: direction * 3 * eased,
    // Three.js rotation.y positive turns a -Z-facing vehicle toward world-left.
    yawDelta,
    complete: progress >= 1,
  };
}


/**
 * Stable per-vehicle/per-junction decision. This avoids a vehicle changing its
 * intended turn because frame timing or unrelated Math.random() calls changed.
 * Returns -1 (left), 1 (right), or 0 (continue straight).
 */
export function chooseKanoTrafficTurnSide(vehicleId, junctionKey, lane) {
  const currentLane = clamp(Math.round(Number(lane) || 0), 0, 2);
  const available = [];
  if (currentLane > 0) available.push(-1);
  if (currentLane < 2) available.push(1);
  if (!available.length) return 0;

  const key = `${String(vehicleId ?? 'traffic')}:${String(junctionKey ?? 'junction')}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 4294967296;
  if (unit >= 0.72) return 0;
  return available[Math.floor((unit / 0.72) * available.length)] || available[0];
}
