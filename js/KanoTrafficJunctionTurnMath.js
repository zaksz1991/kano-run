const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const t = clamp(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
};

export function computeKanoTrafficTurnFrame(relativeDepth, side) {
  const approachDepth = 0.28;
  const exitDepth = -0.15;
  const progress = clamp((approachDepth - Number(relativeDepth)) / (approachDepth - exitDepth), 0, 1);
  const eased = smoothstep(progress);
  const direction = Number(side) < 0 ? -1 : 1;
  // The vehicle yaws into the turn and straightens before leaving it. The
  // lateral curve reaches the target lane at the same time the offset resets.
  const yawEnvelope = progress <= 0 || progress >= 1 ? 0 : Math.sin(progress * Math.PI);
  return {
    progress,
    eased,
    lateralOffset: direction * 3 * eased,
    yawDelta: direction * (Math.PI / 2) * yawEnvelope,
    complete: progress >= 1,
  };
}
